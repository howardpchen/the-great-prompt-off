import { describe,it,expect } from "vitest";
import { ProviderScheduler } from "./provider-concurrency";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
describe("shared report scheduler",()=>{
 it("bounds all fifty teams and drains failures",async()=>{
  const scheduler=new ProviderScheduler(5,300);let active=0,peak=0;
  const tasks=Array.from({length:250},(_,i)=>scheduler.run(async()=>{active++;peak=Math.max(peak,active);await sleep(2);active--;if(i%13===0)throw new Error("stub failure");return i;},{priority:"sandbox",group:`team-${Math.floor(i/5)}`}));
  const results=await Promise.allSettled(tasks);expect(results).toHaveLength(250);expect(peak).toBe(5);expect(scheduler.stats).toEqual({active:0,waiting:0});
 });
 it("interleaves teams, prioritizes scored work without starving sandbox",async()=>{
  const scheduler=new ProviderScheduler(1);const order:string[]=[];
  const tasks=["A","A","A","B","B","S","S","S","S"].map(g=>scheduler.run(async()=>{order.push(g);await sleep(1);},{priority:g==="S"?"scored":"sandbox",group:g}));
  await Promise.all(tasks);expect(order.slice(0,5)).toEqual(["A","S","S","S","B"]);expect(order.indexOf("B")).toBeLessThan(order.lastIndexOf("A"));
 });
 it("removes aborted and expired queue entries and rejects overload",async()=>{
  const scheduler=new ProviderScheduler(1,1,5);let release!:()=>void;
  const running=scheduler.run(()=>new Promise<void>(r=>release=r));await sleep(1);
  const abort=new AbortController();const queued=scheduler.run(async()=>{}, {signal:abort.signal});
  await expect(scheduler.run(async()=>{})).rejects.toThrow("full");abort.abort();await expect(queued).rejects.toThrow("cancelled");
  await expect(scheduler.run(async()=>{})).rejects.toThrow("wait exceeded");release();await running;expect(scheduler.stats).toEqual({active:0,waiting:0});
 });
});
