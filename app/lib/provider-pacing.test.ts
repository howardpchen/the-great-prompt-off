import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProviderScheduler,withProviderSlot} from './provider-concurrency';
import {ProviderAdmissionError,withAdmissionRetry} from './provider-retry';
beforeEach(()=>vi.useFakeTimers({toFake:['setTimeout','clearTimeout','Date','performance']}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const spaced=(starts:number[])=>{for(let i=1;i<starts.length;i++)expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(250);};
it('drains 100 queued reports at a strict paced ceiling of10 without leaked timers',async()=>{
 const s=new ProviderScheduler(10,1000,900000,true,250), starts:number[]=[];let peak=0;
 const work=Array.from({length:100},(_,i)=>s.run(async()=>{starts.push(performance.now());peak=Math.max(peak,s.stats.active);await new Promise(r=>setTimeout(r,3000));return i;},{group:`team-${i%5}`,priority:i%4?'scored':'sandbox'}));
 await vi.runAllTimersAsync();expect(await Promise.all(work)).toHaveLength(100);expect(peak).toBe(10);spaced(starts);
 expect(s.stats).toEqual({active:0,waiting:0});expect(vi.getTimerCount()).toBe(0);
});
it('keeps the pacing deadline across idle gaps and cancelled/expired waits',async()=>{
 const s=new ProviderScheduler(10,1000,100,false,250),starts:number[]=[];
 const task=async()=>{starts.push(performance.now());};await s.run(task);
 const abort=new AbortController();const cancelled=s.run(task,{signal:abort.signal}).catch(e=>e.message);abort.abort();expect(await cancelled).toContain('cancelled');
 const expired=s.run(task).catch(e=>e.message);await vi.advanceTimersByTimeAsync(100);expect(await expired).toContain('wait exceeded');expect(vi.getTimerCount()).toBe(0);
 await vi.advanceTimersByTimeAsync(100);const next=s.run(task);await vi.advanceTimersByTimeAsync(49);expect(starts).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(1);await next;expect(starts).toEqual([0,250]);
});
it('does not burst when cooldown expires and halves concurrency on a throttle',async()=>{
 const s=new ProviderScheduler(10,1000,900000,true,250), starts:number[]=[];
 await s.run(async()=>{starts.push(performance.now());throw new ProviderAdmissionError(8000);}).catch(()=>{});
 const tasks=Array.from({length:30},()=>s.run(async()=>{starts.push(performance.now());await new Promise(r=>setTimeout(r,2000));}));
 expect(s.adaptiveStats.effective).toBe(5);await vi.advanceTimersByTimeAsync(7999);expect(starts).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(1);expect(starts).toEqual([0,8000]);await vi.runAllTimersAsync();await Promise.all(tasks);spaced(starts);expect(s.stats).toEqual({active:0,waiting:0});
});
it('preserves group rotation and bounded Sandbox priority',async()=>{
 const s=new ProviderScheduler(10,1000,900000,true,250),order:string[]=[];
 await s.run(async()=>{});
 const tasks=['a','a','a','b','b','b','sandbox','sandbox'].map(group=>s.run(async()=>{order.push(group);},{group,priority:group==='sandbox'?'sandbox':'scored'}));
 await vi.runAllTimersAsync();await Promise.all(tasks);
 expect(order).toEqual(['a','b','a','sandbox','b','a','b','sandbox']);
});
it('the production singleton paces across callers, including retry-style re-admission',async()=>{
 vi.stubGlobal('__promptOffProviderScheduler',undefined);const starts:number[]=[];
 const call=()=>withProviderSlot(10,async()=>{starts.push(performance.now());});
 await call();const second=call();const third=call();await vi.runAllTimersAsync();await Promise.all([second,third]);
 const retry=call();await vi.runAllTimersAsync();await retry;expect(starts).toEqual([0,250,500,750]);
});

it('retries release slots and rejoin the same paced scheduler after backoff',async()=>{
 const s=new ProviderScheduler(10,1000,900000,true,250), starts:number[]=[];let attempt=0;
 const retry=withAdmissionRetry(()=>s.run(async()=>{starts.push(performance.now());if(++attempt===1)throw new ProviderAdmissionError(null);return 'done';}),{random:()=>0});
 await vi.advanceTimersByTimeAsync(1);expect(s.stats.active).toBe(0);
 const others=Array.from({length:3},()=>s.run(async()=>{starts.push(performance.now());}));
 await vi.runAllTimersAsync();expect(await retry).toBe('done');await Promise.all(others);spaced(starts);expect(starts[1]).toBe(5000);expect(attempt).toBe(2);expect(vi.getTimerCount()).toBe(0);
});

it('does not bank start credits when a wake is delayed',async()=>{
 const s=new ProviderScheduler(10,1000,900000,true,250),starts:number[]=[];
 let clock=0;const spy=vi.spyOn(performance,'now').mockImplementation(()=>clock);
 const tasks=Array.from({length:5},()=>s.run(async()=>{starts.push(clock);}));
 await vi.advanceTimersByTimeAsync(0);expect(starts).toEqual([0]);
 // Model a stalled event loop: its next callback observes a much later clock.
 clock=10000;await vi.advanceTimersByTimeAsync(250);expect(starts).toEqual([0,10000]);
 for(let i=0;i<3;i++){clock+=250;await vi.advanceTimersByTimeAsync(250);}
 await Promise.all(tasks);spaced(starts);spy.mockRestore();expect(vi.getTimerCount()).toBe(0);
});
