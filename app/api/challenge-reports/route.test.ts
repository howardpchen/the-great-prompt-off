import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../../lib/db/database",()=>({createDatabase:()=>({})}));
vi.mock("../../lib/supabase/submission-workflow",()=>({getActiveChallenge:vi.fn()}));
import {getActiveChallenge} from "../../lib/supabase/submission-workflow";
vi.mock("../../lib/challenge-data", () => ({ getPublicChallengeReports: vi.fn() }));
vi.mock("../../lib/supabase/participant-session-token", () => ({ verifyParticipantSessionToken: vi.fn() }));
vi.mock("../../lib/supabase/participant-validation", () => ({ validateParticipantSession: vi.fn() }));
import { getPublicChallengeReports } from "../../lib/challenge-data";
import { verifyParticipantSessionToken } from "../../lib/supabase/participant-session-token";
import { validateParticipantSession } from "../../lib/supabase/participant-validation";
import { GET } from "./route";
const request = (token?: string) => new Request("https://example.test/api/challenge-reports", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
beforeEach(() => {vi.resetAllMocks();vi.mocked(getActiveChallenge).mockResolvedValue({id:"contest-a",event_phase:"practice_open"} as Awaited<ReturnType<typeof getActiveChallenge>>);});
it.each([undefined, "forged", "expired"])("refuses missing or invalid token %s without loading content", async token => {
  vi.mocked(verifyParticipantSessionToken).mockReturnValue(null);
  const response = await GET(request(token));
  expect(response.status).toBe(401);
  expect(getPublicChallengeReports).not.toHaveBeenCalled();
});
it("refuses a signed session for an inactive participant", async () => {
  vi.mocked(verifyParticipantSessionToken).mockReturnValue({ participantCode: "TEAM01" });
  vi.mocked(validateParticipantSession).mockResolvedValue({ valid: false } as Awaited<ReturnType<typeof validateParticipantSession>>);
  expect((await GET(request("signed"))).status).toBe(401);
  expect(getPublicChallengeReports).not.toHaveBeenCalled();
});
it("delivers reports only for the validated participant without caching", async () => {
  vi.mocked(verifyParticipantSessionToken).mockReturnValue({ participantCode: "TEAM01" });
  vi.mocked(validateParticipantSession).mockResolvedValue({ valid: true } as Awaited<ReturnType<typeof validateParticipantSession>>);
  vi.mocked(getPublicChallengeReports).mockResolvedValue([{ id: "r1", filename: "r1", split: "public", text: "synthetic report" }]);
  const response = await GET(request("signed"));
  expect(response.status).toBe(200);
  expect(validateParticipantSession).toHaveBeenCalledWith("TEAM01", "signed");
  expect(getPublicChallengeReports).toHaveBeenCalledWith("contest-a");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect((await response.json()).reports[0].text).toBe("synthetic report");
});

it.each(["not_started","sandbox_open"])("keeps practice report content closed during %s",async phase=>{
 vi.mocked(verifyParticipantSessionToken).mockReturnValue({participantCode:"TEAM01"});
 vi.mocked(validateParticipantSession).mockResolvedValue({valid:true} as Awaited<ReturnType<typeof validateParticipantSession>>);
 vi.mocked(getActiveChallenge).mockResolvedValue({event_phase:phase} as Awaited<ReturnType<typeof getActiveChallenge>>);
 const response=await GET(request("signed"));expect(response.status).toBe(200);expect(await response.json()).toEqual({reports:[]});expect(getPublicChallengeReports).not.toHaveBeenCalled();
});
