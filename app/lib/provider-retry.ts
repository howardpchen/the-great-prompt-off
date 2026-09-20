/** Retry only explicit admission failures, never ambiguous timeouts or invalid output. */
export class ProviderAdmissionError extends Error {
  constructor(readonly retryAfterMs: number | null) { super("Provider temporarily rate-limited this request."); }
}
export function retryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
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
      const backoff = 1000 * 2 ** retry + Math.floor((options.random || Math.random)() * 500);
      const delay = Math.max(error.retryAfterMs || 0, backoff);
      // Never retry earlier than Retry-After. Surface long throttles instead of ignoring them.
      if (waited + delay > 60000) throw error;
      waited += delay;
      options.onRetry?.(delay, retry + 1);
      await (options.wait || sleep)(delay, options.signal);
    }
  }
}
