import { ProviderAdmissionError } from "./provider-retry";
/** Single app-process scheduler. Multi-replica deployments need distributed slots. */
export type AdmissionTiming = { queueWaitMs:number; active:number; waiting:number; ceiling:number; effective:number; startIntervalMs:number };
export type ProviderTaskOptions = { onAdmission?: (timing:AdmissionTiming)=>void; priority?: "scored" | "sandbox"; group?: string; signal?: AbortSignal };
type Waiter = { options: ProviderTaskOptions; grant: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>; abort: () => void };
export class ProviderScheduler {
  private active = 0;
  private waiting: Waiter[] = [];
  private groupTurns = new Map<string, number>();
  private turn = 0;
  private scoredStreak = 0;
  private effective: number;
  private epoch = 0;
  private successes = 0;
  private lastChange = Date.now();
  private cooldownUntil = 0;
  private wake?: ReturnType<typeof setTimeout>;
  private nextStartAt = 0;
  constructor(readonly limit: number, private readonly maxQueue = 1000, private readonly waitMs = 900000, private readonly adaptive = false, private readonly startIntervalMs = 0) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid provider concurrency");
    if (!Number.isFinite(startIntervalMs) || startIntervalMs < 0) throw new Error("Invalid provider start interval");
    this.effective = adaptive ? Math.min(20, limit) : limit;
  }
  get stats() { return { active: this.active, waiting: this.waiting.length }; }
  get adaptiveStats() { return { ceiling: this.limit, effective: this.effective, cooldownUntil: this.cooldownUntil, epoch: this.epoch }; }
  private feedback(error: unknown, epoch: number) {
    if (!this.adaptive) return;
    const now = Date.now();
    if (error instanceof ProviderAdmissionError) {
      // One decrease per admission generation: an entire in-flight burst must not
      // compound a single throttle into dozens of multiplicative decreases.
      if (epoch === this.epoch) {
        this.effective = Math.max(1, Math.floor(this.effective / 2));
        this.epoch++;
      }
      this.successes = 0;
      this.lastChange = now;
      this.cooldownUntil = Math.max(this.cooldownUntil, now + Math.max(5000, error.retryAfterMs || 0));
    } else if (error !== undefined) {
      this.successes = 0;
      this.lastChange = now;
    } else if (epoch === this.epoch && now >= this.cooldownUntil) {
      this.successes++;
      if (this.waiting.length && this.successes >= this.effective && now - this.lastChange >= 30000 && this.effective < this.limit) {
        this.effective++;
        this.epoch++;
        this.successes = 0;
        this.lastChange = now;
      }
    }
  }
  private next() {
    // One wake owns both pacing and cooldown. Recompute on every queue change,
    // completion and throttle; never reserve a slot while waiting for either.
    if (this.wake) { clearTimeout(this.wake); this.wake = undefined; }
    if (this.active >= this.effective || !this.waiting.length) return;
    const delay = Math.max(
      this.nextStartAt - performance.now(),
      this.adaptive ? this.cooldownUntil - Date.now() : 0,
      0,
    );
    if (delay > 0) {
      this.wake = setTimeout(() => { this.wake = undefined; this.next(); }, Math.min(2147483647, Math.ceil(delay)));
      return;
    }
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
    // Use dispatch time, not the previous deadline: delayed timers cannot catch up.
    this.nextStartAt = performance.now() + this.startIntervalMs;
    this.active++; chosen.grant(); this.next();
  }
  async run<T>(task: () => Promise<T>, options: ProviderTaskOptions = {}): Promise<T> {
    const queuedAt=performance.now();
    if (options.signal?.aborted) throw new Error("Evaluation cancelled.");
    if (this.waiting.length >= this.maxQueue) throw new Error("Provider queue is full; retry later.");
    await new Promise<void>((resolve, reject) => {
      const remove = (message: string) => {
        const index = this.waiting.indexOf(waiter);
        if (index < 0) return;
        this.waiting.splice(index, 1); clearTimeout(waiter.timer);
        options.signal?.removeEventListener("abort", waiter.abort); reject(new Error(message)); this.next();
      };
      const waiter: Waiter = {options, grant: resolve, reject, abort: () => remove("Evaluation cancelled."), timer: setTimeout(() => remove("Provider queue wait exceeded; retry later."), this.waitMs)};
      this.waiting.push(waiter); options.signal?.addEventListener("abort", waiter.abort, {once:true}); this.next();
    });
    try { options.onAdmission?.({queueWaitMs:Math.max(0,Math.round(performance.now()-queuedAt)),...this.stats,ceiling:this.limit,effective:this.effective,startIntervalMs:this.startIntervalMs}); } catch { /* Observability cannot break admission. */ }
    const epoch = this.epoch;
    try {
      if (options.signal?.aborted) throw new Error("Evaluation cancelled.");
      // Admission resumes in a microtask. Base spacing on invocation as well as
      // reservation, so delayed continuations cannot cause catch-up starts.
      this.nextStartAt = performance.now() + this.startIntervalMs;
      const result = await task();
      this.feedback(undefined, epoch);
      return result;
    } catch (error) {
      this.feedback(error, epoch);
      throw error;
    } finally { this.active--; this.next(); if (this.active === 0 && this.waiting.length === 0) { if (this.wake) { clearTimeout(this.wake); this.wake = undefined; } this.groupTurns.clear(); this.turn = 0; this.scoredStreak = 0; } }
  }
}
const shared = globalThis as typeof globalThis & { __promptOffProviderScheduler?: ProviderScheduler };
export function withProviderSlot<T>(limit: number, task: () => Promise<T>, options: ProviderTaskOptions = {}): Promise<T> {
  let scheduler = shared.__promptOffProviderScheduler;
  if (!scheduler || (scheduler.limit !== limit && scheduler.stats.active === 0 && scheduler.stats.waiting === 0)) shared.__promptOffProviderScheduler = scheduler = new ProviderScheduler(limit, 1000, 900000, true, 250);
  if (scheduler.limit !== limit) return Promise.reject(new Error("Provider limit changed while evaluations are active."));
  return scheduler.run(task, options);
}
