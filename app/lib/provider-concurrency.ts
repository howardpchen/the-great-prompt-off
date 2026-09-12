/** Shared within the single deployed application process; queue has a bounded wait. */
let active = 0;
const waiters: Array<() => void> = [];
export async function withProviderSlot<T>(limit: number, task: () => Promise<T>): Promise<T> {
  if (active >= limit) await new Promise<void>((resolve, reject) => {
    const ready = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => { const i = waiters.indexOf(ready); if (i >= 0) waiters.splice(i, 1); reject(new Error("Provider queue wait exceeded; retry later.")); }, 60000);
    waiters.push(ready);
  });
  else active++;
  try { return await task(); }
  finally { const next = waiters.shift(); if (next) next(); else active--; }
}
