import { describe, it, expect } from "vitest";
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
    expect(tries).toBe(4); expect(waits).toEqual([3000,3000,4000]);
  });
  it("does not replay ambiguous failures or ignore long Retry-After", async () => {
    for (const error of [new Error("timeout"), new ProviderAdmissionError(61000)]) {
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
