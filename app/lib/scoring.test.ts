import { describe, expect, it } from "vitest";

import { scoreModelOutput } from "./scoring";
import {
  defaultChallengeMode,
  kneeMri12BasicMode,
  shoulderMriBasicMode,
} from "./challenge-modes";
import type { AnswerKey, FindingKey } from "./types";

const answerKey: AnswerKey = {
  acl_tear: "absent",
  mcl_injury: "absent",
  meniscus_tear: "present",
  fracture: "absent",
  osteoarthritis: "uncertain",
  effusion: "present",
};

const strictOutput: AnswerKey = {
  acl_tear: "absent",
  mcl_injury: "absent",
  meniscus_tear: "present",
  fracture: "absent",
  osteoarthritis: "uncertain",
  effusion: "present",
};

function fieldResult(output: Parameters<typeof scoreModelOutput>[0], field: FindingKey) {
  const result = scoreModelOutput(output, answerKey);
  const fieldScore = result.per_field.find((item) => item.field === field);

  if (!fieldScore) {
    throw new Error(`Missing field score for ${field}`);
  }

  return { fieldScore, result };
}

describe("scoreModelOutput", () => {
  it("defaults to the knee_mri_6_basic schema", () => {
    const result = scoreModelOutput(strictOutput, answerKey);

    expect(defaultChallengeMode.id).toBe("knee_mri_6_basic");
    expect(result.per_field.map((field) => field.field)).toEqual(
      defaultChallengeMode.fields.map((field) => field.key),
    );
    expect(result.per_field).toHaveLength(6);
  });

  it("scores fields and allowed values from a supplied schema", () => {
    const mode = {
      id: "test-mode",
      version: 1,
      title: "Test mode",
      domain: "test",
      fields: [
        {
          key: "finding_a",
          label: "Finding A",
          allowedValues: ["keep", "skip"],
          aliases: ["a"],
        },
        {
          key: "finding_b",
          label: "Finding B",
          allowedValues: ["unclear"],
        },
      ],
    } as const;

    const result = scoreModelOutput(
      { a: "keep", finding_b: "unclear" },
      { finding_a: "keep", finding_b: "unclear" },
      mode,
    );

    expect(result.overall_score).toBe(100);
    expect(result.per_field.map((field) => field.field)).toEqual([
      "finding_a",
      "finding_b",
    ]);
    expect(result.invalid_fields).toEqual([]);
    expect(result.diagnostics.key_normalization_used).toBe(true);

    const invalid = scoreModelOutput(
      { finding_a: "present", finding_b: "unclear" },
      { finding_a: "keep", finding_b: "unclear" },
      mode,
    );

    expect(invalid.overall_score).toBe(50);
    expect(invalid.invalid_fields).toEqual([
      { field: "finding_a", value: "present" },
    ]);
  });

  it("scores a synthetic twelve-field knee answer when explicitly selected", () => {
    const answerKey = Object.fromEntries(
      kneeMri12BasicMode.fields.map((field) => [field.key, "not_reported"]),
    );
    const output = Object.fromEntries(
      kneeMri12BasicMode.fields.map((field) => [field.key, "not_reported"]),
    );
    const result = scoreModelOutput(output, answerKey, kneeMri12BasicMode);

    expect(result.overall_score).toBe(100);
    expect(result.per_field).toHaveLength(12);
  });

  it("scores a synthetic shoulder answer when explicitly selected", () => {
    const answerKey = Object.fromEntries(
      shoulderMriBasicMode.fields.map((field) => [field.key, "absent"]),
    );
    const output = Object.fromEntries(
      shoulderMriBasicMode.fields.map((field) => [field.key, "absent"]),
    );
    const result = scoreModelOutput(output, answerKey, shoulderMriBasicMode);

    expect(result.overall_score).toBe(100);
    expect(result.per_field).toHaveLength(8);
  });

  it("accepts exact controlled values", () => {
    const result = scoreModelOutput(strictOutput, answerKey);

    expect(result.valid_json).toBe(true);
    expect(result.invalid_fields).toEqual([]);
    expect(result.missing_fields).toEqual([]);
    expect(result.field_accuracy).toBe(100);
    expect(result.overall_score).toBe(100);
  });

  it("accepts not_reported as a strict controlled value", () => {
    const expected: AnswerKey = {
      ...answerKey,
      acl_tear: "not_reported",
    };
    const result = scoreModelOutput(
      {
        ...strictOutput,
        acl_tear: "not_reported",
      },
      expected,
    );

    expect(result.per_field[0].actual).toBe("not_reported");
    expect(result.per_field[0].correct).toBe(true);
    expect(result.invalid_fields).toEqual([]);
  });

  it("normalizes exact labels by case and surrounding whitespace only", () => {
    const result = scoreModelOutput(
      {
        acl_tear: "ABSENT",
        mcl_injury: " Present ",
        meniscus_tear: "present",
        fracture: " absent ",
        osteoarthritis: " uncertain ",
        effusion: "PRESENT",
      },
      answerKey,
    );

    expect(result.per_field.map((item) => [item.field, item.actual])).toEqual([
      ["acl_tear", "absent"],
      ["mcl_injury", "present"],
      ["meniscus_tear", "present"],
      ["fracture", "absent"],
      ["osteoarthritis", "uncertain"],
      ["effusion", "present"],
    ]);
    expect(result.invalid_fields).toEqual([]);
    expect(result.diagnostics.value_normalization_used).toBe(true);
  });

  it("normalizes not_reported only by case and surrounding whitespace", () => {
    const expected: AnswerKey = {
      ...answerKey,
      acl_tear: "not_reported",
    };
    const result = scoreModelOutput(
      {
        ...strictOutput,
        acl_tear: " Not_Reported ",
      },
      expected,
    );

    expect(result.per_field[0].actual).toBe("not_reported");
    expect(result.per_field[0].correct).toBe(true);

    const invalid = scoreModelOutput(
      {
        ...strictOutput,
        acl_tear: "not reported",
      },
      expected,
    );

    expect(invalid.per_field[0].actual).toBeNull();
    expect(invalid.invalid_fields).toContainEqual({
      field: "acl_tear",
      value: "not reported",
    });
  });

  it("does not treat absent and not_reported as interchangeable", () => {
    const expected: AnswerKey = {
      ...answerKey,
      acl_tear: "not_reported",
    };
    const result = scoreModelOutput(
      {
        ...strictOutput,
        acl_tear: "absent",
      },
      expected,
    );

    expect(result.per_field[0].actual).toBe("absent");
    expect(result.per_field[0].correct).toBe(false);
    expect(result.per_field[0].invalid).toBe(false);
  });

  it("does not convert a missing field into not_reported", () => {
    const expected: AnswerKey = {
      ...answerKey,
      acl_tear: "not_reported",
    };
    const result = scoreModelOutput(
      {
        ...strictOutput,
        acl_tear: undefined,
      },
      expected,
    );

    expect(result.per_field[0].actual).toBeNull();
    expect(result.per_field[0].missing).toBe(true);
    expect(result.per_field[0].correct).toBe(false);
  });

  it.each([
    ["acl_tear", "intact"],
    ["acl_tear", "normal"],
    ["meniscus_tear", "partial tear"],
    ["meniscus_tear", "no tear"],
    ["meniscus_tear", "torn"],
    ["mcl_injury", "sprain"],
    ["fracture", "no fracture"],
    ["effusion", "trace"],
    ["effusion", "small"],
    ["effusion", "large"],
    ["mcl_injury", "yes"],
    ["mcl_injury", "no"],
    ["mcl_injury", "positive"],
    ["mcl_injury", "negative"],
  ] as Array<[FindingKey, string]>)(
    "marks clinical phrase %s=%s as invalid with no credit",
    (field, value) => {
      const { fieldScore, result } = fieldResult(
        {
          ...strictOutput,
          [field]: value,
        },
        field,
      );

      expect(fieldScore.actual).toBeNull();
      expect(fieldScore.correct).toBe(false);
      expect(fieldScore.invalid).toBe(true);
      expect(result.invalid_fields).toContainEqual({ field, value });
    },
  );

  it("recovers JSON from markdown code fences", () => {
    const result = scoreModelOutput(
      `Here is the output:\n\n\`\`\`json\n${JSON.stringify(strictOutput)}\n\`\`\``,
      answerKey,
    );

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.recovered_json_used).toBe(true);
  });

  it("recovers JSON embedded in surrounding prose", () => {
    const result = scoreModelOutput(
      `The answer is ${JSON.stringify(strictOutput)} for this report.`,
      answerKey,
    );

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.recovered_json_used).toBe(true);
  });

  it("recovers a single-object array", () => {
    const result = scoreModelOutput(JSON.stringify([strictOutput]), answerKey);

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.recovered_json_used).toBe(true);
  });

  it("recovers a nested single-report object", () => {
    const result = scoreModelOutput({ report_1: strictOutput }, answerKey);

    expect(result.valid_json).toBe(true);
    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.nested_object_used).toBe(true);
    expect(result.diagnostics.ignored_outer_key).toBe("report_1");
  });

  it("recovers field-name aliases but still requires strict values", () => {
    const result = scoreModelOutput(
      {
        ACL_intact_or_torn: "absent",
        MCL_intact_or_torn: "intact",
        meniscal_tear_partial_or_full_thickness: "present",
        bone_fracture: "absent",
        degenerative_narrowing_or_spurring_osteoarthritis: "uncertain",
        knee_joint_effusion: "present",
      },
      answerKey,
    );
    const mcl = result.per_field.find((item) => item.field === "mcl_injury");

    expect(result.diagnostics.key_normalization_used).toBe(true);
    expect(mcl?.actual).toBeNull();
    expect(mcl?.invalid).toBe(true);
    expect(result.invalid_fields).toContainEqual({
      field: "mcl_injury",
      value: "intact",
    });
  });

  it("ignores and reports extra fields", () => {
    const result = scoreModelOutput(
      {
        ...strictOutput,
        confidence: "high",
      },
      answerKey,
    );

    expect(result.overall_score).toBe(100);
    expect(result.diagnostics.ignored_extra_fields).toEqual(["confidence"]);
  });

  it("reports missing fields", () => {
    const result = scoreModelOutput(
      {
        acl_tear: "absent",
        mcl_injury: "absent",
      },
      answerKey,
    );

    expect(result.missing_fields).toEqual([
      "meniscus_tear",
      "fracture",
      "osteoarthritis",
      "effusion",
    ]);
  });

  it("reports invalid fields", () => {
    const result = scoreModelOutput(
      {
        ...strictOutput,
        fracture: "no fracture",
        effusion: "trace",
      },
      answerKey,
    );

    expect(result.invalid_fields).toEqual([
      { field: "fracture", value: "no fracture" },
      { field: "effusion", value: "trace" },
    ]);
  });
});
