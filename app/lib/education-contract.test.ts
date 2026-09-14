import { evaluateAnswerKeyReports } from "./mock-evaluation";
import { describe, expect, it } from "vitest";
import { educationOutputSchema, parseEducationOutput, educationInstruction } from "./education-contract";
import { mixedTemplate } from "./contest-schema-fixtures";
import { validateContestSchema } from "./contest-schema";
import { scoreModelOutput } from "./scoring";
const mode = validateContestSchema({ ...mixedTemplate, education: { version: 1, pipeline: "structured-v1", baselineInstructions: "Use explicit evidence and the organizer definitions." }, fields: mixedTemplate.fields.map(f => ({ ...f, nullable: true })) });
const decisions = () => Object.fromEntries(mode.fields.map(f => [f.key, { status: "decision", value: null }]));
describe("educational extraction boundary", () => {
  it("distinguishes abstention from correct clinical null", () => {
    const raw = decisions(); raw[mode.fields[0].key] = { status: "no_decision", value: null };
    const parsed = parseEducationOutput(JSON.stringify(raw), mode);
    expect(Object.hasOwn(parsed.values, mode.fields[0].key)).toBe(false);
    expect(parsed.values[mode.fields[1].key]).toBe(null);
    const scored = scoreModelOutput(JSON.stringify(parsed.values), Object.fromEntries(mode.fields.map(f => [f.key, null])), mode);
    expect(scored.per_field[0].correct).toBe(false);
    expect(scored.per_field[1].correct).toBe(true);
  });
  it.each(["{}", "not json", '[]'])("rejects infrastructure contract failure %s", raw => expect(() => parseEducationOutput(raw, mode)).toThrow());
  it("rejects extras and invalid values rather than repairing decisions", () => {
    expect(() => parseEducationOutput(JSON.stringify({ ...decisions(), extra: null }), mode)).toThrow();
    const d = decisions(); d[mode.fields[0].key] = { status: "decision", value: "invented" as never };
    expect(() => parseEducationOutput(JSON.stringify(d), mode)).toThrow();
  });
  it("has a strict complete schema but no subjective strategy gate", () => {
    expect(educationOutputSchema(mode).required).toEqual(mode.fields.map(f => f.key));
    expect(educationInstruction(mode)).not.toContain("usable strategy");
    expect(educationInstruction(mode)).toContain("Do not judge");
  });
  it("rejects malformed opt-in metadata", () => expect(() => validateContestSchema({ ...mode, education: { version: 2 } })).toThrow());
});

it("simulated educational scores are deterministic with explicit abstentions and use the contract", () => {
  const reports = [{id:"case-a",filename:"a.txt",split:"public" as const,answer_key:Object.fromEntries(mode.fields.map(f => [f.key, null]))}];
  const a = evaluateAnswerKeyReports(reports, "brief", mode);
  expect(evaluateAnswerKeyReports(reports, "brief", mode)).toEqual(a);
  expect(a[0].score.valid_json).toBe(true);
  expect(a[0].score.missing_fields.length).toBeGreaterThan(0);
});

it("normalizes baseline boundary whitespace like the single instruction editor", () => {
  expect(validateContestSchema({...mode,education:{...mode.education,baselineInstructions:"  concise rules\n"}}).education?.baselineInstructions).toBe("concise rules");
});
