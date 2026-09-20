import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderScheduler } from "./provider-concurrency";
import { ProviderAdmissionError } from "./provider-retry";
afterEach(() => vi.useRealTimers());
describe("adaptive provider admission", () => {
 it("reduces once for an in-flight burst, honors Retry-After and recovers cautiously", async () => {
  vi.useFakeTimers();
  const s = new ProviderScheduler(50, 1000, 900000, true);
  const failures = Array.from({length:20}, () => s.run(async () => {
   await new Promise(r => setTimeout(r, 10));
   throw new ProviderAdmissionError(15000);
  }).catch(() => undefined));
  await vi.advanceTimersByTimeAsync(10);
  await Promise.all(failures);
  expect(s.adaptiveStats.effective).toBe(10);
  let started = 0;
  const work = Array.from({length:100}, () => s.run(async () => {
   started++; await new Promise(r => setTimeout(r, 1000));
  }));
  await vi.advanceTimersByTimeAsync(14999);
  expect(started).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(started).toBe(10);
  await vi.advanceTimersByTimeAsync(10000);
  await Promise.all(work);
  expect(s.adaptiveStats.effective).toBe(10);
  // A clean window plus demand allows just one additive increase.
  await vi.advanceTimersByTimeAsync(10000);
  const recovery = Array.from({length:50}, () => s.run(async () => {
   await new Promise(r => setTimeout(r, 100));
  }));
  await vi.advanceTimersByTimeAsync(1000);
  await Promise.all(recovery);
  expect(s.adaptiveStats.effective).toBe(11);
  expect(s.stats).toEqual({active:0,waiting:0});
 });
 it("does not abort admitted calls and cancels waiting work during cooldown", async () => {
  vi.useFakeTimers();
  const s = new ProviderScheduler(2, 1000, 900000, true);
  let release!: () => void;
  const ongoing = s.run(() => new Promise<void>(r => { release = r; }));
  const fail = s.run(async () => { throw new ProviderAdmissionError(null); }).catch(() => undefined);
  await vi.advanceTimersByTimeAsync(0); await fail;
  expect(s.adaptiveStats.effective).toBe(1);
  const abort = new AbortController();
  const queued = s.run(async () => { throw new Error("must not start"); }, {signal:abort.signal}).catch(e => e.message);
  abort.abort();
  expect(await queued).toContain("cancelled");
  release(); await ongoing;
  expect(s.stats.active).toBe(0);
 });
 it("does not reduce for authentication/ambiguous errors and never exceeds the ceiling", async () => {
  vi.useFakeTimers();
  const s = new ProviderScheduler(2,1000,900000,true);
  await expect(s.run(async () => { throw new Error("401"); })).rejects.toThrow("401");
  expect(s.adaptiveStats.effective).toBe(2);
  await vi.advanceTimersByTimeAsync(31000);
  await Promise.all(Array.from({length:10}, () => s.run(async () => 1)));
  expect(s.adaptiveStats.effective).toBe(2);
 });
});

it("reaches fifty only through sustained clean demand and can decrease again after recovery", async () => {
 vi.useFakeTimers();
 const s = new ProviderScheduler(50,1000,900000,true);
 for(let window=0;window<35;window++){
  await vi.advanceTimersByTimeAsync(30001);
  const tasks=Array.from({length:100},()=>s.run(async()=>{await new Promise(r=>setTimeout(r,1));}));
  await vi.advanceTimersByTimeAsync(100);
  await Promise.all(tasks);
  expect(s.adaptiveStats.effective).toBe(Math.min(50,21+window));
 }
 expect(s.adaptiveStats.effective).toBe(50);
 await expect(s.run(async()=>{throw new ProviderAdmissionError(null);})).rejects.toThrow("rate-limited");
 expect(s.adaptiveStats.effective).toBe(25);
 expect(s.stats).toEqual({active:0,waiting:0});
});
