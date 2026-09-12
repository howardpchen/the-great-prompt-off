import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { extractReportWithOpenRouter } from "./openrouter";
import { twelveBinaryTemplate } from "./contest-schema-fixtures";
const mode = { ...twelveBinaryTemplate, education: {version:1 as const,pipeline:"structured-v1" as const,baselineInstructions:"Use explicit evidence."} };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
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
