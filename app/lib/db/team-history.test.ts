import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ verify: vi.fn(), active: vi.fn(), sql: vi.fn() }));
vi.mock("../supabase/admin", () => ({ createDatabase: () => ({ sql: mocks.sql }) }));
vi.mock("../supabase/submission-workflow", () => ({ getActiveChallenge: mocks.active }));
vi.mock("../supabase/participant-session-token", () => ({ verifyParticipantSessionToken: mocks.verify }));
import { GET } from "../../api/team-history/route";
beforeEach(() => { vi.clearAllMocks(); mocks.verify.mockReturnValue({ participantCode: "TEAM-A" }); mocks.active.mockResolvedValue({ id: "contest-a", contest_schema: { education: { version: 1 } } }); });
describe("team history authentication and projection", () => {
  it("rejects invalid sessions without database access", async () => {
    mocks.verify.mockReturnValue(null);
    const response = await GET(new Request("http://local/api/team-history"));
    expect(response.status).toBe(401); expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("rejects inactive accounts", async () => {
    mocks.sql.mockResolvedValueOnce([]);
    expect((await GET(new Request("http://local/api/team-history"))).status).toBe(403);
    expect(mocks.sql).toHaveBeenCalledTimes(1);
  });
  it("ignores forged team/contest query parameters and returns only practice aggregates and final instructions", async () => {
    mocks.sql.mockResolvedValueOnce([{ id: "signed-team" }]).mockResolvedValueOnce([{ id: "practice", instructions: "exact instructions", score: 25 }]).mockResolvedValueOnce([{ instructions: "locked instructions", status: "failed" }]);
    const response = await GET(new Request("http://local/api/team-history?participantCode=TEAM-B&contestId=other"));
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.sql.mock.calls[0][1]).toEqual(["TEAM-A"]);
    expect(mocks.sql.mock.calls[1][1]).toEqual(["contest-a", "signed-team"]);
    expect(mocks.sql.mock.calls[2][1]).toEqual(["contest-a", "signed-team"]);
    const query = mocks.sql.mock.calls[1][0];
    expect(query).toContain("s.submission_type='public'"); expect(query).not.toMatch(/answer_keys|raw_model_output|response/);
    const finalQuery = mocks.sql.mock.calls[2][0]; expect(finalQuery).not.toMatch(/score|response|answer_keys/);
    expect(await response.json()).toEqual({ practice: [{ id: "practice", instructions: "exact instructions", score: 25 }], final: { instructions: "locked instructions", status: "failed" } });
  });
});

describe("public comparison history", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("requires authentication and a valid submission identifier", async () => {
    expect((await GET(new Request("http://local/api/team-history?submission=bad"))).status).toBe(400);
    expect(mocks.sql).not.toHaveBeenCalled();
    mocks.verify.mockReturnValue(null);
    expect((await GET(new Request(`http://local/api/team-history?submission=${id}`))).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("scopes completed public results to the signed identity and active contest", async () => {
    const comparisons = [{report:"report-a",fields:[{field:"finding",expected:"yes",actual:null,noDecision:true,correct:false}]}];
    mocks.sql.mockResolvedValueOnce([{attemptNumber:2,instructions:"saved",score:0,correctFields:0,totalFields:1,reportCount:1,comparisons,raw_model_output:"NEVER_RETURN"}]);
    const response = await GET(new Request(`http://local/api/team-history?submission=${id}&participantCode=other&contestId=other`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [sql, args] = mocks.sql.mock.calls[0];
    expect(args).toEqual(["contest-a","TEAM-A",id]);
    for (const boundary of ["u.is_active", "u.participant_code=$2", "s.challenge_id=$1", "s.id=$3", "s.submission_type='public'", "kind='public'", "status='completed'", "participant_id=s.participant_id", "'{feedback,kind}'='public'"]) expect(sql).toContain(boundary);
    expect(sql).not.toContain("raw_model_output");
    const body = await response.json();
    expect(body.feedback.clinicalComparisons).toEqual(comparisons);
    expect(JSON.stringify(body)).not.toContain("NEVER_RETURN");
    expect(body.feedback.kind).toBe("public");
  });
  it("returns no information for inaccessible submissions, and unavailable comparisons for old results", async () => {
    mocks.sql.mockResolvedValueOnce([]);
    expect((await GET(new Request(`http://local/api/team-history?submission=${id}`))).status).toBe(404);
    mocks.sql.mockResolvedValueOnce([{attemptNumber:1,instructions:"saved",score:50,correctFields:1,totalFields:2,reportCount:1,comparisons:null}]);
    const body = await (await GET(new Request(`http://local/api/team-history?submission=${id}`))).json();
    expect(body.feedback.clinicalComparisons).toEqual([]);
    expect(body.feedback.score).toBe(50);
  });
});
