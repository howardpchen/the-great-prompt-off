import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import {extractReportWithOpenRouter} from './openrouter';
import {beginBatch,providerMetric} from './provider-telemetry';
let lines:string[]=[];
beforeEach(()=>{lines=[];vi.stubGlobal('__promptOffProviderScheduler',undefined);vi.stubGlobal('__promptOffTiming',undefined);vi.stubEnv('OPENROUTER_API_KEY','DO_NOT_LOG_KEY');vi.stubEnv('OPENROUTER_CONCURRENCY','1');vi.spyOn(console,'info').mockImplementation((s:string)=>{lines.push(s);});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
const input={prompt:'DO_NOT_LOG_PROMPT',reportText:'DO_NOT_LOG_REPORT',model:'openai/gpt-oss-20b'};
const ok=()=>new Response(JSON.stringify({provider:'Groq',choices:[{finish_reason:'stop',message:{content:'{}'}}],usage:{prompt_tokens:10,completion_tokens:20,completion_tokens_details:{reasoning_tokens:5},cost:0.001}}));
it('separates queue and HTTP time and closes a batch without logging payloads',async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.stubGlobal('fetch',vi.fn(async()=>{await new Promise(r=>setTimeout(r,100));return ok();}));
 const done=beginBatch('b','public',2,20);
 const p=Promise.all([0,1].map(reportIndex=>extractReportWithOpenRouter(input,{trace:{batchId:'b',reportIndex}})));
 await vi.advanceTimersByTimeAsync(350);await p;done('completed');
 const events=lines.map(s=>JSON.parse(s));const reports=events.filter(e=>e.event==='report_end');expect(reports.map(e=>e.queueMs).sort((a,b)=>a-b)).toEqual([0,250]);
 expect(events.filter(e=>e.event==='http_end').map(e=>e.httpMs)).toEqual([100,100]);expect(events.find(e=>e.event==='batch_end').peakHttp).toBe(1);
 expect(events.find(e=>e.event==='admission')).toMatchObject({startIntervalMs:250});
 expect(events.find(e=>e.event==='http_end')).toMatchObject({provider:'Groq',status:200,inputTokens:10,reasoningTokens:5,costUsd:0.001});expect(lines.join('')).not.toContain('DO_NOT_LOG');
});
it('counts backoff and explicit throttle without logging provider error content',async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.spyOn(Math,'random').mockReturnValue(0);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('DO_NOT_LOG_ERROR',{status:429,headers:{'Retry-After':'0'}})).mockImplementationOnce(ok));
 const p=extractReportWithOpenRouter(input,{trace:{batchId:'retry'}});await vi.advanceTimersByTimeAsync(5100);await p;
 const events=lines.map(s=>JSON.parse(s));expect(events.find(e=>e.event==='retry').delayMs).toBe(5001);expect(events.find(e=>e.event==='report_end')).toMatchObject({attempts:2,retries:1,backoffMs:5001,outcome:'success'});expect(lines.join('')).not.toContain('DO_NOT_LOG');
});
it('records cancellation while queued with no phantom HTTP start',async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.stubGlobal('fetch',vi.fn(async()=>{await new Promise(r=>setTimeout(r,100));return ok();}));
 const first=extractReportWithOpenRouter(input);const controller=new AbortController();
 const second=extractReportWithOpenRouter({...input,signal:controller.signal},{trace:{batchId:'cancelled'}}).catch(()=>null);
 await vi.advanceTimersByTimeAsync(25);controller.abort();await second;await vi.advanceTimersByTimeAsync(100);await first;
 const events=lines.map(s=>JSON.parse(s));expect(events.find(e=>e.event==='queue_exit')).toMatchObject({batchId:'cancelled',queueWaitMs:25});expect(events.filter(e=>e.event==='http_start')).toHaveLength(1);
});
it('logging failures never change successful evaluation',async()=>{
 vi.spyOn(console,'info').mockImplementation(()=>{throw Error('logger offline');});vi.stubGlobal('fetch',vi.fn().mockImplementation(ok));
 expect(()=>providerMetric('test',{})).not.toThrow();await expect(extractReportWithOpenRouter(input)).resolves.toBe('{}');
});
