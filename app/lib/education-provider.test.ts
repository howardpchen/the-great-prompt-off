import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ProviderOutputError, extractReportWithOpenRouter, getOpenRouterConcurrency, getOpenRouterSubmissionConcurrency } from "./openrouter";
import { twelveBinaryTemplate } from "./contest-schema-fixtures";
const mode = { ...twelveBinaryTemplate, education: {version:1 as const,pipeline:"structured-v1" as const,baselineInstructions:"Use explicit evidence."} };
beforeEach(() => { vi.stubGlobal("__promptOffProviderScheduler", undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
it("requests constrained decisions and never rescues malformed output", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-only-never-real");
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices:[{message:{content:"{}"}}] }), {status:200}));
  vi.stubGlobal("fetch", fetcher);
  await expect(extractReportWithOpenRouter({mode,prompt:"brief",reportText:"synthetic",model:"test/model"})).rejects.toThrow("field set");
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.provider.require_parameters).toBe(true);
  expect(body.max_tokens).toBeGreaterThan(300);
  expect(body.messages[0].content).not.toContain("usable strategy");
});
it("preserves an all-abstention response without inventing answers", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-only-never-real");
  const raw = JSON.stringify(Object.fromEntries(mode.fields.map(f => [f.key,{status:"no_decision",value:null}])));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:raw}}]}))));
  expect(await extractReportWithOpenRouter({mode,prompt:"brief",reportText:"synthetic"})).toBe(raw);
});
it("shares the twenty-call ceiling across concurrent report extractions", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-only-never-real");vi.stubEnv("OPENROUTER_CONCURRENCY","20");
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});
  let active=0,peak=0;
  const raw=JSON.stringify(Object.fromEntries(mode.fields.map(f=>[f.key,{status:"no_decision",value:null}])));
  vi.stubGlobal("fetch",vi.fn(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,6000));active--;return new Response(JSON.stringify({choices:[{message:{content:raw}}]}));}));
  const pending=Promise.all(Array.from({length:150},(_,i)=>extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'},{group:`team-${Math.floor(i/3)}`,priority:i%2?'sandbox':'scored'})));
  await vi.runAllTimersAsync();await pending;
  expect(peak).toBe(20);
});
it("retries explicit in-flight budget rejection but not exhausted credits", async () => {
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});
  vi.stubEnv("OPENROUTER_API_KEY", "test-only-never-real");
  const raw=JSON.stringify(Object.fromEntries(mode.fields.map(f=>[f.key,{status:"no_decision",value:null}])));
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{metadata:{limit_source:'openrouter_in_flight_budget',reason:'in_flight_budget_exhausted'}}}),{status:402,headers:{'Retry-After':'0'}})).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:raw}}]})));
  vi.stubGlobal('fetch',fetcher);const result=extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'});await vi.advanceTimersByTimeAsync(6100);expect(await result).toBe(raw);expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockReset().mockResolvedValue(new Response(JSON.stringify({error:{metadata:{limit_source:'openrouter_credits',reason:'weight_exceeds_budget'}}}),{status:402}));
  const rejected=expect(extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'})).rejects.toThrow('402');await vi.advanceTimersByTimeAsync(250);await rejected;expect(fetcher).toHaveBeenCalledTimes(1);
});

