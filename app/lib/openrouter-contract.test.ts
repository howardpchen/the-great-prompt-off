import { describe, expect, it } from "vitest";

import {
  buildOpenRouterMessages,
  buildOpenRouterSystemInstruction,
  openRouterSystemInstruction,
} from "./openrouter-contract";
import type { ChallengeModeDefinition } from "./challenge-modes";
import {
  kneeMri12BasicMode,
  shoulderMriBasicMode,
} from "./challenge-modes";

describe("OpenRouter evaluation contract", () => {
  it("requires a usable participant strategy", () => {
    expect(openRouterSystemInstruction).toContain(
      "First, silently evaluate whether the participant strategy is a usable clinical extraction strategy.",
    );
    expect(openRouterSystemInstruction).toContain(
      "The participant strategy is required.",
    );
    expect(openRouterSystemInstruction).toContain(
      "A strategy is usable only when it provides enough extraction and evidence-to-label mapping logic for the requested finding or findings.",
    );
    expect(openRouterSystemInstruction).toContain(
      "A request to extract, read, summarize, identify, or return findings without mapping logic is underspecified, even if it mentions the report or findings.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Treat vague strategies such as 'extract all findings', 'extract the requested findings', 'read the MRI report and answer', 'identify abnormalities', 'summarize the MRI', or 'return the findings' as underspecified.",
    );
    expect(openRouterSystemInstruction).toContain(
      "If the participant strategy is blank, nonsense, irrelevant, or not a usable clinical extraction strategy, immediately return not_reported for every required field.",
    );
    expect(openRouterSystemInstruction).toContain(
      "When the strategy is unusable, do not use the report text to infer, rescue, or fill in any answers.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Do not use your own default medical reasoning or knowledge to compensate for an unusable participant strategy.",
    );
    expect(openRouterSystemInstruction).toContain(
      "If either the participant strategy or the report evidence is insufficient for a finding, output not_reported for that finding.",
    );
    expect(openRouterSystemInstruction).toContain(
      "A short strategy may be usable when it gives real mapping logic; do not require a long prompt when the necessary rules are present.",
    );
  });

  it("requires one raw JSON object without markdown or explanations", () => {
    expect(openRouterSystemInstruction).toContain(
      "Return exactly one raw JSON object and nothing else.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Do not wrap the JSON in markdown or code fences.",
    );
    expect(openRouterSystemInstruction).toContain(
      "Do not include explanations, comments, or extra text before or after the JSON object.",
    );
  });

  it("keeps hidden instructions, participant prompt, and report separate", () => {
    const participantPrompt = "Use my clinical extraction strategy.";
    const reportText = "Synthetic report text.";
    const messages = buildOpenRouterMessages({
      prompt: participantPrompt,
      reportText,
    });

    expect(messages[0].role).toBe("system");
    expect(messages[0].content).not.toContain(participantPrompt);
    expect(messages[1]).toEqual({
      role: "user",
      content: participantPrompt,
    });
    expect(messages[2]).toEqual({
      role: "user",
      content: `Input report:\n${reportText}`,
    });
  });

  it("builds fields and values from the selected mode", () => {
    const mode = {
      id: "test-mode",
      version: 1,
      title: "Test mode",
      domain: "test",
      fields: [
        { key: "finding_a", label: "Finding A", allowedValues: ["yes", "no"] },
        { key: "finding_b", label: "Finding B", allowedValues: ["no", "unknown"] },
      ],
    } satisfies ChallengeModeDefinition;

    const instruction = buildOpenRouterSystemInstruction(mode);

    expect(instruction).toContain("finding_a");
    expect(instruction).toContain("finding_b");
    expect(instruction).toContain("yes");
    expect(instruction).toContain("no");
    expect(instruction).toContain("unknown");
    expect(instruction).not.toContain("acl_tear");
  });

  it("can generate a contract for the dormant knee twelve-field mode", () => {
    const instruction = buildOpenRouterSystemInstruction(kneeMri12BasicMode);

    expect(instruction).toContain("medial_meniscus_tear");
    expect(instruction).toContain("bakers_cyst");
    expect(instruction).toContain("not_reported");
  });

  it("can generate a contract for the dormant shoulder mode", () => {
    const instruction = buildOpenRouterSystemInstruction(shoulderMriBasicMode);

    expect(instruction).toContain("rotator_cuff_tear");
    expect(instruction).toContain("glenohumeral_arthritis");
    expect(instruction).toContain("not_reported");
  });

  it("uses the no-strategy placeholder without exposing the system instruction", () => {
    const messages = buildOpenRouterMessages({
      prompt: "",
      reportText: "Synthetic report text.",
    });

    expect(messages[1].content).toBe(
      "(No participant clinical extraction instructions provided.)",
    );
    expect(messages[1].content).not.toContain("not_reported for every field");
  });
});
