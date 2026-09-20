/** Retry only explicit admission failures, never ambiguous timeouts or invalid output. */
function safeRetryDelay(delay: number | null, now: number): number | null {
  // Untrusted headers must not create an infinite/unrepresentable global deadline.
  return delay !== null && Number.isFinite(delay) && delay >= 0 && Number.isSafeInteger(Math.ceil(now + delay)) ? delay : null;
}
export class ProviderAdmissionError extends Error {
  readonly retryAfterMs: number | null;
  constructor(delay: number | null) {
    super("Provider temporarily rate-limited this request.");
    this.retryAfterMs = safeRetryDelay(delay, Date.now());
  }
}
export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value?.trim()) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return safeRetryDelay(seconds * 1000, now);
  const date = Date.parse(value);
  return Number.isFinite(date) ? safeRetryDelay(Math.max(0, date - now), now) : null;
}
async function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Evaluation cancelled.");
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(new Error("Evaluation cancelled.")); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export async function withAdmissionRetry<T>(attempt: () => Promise<T>, options: {
  signal?: AbortSignal;
  onRetry?: (delayMs: number, attempt: number) => void;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
} = {}): Promise<T> {
  let waited = 0;
  for (let retry = 0; ; retry++) {
    if (options.signal?.aborted) throw new Error("Evaluation cancelled.");
    try { return await attempt(); }
    catch (error) {
      if (!(error instanceof ProviderAdmissionError) || retry >= 3) throw error;
      const base = [5000, 15000, 30000][retry];
      // Positive jitter also spreads clients receiving the same Retry-After.
      const jitter = 1 + Math.floor((options.random || Math.random)() * 1000);
      const delay = Math.max(error.retryAfterMs || 0, base) + jitter;
      // Never retry earlier than Retry-After. Surface long throttles instead of ignoring them.
      if (waited + delay > 120000) throw error;
      waited += delay;
      options.onRetry?.(delay, retry + 1);
      await (options.wait || sleep)(delay, options.signal);
    }
  }
}
