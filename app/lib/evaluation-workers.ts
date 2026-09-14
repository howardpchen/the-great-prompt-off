/** Stop scheduling after failure, but drain admitted work before refunding an attempt. */
export async function mapWithConcurrency<T, R>(values: T[], concurrency: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0, failed = false;
  let firstError: unknown;
  async function worker() {
    while (!failed && nextIndex < values.length) {
      const index = nextIndex++;
      try { results[index] = await mapper(values[index]); }
      catch (error) { if (!failed) firstError = error; failed = true; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, worker));
  if (failed) throw firstError;
  return results;
}
