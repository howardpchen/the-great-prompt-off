import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extractReportWithOpenRouter, getOpenRouterConcurrency, getOpenRouterSubmissionConcurrency } from "./openrouter";
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
  let active=0,peak=0;
  const raw=JSON.stringify(Object.fromEntries(mode.fields.map(f=>[f.key,{status:"no_decision",value:null}])));
  vi.stubGlobal("fetch",vi.fn(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return new Response(JSON.stringify({choices:[{message:{content:raw}}]}));}));
  await Promise.all(Array.from({length:150},(_,i)=>extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'},{group:`team-${Math.floor(i/3)}`,priority:i%2?'sandbox':'scored'})));
  expect(peak).toBe(20);
});
it("retries explicit in-flight budget rejection but not exhausted credits", async () => {
  vi.useFakeTimers();
  vi.stubEnv("OPENROUTER_API_KEY", "test-only-never-real");
  const raw=JSON.stringify(Object.fromEntries(mode.fields.map(f=>[f.key,{status:"no_decision",value:null}])));
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{metadata:{limit_source:'openrouter_in_flight_budget',reason:'in_flight_budget_exhausted'}}}),{status:402,headers:{'Retry-After':'0'}})).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:raw}}]})));
  vi.stubGlobal('fetch',fetcher);const result=extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'});await vi.advanceTimersByTimeAsync(6100);expect(await result).toBe(raw);expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockReset().mockResolvedValue(new Response(JSON.stringify({error:{metadata:{limit_source:'openrouter_credits',reason:'weight_exceeds_budget'}}}),{status:402}));
  await expect(extractReportWithOpenRouter({mode,prompt:'synthetic',reportText:'fixture'})).rejects.toThrow('402');expect(fetcher).toHaveBeenCalledTimes(1);
});

it("starts at twenty under a fifty-slot ceiling while keeping per-submission fanout at twenty",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");vi.stubEnv("OPENROUTER_CONCURRENCY","50");
  expect(getOpenRouterConcurrency()).toBe(50);expect(getOpenRouterSubmissionConcurrency()).toBe(20);
  let active=0,peak=0;
  vi.stubGlobal("fetch",vi.fn(async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return new Response(JSON.stringify({choices:[{message:{content:"{}"}}]}));}));
  await Promise.all(Array.from({length:250},(_,i)=>extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"},{group:`team-${i%50}`})));
  expect(peak).toBe(20);
  vi.stubEnv("OPENROUTER_CONCURRENCY","100");expect(getOpenRouterConcurrency()).toBe(50);
});
it.each([429,503])("backs off explicit HTTP %s with Retry-After",async status=>{
  vi.useFakeTimers();vi.stubEnv("OPENROUTER_API_KEY","test-only");
  const fetcher=vi.fn().mockResolvedValueOnce(new Response("unavailable",{status,headers:{"Retry-After":"10"}})).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:"{}"}}]})));
  vi.stubGlobal("fetch",fetcher);const result=extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"});
  await vi.advanceTimersByTimeAsync(10000);expect(fetcher).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1100);expect(await result).toBe("{}");expect(fetcher).toHaveBeenCalledTimes(2);
});
it.each([400,401,402,403,408,500,502,504])("does not retry ambiguous or permanent HTTP %s",async status=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");const fetcher=vi.fn().mockResolvedValue(new Response("{}",{status}));vi.stubGlobal("fetch",fetcher);
  await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow(String(status));expect(fetcher).toHaveBeenCalledTimes(1);
});
it("never retries a failed network request or a successful HTTP error envelope",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");const fetcher=vi.fn().mockRejectedValue(new TypeError("network failed"));vi.stubGlobal("fetch",fetcher);
  await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow("network failed");expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockReset().mockResolvedValue(new Response(JSON.stringify({error:{code:429,message:"late failure"}})));
  await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow("empty");expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not retry in-flight 402 without valid Retry-After",async()=>{
  vi.stubEnv("OPENROUTER_API_KEY","test-only");
  for(const headers of [new Headers(),new Headers({"Retry-After":"invalid"})]){
   const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{metadata:{limit_source:"openrouter_in_flight_budget",reason:"in_flight_budget_exhausted"}}}),{status:402,headers}));vi.stubGlobal("fetch",fetcher);
   await expect(extractReportWithOpenRouter({prompt:"synthetic",reportText:"fixture"})).rejects.toThrow("402");expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it("preserves default twenty without an operational override",()=>{
 vi.stubEnv("OPENROUTER_CONCURRENCY","");expect(getOpenRouterConcurrency()).toBe(20);
});
