import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
import { createAdminSessionToken, verifyAdminSessionToken } from "./supabase/admin-auth";
import { createParticipantSessionToken, verifyParticipantSessionToken } from "./supabase/participant-session-token";
import { isAllowedWrite, readLoginBody, takeLoginAttempt } from "./request-security";

const admin = "admin-test-only-".repeat(4);
const participant = "participant-test-only-".repeat(4);
function signed(payload: unknown, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}
beforeEach(() => {
  vi.stubEnv("ADMIN_SECRET", admin);
  vi.stubEnv("PARTICIPANT_SESSION_SECRET", participant);
  vi.stubEnv("ADMIN_SECRET_FILE", "");
  vi.stubEnv("PARTICIPANT_SESSION_SECRET_FILE", "");
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T12:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("signed session validity", () => {
  it("accepts freshly issued tokens and expires both exactly at eight hours", () => {
    const a = createAdminSessionToken(); const p = createParticipantSessionToken("P001");
    expect(verifyAdminSessionToken(a)).toBe(true);
    expect(verifyParticipantSessionToken(p)).toEqual({ participantCode: "P001" });
    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(verifyAdminSessionToken(a)).toBe(false);
    expect(verifyParticipantSessionToken(p)).toBeNull();
  });
  it("rejects malformed, tampered, future, missing-time, and wrong-role payloads", () => {
    const now = Date.now() / 1000;
    for (const iat of [undefined, now + 1, "1", -1, now - 28800]) {
      expect(verifyAdminSessionToken(signed({ role: "admin", iat }, admin))).toBe(false);
      expect(verifyParticipantSessionToken(signed({ participantCode: "P001", iat }, participant))).toBeNull();
    }
    expect(verifyAdminSessionToken(signed({ role: "participant", iat: now }, admin))).toBe(false);
    expect(verifyAdminSessionToken(createAdminSessionToken() + ".extra")).toBe(false);
    expect(verifyParticipantSessionToken(createParticipantSessionToken("P001") + ".extra")).toBeNull();
    expect(verifyParticipantSessionToken(signed({ participantCode: 123, iat: now }, participant))).toBeNull();
    expect(verifyAdminSessionToken("garbage.signature")).toBe(false);
  });
  it("fails closed without signing secrets or with shared secrets", () => {
    const p = createParticipantSessionToken("P001");
    vi.stubEnv("PARTICIPANT_SESSION_SECRET", "");
    expect(verifyParticipantSessionToken(p)).toBeNull();
    expect(() => createParticipantSessionToken("P001")).toThrow();
    vi.stubEnv("PARTICIPANT_SESSION_SECRET", admin);
    expect(() => createParticipantSessionToken("P001")).toThrow("independent");
    vi.stubEnv("ADMIN_SECRET", "");
    expect(verifyAdminSessionToken("abc.def")).toBe(false);
  });
});
describe("request safeguards", () => {
  it("rejects missing or hostile Origin, including same-site sibling origins", () => {
    const request = (origin?: string) => new Request("http://localhost:3000/api/admin/reset", { method: "POST", headers: origin ? { origin } : {} });
    expect(isAllowedWrite(request())).toBe(false);
    expect(isAllowedWrite(request("https://evil.example"))).toBe(false);
    expect(isAllowedWrite(request("http://localhost:3000"))).toBe(true);
  });
  it("throttles repeated attempts and allows attempts again after window expiration", () => {
    for (let i = 0; i < 10; i++) expect(takeLoginAttempt("admin", 1000)).toBe(0);
    expect(takeLoginAttempt("admin", 1000)).toBe(60);
    expect(takeLoginAttempt("admin", 61_000)).toBe(0);
  });
  it("rejects oversized, malformed and non-JSON login bodies", async () => {
    const request = (body: string, type = "application/json") => new Request("http://localhost", { method: "POST", body, headers: { "Content-Type": type } });
    expect(await readLoginBody(request(JSON.stringify({ accessCode: "demo" })))).toEqual({ accessCode: "demo" });
    expect(await readLoginBody(request("x".repeat(4097)))).toBeNull();
    expect(await readLoginBody(request("{}", "text/plain"))).toBeNull();
    expect(await readLoginBody(request("[1]"))).toBeNull();
    expect(await readLoginBody(request("{"))).toBeNull();
  });
});

import { finalFeedback } from "./final-feedback";
it("allowlists final feedback even when an evaluator supplies private details", () => {
  const input = { score: 0.5, correctFields: 1, totalFields: 2, reportCount: 1,
    feedback: { validJsonCount: 1, reportDetails: [{ filename: "hidden", answer_key: "secret" }], reportScores: [{ reportLabel: "hidden" }] } };
  const output = finalFeedback(input);
  expect(output.score).toBe(0.5);
  expect(JSON.stringify(output)).not.toMatch(/hidden|secret|reportDetails|reportScores|answer_key/);
});
