export const evaluationModelOptions = [
  { id: "qwen/qwen3.5-9b", label: "Qwen3.5 9B", difficulty: "Requires calibration", note: "Educational candidate; validate structured output, latency and reference accuracy before enabling paid evaluation." },
  { id: "qwen/qwen3.5-35b-a3b", label: "Qwen3.5 35B A3B", difficulty: "Requires calibration", note: "Educational candidate; not yet validated for this contest." },
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    difficulty: "Recommended",
    note: "Best current separation in calibration: blank/nonsense low, basic clinical high.",
  },
  {
    id: "qwen/qwen-2.5-7b-instruct",
    label: "Qwen2.5 7B Instruct",
    difficulty: "Alternative",
    note: "Working model, but nonsense baseline may remain high. Use calibration before live events.",
  },
  {
    id: "mistralai/mistral-small-3.2-24b-instruct",
    label: "Mistral Small 3.2 24B",
    difficulty: "Alternative",
    note: "Working model, but nonsense baseline may remain high on current reports.",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    difficulty: "Not recommended currently",
    note: "Lightweight, but blank/nonsense baselines remained high in testing.",
  },
  {
    id: "meta-llama/llama-3.2-1b-instruct",
    label: "Llama 3.2 1B Instruct",
    difficulty: "Experimental / very weak",
    note: "Works, but may be too weak or inconsistent for clinical extraction.",
  },
] as const;

export type ApprovedEvaluationModel = (typeof evaluationModelOptions)[number]["id"];

export function isApprovedEvaluationModel(
  model: unknown,
): model is ApprovedEvaluationModel {
  return (
    typeof model === "string" &&
    evaluationModelOptions.some((option) => option.id === model)
  );
}

export function resolveChallengeEvaluationModel(
  challengeModel: string | null | undefined,
  fallbackModel: string,
) {
  return isApprovedEvaluationModel(challengeModel) ? challengeModel : fallbackModel;
}
