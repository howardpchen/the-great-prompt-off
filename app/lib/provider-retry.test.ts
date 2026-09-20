import { describe, it, expect, vi } from "vitest";
import { ProviderAdmissionError, retryAfterMs, withAdmissionRetry } from "./provider-retry";
import { ProviderScheduler } from "./provider-concurrency";
describe("provider backoff", () => {
  it("honors seconds and HTTP dates", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("Thu, 01 Jan 1970 00:00:05 GMT", 1000)).toBe(4000);
    expect(retryAfterMs("invalid")).toBeNull();
  });
  it("backs off, requeues, and caps retries without holding a slot", async () => {
    const scheduler = new ProviderScheduler(20); let tries = 0; const waits: number[] = [];
    await expect(withAdmissionRetry(() => scheduler.run(async () => {
      tries++; throw new ProviderAdmissionError(3000);
    }), { random: () => 0, wait: async ms => {
      waits.push(ms); expect(scheduler.stats).toEqual({active:0,waiting:0});
    }})).rejects.toThrow("rate-limited");
    expect(tries).toBe(4); expect(waits).toEqual([5001,15001,30001]);
  });
  it("does not replay ambiguous failures or ignore long Retry-After", async () => {
    for (const error of [new Error("timeout"), new ProviderAdmissionError(120001)]) {
      let tries = 0;
      await expect(withAdmissionRetry(async () => { tries++; throw error; })).rejects.toBe(error);
      expect(tries).toBe(1);
    }
  });
  it("drains 150 reports for 50 teams with a shared 20-slot ceiling despite throttling", async () => {
    const scheduler = new ProviderScheduler(20); let active=0,peak=0; const calls=new Map<number,number>();
    const results=await Promise.all(Array.from({length:150},(_,i)=>withAdmissionRetry(()=>scheduler.run(async()=>{
      active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;
      const count=(calls.get(i)||0)+1;calls.set(i,count);
      if(count===1 && i%5===0)throw new ProviderAdmissionError(0);
      return i;
    },{group:`team-${Math.floor(i/3)}`,priority:i%2?"sandbox":"scored"}),{wait:async()=>{}})));
    expect(new Set(results).size).toBe(150);expect(peak).toBe(20);expect(scheduler.stats).toEqual({active:0,waiting:0});
    expect([...calls.values()].reduce((a,b)=>a+b,0)).toBe(180);
  });
});

it("honors a long provider minimum and stops at the cumulative wait budget", async () => {
  const waits: number[]=[];let attempts=0;
  await expect(withAdmissionRetry(async()=>{attempts++;throw new ProviderAdmissionError(60000);},{random:()=>0,wait:async ms=>{waits.push(ms);}})).rejects.toThrow();
  expect(waits).toEqual([60001]);expect(attempts).toBe(2);
});
it("cancels during backoff without replay", async()=>{
  vi.useFakeTimers(); const abort=new AbortController();let attempts=0;
  const promise=withAdmissionRetry(async()=>{attempts++;throw new ProviderAdmissionError(null);},{signal:abort.signal});
  const assertion=expect(promise).rejects.toThrow("cancelled");
  await vi.advanceTimersByTimeAsync(1);abort.abort();await assertion;
  await vi.runAllTimersAsync();expect(attempts).toBe(1);vi.useRealTimers();
});

it("rejects unrepresentable retry deadlines without poisoning adaptive admission", async () => {
  for (const value of ["1e308", "1e309", "9007199254741"]) expect(retryAfterMs(value)).toBeNull();
  expect(retryAfterMs("180")).toBe(180000);
  vi.useFakeTimers();
  try {
    for (const delay of [retryAfterMs("1e308"), Infinity, Number.MAX_VALUE]) {
      const scheduler = new ProviderScheduler(20, 1000, 900000, true);
      await expect(scheduler.run(async () => { throw new ProviderAdmissionError(delay); })).rejects.toThrow("rate-limited");
      expect(Number.isFinite(scheduler.adaptiveStats.cooldownUntil)).toBe(true);
      const next = scheduler.run(async () => "resumed");
      await vi.advanceTimersByTimeAsync(5000);
      await expect(next).resolves.toBe("resumed");
    }
  } finally { vi.useRealTimers(); }
});
