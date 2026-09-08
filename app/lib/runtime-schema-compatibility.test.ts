import { describe, expect, it } from "vitest";

import {
  activatableChallengeModeIds,
  defaultChallengeMode,
  getPublicChallengeModeMetadata,
  kneeMri12BasicMode,
} from "./challenge-modes";
import {
  evaluateAnswerKeyReports,
  summarizeReportResults,
} from "./mock-evaluation";
import { formatFieldScore } from "./score-display";

function answerValuesFor(
  mode: typeof defaultChallengeMode | typeof kneeMri12BasicMode,
) {
  return Object.fromEntries(
    mode.fields.map((field, index) => [
      field.key,
      field.allowedValues[index % field.allowedValues.length],
    ]),
  );
}

describe("runtime schema compatibility", () => {
  it("preserves the current six-field mock evaluation total", () => {
    const reports = evaluateAnswerKeyReports(
      [
        {
          id: "report-6",
          filename: "report-6.txt",
          split: "public",
          answer_key: answerValuesFor(defaultChallengeMode),
        },
      ],
      defaultChallengeMode.fields.map((field) => field.key).join(" "),
    );

    expect(reports[0].score.per_field).toHaveLength(6);
    expect(summarizeReportResults(reports).total).toBe(6);
  });

  it("uses twelve schema fields for mock scoring and summary denominators", () => {
    const reports = evaluateAnswerKeyReports(
      [
        {
          id: "report-12",
          filename: "report-12.txt",
          split: "public",
          answer_key: answerValuesFor(kneeMri12BasicMode),
        },
      ],
      kneeMri12BasicMode.fields.map((field) => field.key).join(" "),
      kneeMri12BasicMode,
    );
    const summary = summarizeReportResults(reports);

    expect(reports[0].score.per_field).toHaveLength(12);
    expect(summary.total).toBe(12);
    expect(formatFieldScore(summary.correct, summary.total)).toMatch(/^\d+\/12$/);
  });

  it("exposes safe twelve-field labels without activating the dormant mode", () => {
    const metadata = getPublicChallengeModeMetadata(kneeMri12BasicMode);
    const serialized = JSON.stringify(metadata);

    expect(metadata.fields).toHaveLength(12);
    expect(metadata.fields[0]).toMatchObject({ key: "acl_tear", label: "ACL tear", allowedValues: kneeMri12BasicMode.fields[0].allowedValues });
    expect(serialized).not.toContain("answer_key");
    expect(serialized).not.toContain("report_text");
    expect(activatableChallengeModeIds).toEqual(["knee_mri_6_basic"]);
  });
});
