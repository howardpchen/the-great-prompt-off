import { buildOutputSchema } from "./schema-storage";
import {
  defaultChallengeMode,
  type ChallengeModeDefinition,
} from "./challenge-modes";

export type OpenRouterMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function buildOpenRouterSystemInstruction(
  mode: ChallengeModeDefinition = defaultChallengeMode,
): string {
  if (mode.fields.some(f => f.type !== undefined)) return [
    "Apply the participant extraction strategy to the input. Return exactly one raw JSON object; no markdown or extra keys.",
    "Do not invent evidence. A missing/uncertain value may be null only for fields that permit null; never substitute numeric zero for missing evidence.",
    ...mode.fields.map(f => `${f.key}: ${f.label}. ${f.description || ""} Weight ${f.weight ?? 1}. ${f.type === "number" ? `Number in ${f.unit}, inclusive absolute tolerance ${f.tolerance}.` : `Exact labels: ${f.allowedValues.join(", " )}.`} ${f.nullable ? "null is allowed for missing/uncertain evidence." : "A valid non-null value is required."}`),
    JSON.stringify(buildOutputSchema(mode)),
  ].join("\n");
  const allowedValues = [
    ...new Set(mode.fields.flatMap((field) => field.allowedValues)),
  ];

  return [
  "You are evaluating a participant-provided clinical extraction strategy against a medical report.",
  "",
  "First, silently evaluate whether the participant strategy is a usable clinical extraction strategy.",
  "The participant strategy is required. Use the report as evidence, but use the participant strategy as the extraction method.",
  "A strategy is usable only when it provides enough extraction and evidence-to-label mapping logic for the requested finding or findings.",
  "A request to extract, read, summarize, identify, or return findings without mapping logic is underspecified, even if it mentions the report or findings.",
  "Treat vague strategies such as 'extract all findings', 'extract the requested findings', 'read the MRI report and answer', 'identify abnormalities', 'summarize the MRI', or 'return the findings' as underspecified.",
  "If the participant strategy is blank, nonsense, irrelevant, or not a usable clinical extraction strategy, immediately return not_reported for every required field.",
  "When the strategy is unusable, do not use the report text to infer, rescue, or fill in any answers.",
  "Do not use your own default medical reasoning or knowledge to compensate for an unusable participant strategy.",
  "Do not use unstated default clinical reasoning to compensate for missing or irrelevant participant instructions.",
  "For each individual finding, output present, absent, or uncertain only when the participant strategy provides a usable method for evaluating that finding and the report evidence supports the chosen value.",
  "If either the participant strategy or the report evidence is insufficient for a finding, output not_reported for that finding.",
  "A short strategy may be usable when it gives real mapping logic; do not require a long prompt when the necessary rules are present.",
  "",
  "Return exactly one raw JSON object and nothing else.",
  "Do not wrap the JSON in markdown or code fences.",
  "Do not include explanations, comments, or extra text before or after the JSON object.",
  "",
  "Use exactly these field names:",
  ...mode.fields.map((field) => field.key),
  "",
  "For each field, use exactly one value:",
  ...allowedValues,
  "",
  "Do not infer findings that are not supported by the report. Use not_reported when the report does not contain enough information to determine a finding. Use absent only when the report explicitly rules out the finding. Use uncertain only when the report contains ambiguous or indeterminate evidence. Do not guess from a finding being unmentioned.",
  "",
  "These instructions define formatting and evaluation-contract requirements only. Do not add clinical interpretation rules or answer hints beyond the participant strategy.",
  ].join("\n");
}

export const openRouterSystemInstruction = buildOpenRouterSystemInstruction();

export function buildOpenRouterMessages({
  prompt,
  reportText,
  mode = defaultChallengeMode,
}: {
  prompt: string;
  reportText: string;
  mode?: ChallengeModeDefinition;
}): OpenRouterMessage[] {
  return [
    {
      role: "system",
      content: buildOpenRouterSystemInstruction(mode),
    },
    {
      role: "user",
      content: prompt || "(No participant clinical extraction instructions provided.)",
    },
    {
      role: "user",
      content: ["Input report:", reportText].join("\n"),
    },
  ];
}
