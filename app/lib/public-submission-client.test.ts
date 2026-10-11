import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {pendingPublicSubmission,submitPublicWithProgress,waitForPublicSubmission} from './public-submission-client';
const storage=new Map<string,string>();
const progress=vi.fn();
const options={participantCode:'P001',participantToken:'synthetic',contestId:'11111111-1111-4111-8111-111111111111',prompt:'Synthetic instructions',schemaVersion:1,onProgress:progress};
beforeEach(()=>{storage.clear();progress.mockClear();vi.useFakeTimers();vi.stubGlobal('window',{localStorage:{getItem:(k:string)=>storage.get(k)??null,setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)}});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('queues once, displays retries, reconnects after GET failure, and returns the saved result',async()=>{
 let posts=0,gets=0;vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){posts++;return Response.json({state:'queued'},{status:202});}
  gets++;if(gets===1)return Response.json({state:'retrying',progress:{completedReports:2,totalReports:20}});
  if(gets===2)throw Error('offline');
  return Response.json({state:'completed',result:{score:80},instructions:'Original submitted instructions'});
 }));
 const task=submitPublicWithProgress(options);await vi.waitFor(()=>expect(fetch).toHaveBeenCalled());await vi.runAllTimersAsync();
 expect(await task).toEqual({score:{score:80},instructions:'Original submitted instructions'});expect(posts).toBe(1);
 expect(progress.mock.calls.flat().join(' ')).toContain('Retrying automatically');expect(progress.mock.calls.flat().join(' ')).toContain('Reconnecting');
 expect(pendingPublicSubmission(options.contestId,options.participantCode)).toBeNull();
});
it('recovers a lost POST response without ever reposting or consuming a second attempt',async()=>{
 let posts=0;vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){posts++;throw Error('lost after server admitted request');}
  return Response.json({state:'completed',result:{score:75}});
 }));
 expect((await submitPublicWithProgress(options)).score).toEqual({score:75});expect(posts).toBe(1);
});
it('keeps the request pointer on navigation and resumes it with GET only',async()=>{
 const abort=new AbortController();let posts=0;
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){posts++;return Response.json({state:'queued'},{status:202});}
  return Response.json({state:'processing'});
 }));
 const rejected=expect(submitPublicWithProgress({...options,signal:abort.signal})).rejects.toMatchObject({name:'AbortError'});
 await vi.advanceTimersByTimeAsync(1);abort.abort();await rejected;
 const pending=pendingPublicSubmission(options.contestId,options.participantCode);expect(pending).not.toBeNull();
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({state:'completed',result:{score:90}})));
 expect((await waitForPublicSubmission(pending!,options)).score).toEqual({score:90});expect(posts).toBe(1);
});
it('shows a terminal failure and does not automatically replay the batch',async()=>{
 let posts=0;vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){posts++;return Response.json({state:'queued'},{status:202});}
  return Response.json({state:'failed',error:'No test attempt was used.'});
 }));
 await expect(submitPublicWithProgress(options)).rejects.toThrow('No test attempt');expect(posts).toBe(1);expect(storage.size).toBe(0);
});
it('keeps unresolved work fenced when a worker is stalled',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='POST'?Response.json({state:'queued'},{status:202}):Response.json({state:'stalled',error:'Ask the organizer before trying again.'})));
 await expect(submitPublicWithProgress(options)).rejects.toThrow('organizer');expect(pendingPublicSubmission(options.contestId,options.participantCode)).not.toBeNull();
});
