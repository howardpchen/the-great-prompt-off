import { describe, expect, it } from "vitest";

import {
  evaluationModelOptions,
  isApprovedEvaluationModel,
  resolveChallengeEvaluationModel,
} from "./model-options";

describe("approved evaluation models", () => {
  it("includes educational candidates without calling them live-tested", () => {
    expect(evaluationModelOptions.map((option) => option.id)).toEqual([
      "qwen/qwen3.5-9b",
      "qwen/qwen3.5-35b-a3b",
      "google/gemini-2.5-flash",
      "qwen/qwen-2.5-7b-instruct",
      "mistralai/mistral-small-3.2-24b-instruct",
      "google/gemini-2.5-flash-lite",
      "meta-llama/llama-3.2-1b-instruct",
    ]);
  });

  it("recognizes every approved model", () => {
    for (const option of evaluationModelOptions) {
      expect(isApprovedEvaluationModel(option.id)).toBe(true);
    }
  });

  it("rejects arbitrary model IDs", () => {
    expect(isApprovedEvaluationModel("provider/arbitrary-model")).toBe(false);
    expect(isApprovedEvaluationModel("google/gemini-2.5-flash ")).toBe(false);
    expect(isApprovedEvaluationModel("google/gemma-3-4b-it")).toBe(false);
    expect(isApprovedEvaluationModel("meta-llama/llama-3.2-3b-instruct")).toBe(false);
    expect(isApprovedEvaluationModel("qwen/qwen3-4b")).toBe(false);
    expect(isApprovedEvaluationModel("microsoft/phi-4-mini-instruct")).toBe(false);
  });

  it("uses an approved challenge override before the fallback", () => {
    expect(
      resolveChallengeEvaluationModel(
        "google/gemini-2.5-flash-lite",
        "google/gemini-2.0-flash-001",
      ),
    ).toBe("google/gemini-2.5-flash-lite");
  });

  it("uses the fallback for null or unsupported overrides", () => {
    expect(
      resolveChallengeEvaluationModel(null, "google/gemini-2.0-flash-001"),
    ).toBe("google/gemini-2.0-flash-001");
    expect(
      resolveChallengeEvaluationModel(
        "provider/retired-model",
        "google/gemini-2.0-flash-001",
      ),
    ).toBe("google/gemini-2.0-flash-001");
  });
});
