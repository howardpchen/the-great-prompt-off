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

it("completes fifty 77-report submissions with bounded fanout and no queue overflow",async()=>{
 const scheduler=new ProviderScheduler(50);let peak=0,completed=0,maxWaiting=0;
 await Promise.all(Array.from({length:50},async(_,team)=>{
  let next=0;
  await Promise.all(Array.from({length:20},async()=>{
   while(next<77){const report=next++;await scheduler.run(async()=>{peak=Math.max(peak,scheduler.stats.active);maxWaiting=Math.max(maxWaiting,scheduler.stats.waiting);await sleep(1);completed++;},{group:`team-${team}`});expect(report).toBeLessThan(77);}
  }));
 }));
 expect(completed).toBe(3850);expect(peak).toBe(50);expect(maxWaiting).toBeLessThanOrEqual(950);expect(scheduler.stats).toEqual({active:0,waiting:0});
});
