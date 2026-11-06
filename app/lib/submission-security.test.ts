import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isLocalFallbackEnabled, readSubmissionBody } from "./request-security";
const mocks = vi.hoisted(() => ({ submit: vi.fn(), verify: vi.fn(), fallback: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("./supabase/participant-session-token", () => ({ verifyParticipantSessionToken: mocks.verify }));
vi.mock("./supabase/submission-workflow", () => ({
  submitToSupabase: mocks.submit, enqueuePublicSubmission: vi.fn(),
  fallbackStatus: mocks.fallback, getFallbackSubmissionScore: () => ({}),
  EventPhaseError: class extends Error {}, ParticipantValidationError: class extends Error {},
  RealLlmEvaluationError: class extends Error {}, SubmissionLimitError: class extends Error {},
  SubmissionStorageError: class extends Error {},
}));
import { POST as publicPost } from "../api/submissions/public/route";
import { POST as finalPost } from "../api/submissions/final/route";
const request = (text: string) => new Request("http://localhost/api/submissions/public", { method: "POST", body: text });
const payload = { participantCode: "P001", participantToken: "synthetic-token", prompt: "Extract synthetic labels.", contestId: "12345678-1234-1234-1234-123456789012", schemaVersion: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockReturnValue({ participantCode: "P001" });
  mocks.submit.mockResolvedValue({ kind: "public", score: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("bounded submission decoding", () => {
  it("accepts a maximum-length prompt even if every character is Unicode-escaped", async () => {
    const text = JSON.stringify({ ...payload, prompt: "x".repeat(12000) }).replace(/x/g, "\\u0078");
    expect(await readSubmissionBody(request(text))).toEqual({ ...payload, prompt: "x".repeat(12000) });
  });
  it("cancels an oversized stream without trusting Content-Length or draining it", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(new Uint8Array(40000)); c.enqueue(new Uint8Array(40001)); },
      cancel() { cancelled = true; },
    });
    const req = new Request("http://localhost", { method: "POST", body: stream, duplex: "half", headers: { "Content-Length": "1" } } as RequestInit);
    await expect(readSubmissionBody(req)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toBe(true);
  });
  for (const [kind, post] of [["public", publicPost], ["final", finalPost]] as const) {
    it(`${kind}: rejects large unauthenticated bodies before verification/evaluation`, async () => {
      const res = await post(request(JSON.stringify({ pad: "a".repeat(80000) })));
      expect(res.status).toBe(413);
      expect(mocks.verify).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
    });
    it(`${kind}: rejects malformed JSON and accepts ordinary valid input`, async () => {
      expect((await post(request("{"))).status).toBe(400);
      expect((await post(request(JSON.stringify(payload)))).status).toBe(200);
      expect(mocks.submit).toHaveBeenCalledTimes(1);
    });
    it(`${kind}: production storage failure never returns a mock success even when fallback is set`, async () => {
      vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("ALLOW_LOCAL_FALLBACK", "true");
      mocks.submit.mockRejectedValueOnce(new Error("synthetic private database detail"));
      const res = await post(request(JSON.stringify(payload)));
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("private database detail");
      expect(mocks.fallback).not.toHaveBeenCalled();
    });
  }
  it("permits explicitly enabled development fallback only", () => {
    vi.stubEnv("ALLOW_LOCAL_FALLBACK", "true"); vi.stubEnv("NODE_ENV", "development");
    expect(isLocalFallbackEnabled()).toBe(true);
    vi.stubEnv("ALLOW_LOCAL_FALLBACK", "false"); expect(isLocalFallbackEnabled()).toBe(false);
    vi.stubEnv("ALLOW_LOCAL_FALLBACK", "true"); vi.stubEnv("NODE_ENV", "production"); expect(isLocalFallbackEnabled()).toBe(false);
  });
});
