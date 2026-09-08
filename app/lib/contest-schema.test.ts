import { describe, it, expect } from "vitest";
import { validateContestSchema } from "./contest-schema";
import { mixedTemplate, twelveBinaryTemplate } from "./contest-schema-fixtures";
import {
  buildOutputSchema,
  buildScoredValues,
  validateAnswerValues,
  resolveChallengeMode,
  createSchemaSnapshot,
} from "./schema-storage";
import { scoreModelOutput } from "./scoring";
import { summarizeReportResults } from "./mock-evaluation";
import {
  defaultChallengeMode,
  isLegacyChallengeMode,
  getPublicChallengeModeMetadata,
} from "./challenge-modes";
import { buildOpenRouterSystemInstruction } from "./openrouter-contract";
const answers = Object.fromEntries(
  mixedTemplate.fields.map((f) => [
    f.key,
    f.type === "number" ? 10 : f.allowedValues[0],
  ]),
);
describe("configurable contests", () => {
  it("roundtrips binary and mixed persisted schemas without a registry entry", () => {
    for (const schema of [twelveBinaryTemplate, mixedTemplate]) {
      expect(validateContestSchema(schema).fields).toHaveLength(12);
      expect(
        resolveChallengeMode(
          schema.id,
          schema.version,
          createSchemaSnapshot(schema),
        ),
      ).toEqual(createSchemaSnapshot(schema));
    }
    expect(
      validateContestSchema(createSchemaSnapshot(defaultChallengeMode)).fields,
    ).toHaveLength(6);
  });
  it("materializes editor-authored omitted types and never mistakes custom labels for legacy", () => {
    const edited = {
      ...structuredClone(defaultChallengeMode),
      fields: defaultChallengeMode.fields.map(f => ({...f, allowedValues: ["positive", "negative"]})),
    };
    expect(edited.fields.every(f => !("type" in f))).toBe(true);
    const normalized = validateContestSchema(edited);
    expect(normalized.fields.every(f => f.type === "multiclass")).toBe(true);
    expect(isLegacyChallengeMode(edited)).toBe(false);
    const contract = buildOpenRouterSystemInstruction(edited);
    expect(contract).toContain("Exact labels: positive, negative");
    expect(contract).not.toContain("output present, absent, or uncertain");
    const key = Object.fromEntries(edited.fields.map(f => [f.key, "positive"]));
    for (const schema of [edited, normalized]) {
      expect(scoreModelOutput(key, key, schema).overall_score).toBe(100);
      expect(scoreModelOutput(Object.fromEntries(schema.fields.map(f => [f.key, " POSITIVE "])), key, schema).overall_score).toBe(0);
    }
    const customIdentity = validateContestSchema({...defaultChallengeMode, id: "contest_custom", version: 2});
    expect(customIdentity.fields.every(f => f.type === "multiclass")).toBe(true);
    expect(isLegacyChallengeMode(defaultChallengeMode)).toBe(true);
    expect(isLegacyChallengeMode(createSchemaSnapshot(defaultChallengeMode))).toBe(true);
    const legacyKey = Object.fromEntries(defaultChallengeMode.fields.map(f => [f.key, "present"]));
    expect(scoreModelOutput(Object.fromEntries(defaultChallengeMode.fields.map(f => [f.key, " PRESENT "])), legacyKey, defaultChallengeMode).overall_score).toBe(100);
  });
  it("makes the custom no-strategy response unambiguously zero even for nullable answers", () => {
    for (const schema of [twelveBinaryTemplate, mixedTemplate]) {
      const key = Object.fromEntries(schema.fields.map(f => [f.key, f.nullable ? null : f.allowedValues[0]]));
      const result = scoreModelOutput("{}", key, schema);
      expect(result.overall_score).toBe(0);
      expect(result.per_field.every(f => f.missing && !f.correct)).toBe(true);
      expect(result.invalid_fields).toEqual([]); // Failure is missing data, not invented invalid labels.
    }
  });
  it("uses exact binary labels and rejects unknown keys/missing fields", () => {
    const values = Object.fromEntries(
      twelveBinaryTemplate.fields.map((f) => [f.key, "0"]),
    );
    expect(
      scoreModelOutput(
        values,
        validateAnswerValues(values, twelveBinaryTemplate),
        twelveBinaryTemplate,
      ).overall_score,
    ).toBe(100);
    expect(() =>
      validateAnswerValues({ ...values, acl: 0 }, twelveBinaryTemplate),
    ).toThrow();
    expect(() =>
      validateAnswerValues({ ...values, extra: "0" }, twelveBinaryTemplate),
    ).toThrow();
    const missing = { ...values };
    delete missing.acl;
    expect(() => validateAnswerValues(missing, twelveBinaryTemplate)).toThrow();
  });
  it("enforces inclusive tolerance, normalized weights and preserves weighted aggregate", () => {
    const score = scoreModelOutput(
      { ...answers, measurement_1: 10.5, measurement_2: 10.5001 },
      answers,
      mixedTemplate,
    );
    expect(score.per_field[10].correct).toBe(true);
    expect(score.per_field[11].correct).toBe(false);
    expect(score.overall_score).toBeCloseTo((100 * 12) / 14);
    expect(
      summarizeReportResults([
        { reportId: "synthetic", prediction: answers, score },
      ]).accuracy,
    ).toBe(score.overall_score);
  });
  it("never interprets missing/null/strings as zero; validates numeric range", () => {
    const nullKey = { ...answers, measurement_1: null };
    expect(
      validateAnswerValues(nullKey, mixedTemplate).measurement_1,
    ).toBeNull();
    expect(
      scoreModelOutput({ ...nullKey, measurement_1: 0 }, nullKey, mixedTemplate)
        .per_field[10].correct,
    ).toBe(false);
    expect(
      buildScoredValues(
        scoreModelOutput(nullKey, nullKey, mixedTemplate).per_field,
      ),
    ).toHaveProperty("measurement_1", null);
    expect(
      buildScoredValues(
        scoreModelOutput(
          { ...nullKey, measurement_1: "invalid" },
          nullKey,
          mixedTemplate,
        ).per_field,
      ),
    ).not.toHaveProperty("measurement_1");
    const missing = { ...nullKey };
    delete (missing as Record<string, unknown>).measurement_1;
    expect(
      scoreModelOutput(missing, nullKey, mixedTemplate).per_field[10].correct,
    ).toBe(false);
    for (const v of ["10", NaN, Infinity, -1, 501])
      expect(() =>
        validateAnswerValues({ ...answers, measurement_1: v }, mixedTemplate),
      ).toThrow();
    expect(
      scoreModelOutput(
        { ...answers, measurement_1: "10" },
        answers,
        mixedTemplate,
      ).per_field[10].invalid,
    ).toBe(true);
  });
  it("rejects ambiguous keys, prototype names, invalid weights and oversized schemas", () => {
    for (const field of [
      { ...mixedTemplate.fields[0], key: "toString" },
      { ...mixedTemplate.fields[1], key: "BINARY1" },
      { ...mixedTemplate.fields[0], weight: 0 },
    ])
      expect(() =>
        validateContestSchema({
          ...mixedTemplate,
          fields: [...mixedTemplate.fields, field],
        }),
      ).toThrow();
    expect(() =>
      validateContestSchema({
        ...mixedTemplate,
        fields: Array(65).fill(mixedTemplate.fields[0]),
      }),
    ).toThrow();
    expect(() => resolveChallengeMode("wrong", 1, mixedTemplate)).toThrow();
  });
  it("publishes field-specific contracts without keys or data", () => {
    expect(
      buildOutputSchema(mixedTemplate).properties.measurement_1.type,
    ).toEqual(["number", "null"]);
    expect(getPublicChallengeModeMetadata(mixedTemplate).fields[10].unit).toBe(
      "mm",
    );
    expect(buildOpenRouterSystemInstruction(mixedTemplate)).toContain(
      "inclusive absolute tolerance",
    );
    expect(buildOpenRouterSystemInstruction(mixedTemplate)).not.toContain(
      "output not_reported",
    );
  });
});
