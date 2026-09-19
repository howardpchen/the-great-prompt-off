/** Single app-process scheduler. Multi-replica deployments need distributed slots. */
export type ProviderTaskOptions = { priority?: "scored" | "sandbox"; group?: string; signal?: AbortSignal };
type Waiter = { options: ProviderTaskOptions; grant: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; abort: () => void };
export class ProviderScheduler {
  private active = 0;
  private waiting: Waiter[] = [];
  private groupTurns = new Map<string, number>();
  private turn = 0;
  private scoredStreak = 0;
  constructor(readonly limit: number, private readonly maxQueue = 1000, private readonly waitMs = 900000) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Invalid provider concurrency");
  }
  get stats() { return { active: this.active, waiting: this.waiting.length }; }
  private next() {
    if (this.active >= this.limit || !this.waiting.length) return;
    const hasSandbox = this.waiting.some(w => w.options.priority === "sandbox");
    const hasScored = this.waiting.some(w => w.options.priority !== "sandbox");
    const sandbox = hasSandbox && (!hasScored || this.scoredStreak >= 3);
    const candidates = this.waiting.filter(w => (w.options.priority === "sandbox") === sandbox);
    const groupKey = (w: Waiter) => `${sandbox ? "sandbox" : "scored"}:${w.options.group || "default"}`;
    const chosen = candidates.reduce((best, w) =>
      (this.groupTurns.get(groupKey(w)) || 0) < (this.groupTurns.get(groupKey(best)) || 0) ? w : best
    );
    this.waiting.splice(this.waiting.indexOf(chosen), 1);
    clearTimeout(chosen.timer); chosen.options.signal?.removeEventListener("abort", chosen.abort);
    this.groupTurns.set(groupKey(chosen), ++this.turn);
    this.scoredStreak = sandbox ? 0 : this.scoredStreak + 1;
    this.active++; chosen.grant(); this.next();
  }
  async run<T>(task: () => Promise<T>, options: ProviderTaskOptions = {}): Promise<T> {
    if (options.signal?.aborted) throw new Error("Evaluation cancelled.");
    if (this.waiting.length >= this.maxQueue) throw new Error("Provider queue is full; retry later.");
    await new Promise<void>((resolve, reject) => {
      const remove = (message: string) => {
        const index = this.waiting.indexOf(waiter);
        if (index < 0) return;
        this.waiting.splice(index, 1); clearTimeout(waiter.timer);
        options.signal?.removeEventListener("abort", waiter.abort); reject(new Error(message));
      };
      const waiter: Waiter = {options, grant: resolve, reject, abort: () => remove("Evaluation cancelled."), timer: setTimeout(() => remove("Provider queue wait exceeded; retry later."), this.waitMs)};
      this.waiting.push(waiter); options.signal?.addEventListener("abort", waiter.abort, {once:true}); this.next();
    });
    try {
      if (options.signal?.aborted) throw new Error("Evaluation cancelled.");
      return await task();
    } finally { this.active--; this.next(); if (this.active === 0 && this.waiting.length === 0) { this.groupTurns.clear(); this.turn = 0; this.scoredStreak = 0; } }
  }
}
const shared = globalThis as typeof globalThis & { __promptOffProviderScheduler?: ProviderScheduler };
export function withProviderSlot<T>(limit: number, task: () => Promise<T>, options: ProviderTaskOptions = {}): Promise<T> {
  let scheduler = shared.__promptOffProviderScheduler;
  if (!scheduler || (scheduler.limit !== limit && scheduler.stats.active === 0 && scheduler.stats.waiting === 0)) shared.__promptOffProviderScheduler = scheduler = new ProviderScheduler(limit);
  if (scheduler.limit !== limit) return Promise.reject(new Error("Provider limit changed while evaluations are active."));
  return scheduler.run(task, options);
}
