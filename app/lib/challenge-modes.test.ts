import { describe, expect, it } from "vitest";
import {
  challengeModes,
  activatableChallengeModeIds,
  defaultChallengeMode,
  getPublicChallengeModeMetadata,
  kneeMri12BasicMode,
  shoulderMriBasicMode,
} from "./challenge-modes";
import { findingKeys, findingLabels, valueOptions } from "./challenge-constants";

describe("challenge mode registry", () => {
  it("defines the current six-field mode as the default", () => {
    expect(defaultChallengeMode.id).toBe("knee_mri_6_basic");
    expect(defaultChallengeMode.fields.map((field) => field.key)).toEqual([
      "acl_tear",
      "mcl_injury",
      "meniscus_tear",
      "fracture",
      "osteoarthritis",
      "effusion",
    ]);
    for (const field of defaultChallengeMode.fields) {
      expect(field.allowedValues).toEqual([
        "present",
        "absent",
        "uncertain",
        "not_reported",
      ]);
    }
  });

  it("exposes the default mode through the registry", () => {
    expect(challengeModes["knee_mri_6_basic"]).toBe(defaultChallengeMode);
  });

  it("keeps future modes dormant in the registry", () => {
    expect(challengeModes["knee_mri_12_basic"]).toBe(kneeMri12BasicMode);
    expect(kneeMri12BasicMode.fields).toHaveLength(12);
    expect(challengeModes["shoulder_mri_basic"]).toBe(shoulderMriBasicMode);
    expect(shoulderMriBasicMode.fields).toHaveLength(8);
    expect(shoulderMriBasicMode).not.toBe(defaultChallengeMode);
    expect(defaultChallengeMode.id).toBe("knee_mri_6_basic");
  });

  it("keeps the activation allowlist limited to the current mode", () => {
    expect(activatableChallengeModeIds).toEqual(["knee_mri_6_basic"]);
    expect(activatableChallengeModeIds).not.toContain("knee_mri_12_basic");
    expect(activatableChallengeModeIds).not.toContain("shoulder_mri_basic");
  });

  it("keeps compatibility constants derived from the mode", () => {
    expect(findingKeys).toEqual(defaultChallengeMode.fields.map((field) => field.key));
    expect(Object.values(findingLabels)).toEqual(
      defaultChallengeMode.fields.map((field) => field.label),
    );
    expect(valueOptions).toEqual([
      "present",
      "absent",
      "uncertain",
      "not_reported",
    ]);
  });

  it("exposes only safe schema metadata", () => {
    const metadata = getPublicChallengeModeMetadata();

    expect(metadata).toEqual({
      id: "knee_mri_6_basic",
      version: 1,
      title: "Knee MRI Extraction Challenge",
      fields: defaultChallengeMode.fields.map(({ aliases: _aliases, ...field }) => { void _aliases; return field; }),
      allowedValues: ["present", "absent", "uncertain", "not_reported"],
    });
    expect(JSON.stringify(metadata)).not.toContain("answer");
    expect(JSON.stringify(metadata)).not.toContain("prompt");
  });
});