it("starts at twenty under a fifty-slot ceiling while keeping per-submission fanout at twenty",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");vi.stubEnv("OPENROUTER_CONCURRENCY","50");
  expect(getOpenRouterConcurrency()).toBe(50);expect(getOpenRouterSubmissionConcurrency()).toBe(20);
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});
  let active=0,peak=0;
  vi.stubGlobal("fetch",vi.fn(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,6000));active--;return new Response(JSON.stringify({choices:[{message:{content:"{}"}}]}));}));
  const pending=Promise.all(Array.from({length:50},(_,i)=>extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"},{group:`team-${i%50}`})));
  await vi.runAllTimersAsync();await pending;
  expect(peak).toBe(20);
  vi.stubEnv("OPENROUTER_CONCURRENCY","100");expect(getOpenRouterConcurrency()).toBe(50);
});
it.each([429,503])("backs off explicit HTTP %s with Retry-After",async status=>{
  vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.stubEnv("OPENROUTER_API_KEY","test-only");
  const fetcher=vi.fn().mockResolvedValueOnce(new Response("unavailable",{status,headers:{"Retry-After":"10"}})).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:"{}"}}]})));
  vi.stubGlobal("fetch",fetcher);const result=extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"});
  await vi.advanceTimersByTimeAsync(10000);expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1100);expect(await result).toBe("{}");expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([400,401,402,403,408])("does not retry ambiguous or permanent HTTP %s",async status=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");const fetcher=vi.fn().mockResolvedValue(new Response("{}",{status}));vi.stubGlobal("fetch",fetcher);
  await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow(String(status));expect(fetcher).toHaveBeenCalledTimes(1);
});
it("does not automatically replay ambiguous network failures",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");const fetcher=vi.fn().mockRejectedValue(new TypeError("network failed"));vi.stubGlobal("fetch",fetcher);
  await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow("network failed");expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  {choices:[{finish_reason:"error",message:{content:"partial invalid text"}}]},
  {error:{code:502},choices:[{finish_reason:"error"}]},
  {error:{code:429}},
])("recovers HTTP200 completion errors through the same paced scheduler",async failure=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.stubEnv("OPENROUTER_API_KEY","test-only");
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(failure))).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:"{}"}}]})));
 vi.stubGlobal("fetch",fetcher);const onRetry=vi.fn();
 const pending=extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"},{onRetry});
 await vi.runAllTimersAsync();expect(await pending).toBe("{}");expect(fetcher).toHaveBeenCalledTimes(2);expect(onRetry).toHaveBeenCalledTimes(1);
});
it.each([500,502,504])("retries transient HTTP%s without changing provider settings",async status=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.stubEnv("OPENROUTER_API_KEY","test-only");
 const fetcher=vi.fn().mockResolvedValueOnce(new Response("{}",{status})).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:"{}"}}]})));
 vi.stubGlobal("fetch",fetcher);const pending=extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"});await vi.runAllTimersAsync();expect(await pending).toBe("{}");expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([400,401,402,403,408,418])("never retries permanent/unknown body error%s despite HTTP200",async code=>{
 vi.stubEnv("OPENROUTER_API_KEY","test-only");const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{code},choices:[{finish_reason:"error",message:{content:"{}"}}]})));vi.stubGlobal("fetch",fetcher);
 await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow("non-retryable");expect(fetcher).toHaveBeenCalledTimes(1);
});
it("caps persistent completion failures at four calls and releases the queue",async()=>{
 vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.stubEnv("OPENROUTER_API_KEY","test-only");
 const fetcher=vi.fn().mockImplementation(async()=>new Response(JSON.stringify({choices:[{finish_reason:"error"}]})));vi.stubGlobal("fetch",fetcher);
 const assertion=expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow("temporarily failed");await vi.runAllTimersAsync();await assertion;expect(fetcher).toHaveBeenCalledTimes(4);expect(vi.getTimerCount()).toBe(0);
});

it("does not retry in-flight 402 without valid Retry-After",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");
  for(const headers of [new Headers(),new Headers({"Retry-After":"invalid"})]){
   const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{metadata:{limit_source:"openrouter_in_flight_budget",reason:"in_flight_budget_exhausted"}}}),{status:402,headers}));vi.stubGlobal("fetch",fetcher);
   await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow("402");expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it("uses default ten without an operational override",()=>{
 vi.stubEnv("OPENROUTER_CONCURRENCY","");expect(getOpenRouterConcurrency()).toBe(10);
});

it.each([
 {status:400,body:{error:{code:'json_validate_failed',message:'PRIVATE_PROVIDER_SENTINEL'}}},
 {status:422,body:{error:{code:422,metadata:{raw:JSON.stringify({error:{code:'json_validate_failed',failed_generation:'PRIVATE_OUTPUT_SENTINEL'}})}}}},
 {status:200,body:{choices:[{finish_reason:'error',error:{code:'json_validate_failed'}}]}},
 {status:200,body:{choices:[{finish_reason:'error',error:{code:502,message:'Upstream error from Groq: Generated JSON does not match the expected schema. PRIVATE_GENERATION_SENTINEL',metadata:{error_type:'provider_unavailable'}}}]}},
 {status:502,body:{error:{code:502,message:'Upstream error from Groq: Generated JSON does not match the expected schema. PRIVATE_GENERATION_SENTINEL'}}},
])('classifies explicit schema rejection without retrying or exposing payloads',async({status,body})=>{
 vi.stubEnv('OPENROUTER_API_KEY','test-only');
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(body),{status}));vi.stubGlobal('fetch',fetcher);
 const error=await extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'}).catch(e=>e);
 expect(error).toBeInstanceOf(ProviderOutputError);expect(error.message).not.toContain('PRIVATE_');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not classify a schema keyword in arbitrary error prose as proven schema failure',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','test-only');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'json_validate_failed',code:'other_failure'}}),{status:400})));
 const error=await extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'}).catch(e=>e);
 expect(error).not.toBeInstanceOf(ProviderOutputError);
});
