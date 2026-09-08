import "server-only";

import {
  extractReportWithOpenRouter,
  getOpenRouterConcurrency,
  getOpenRouterModel,
  hasOpenRouterApiKey,
  resolveOpenRouterModel,
  shouldUseRealLlm,
} from "@/app/lib/openrouter";
import { scoreModelOutput } from "@/app/lib/scoring";
import { countCorrectFields } from "@/app/lib/mock-evaluation";
import { resolveChallengeMode } from "@/app/lib/schema-storage";
import type { SchemaScoringResult } from "@/app/lib/types";
import {
  getActiveChallenge,
  getSupabaseAnswerKeysForSplit,
} from "./submission-workflow";
import { createDatabase } from "./admin";

export const calibrationBaselines = [
  { id: "blank", label: "Blank prompt", prompt: "" },
  { id: "nonsense", label: "Nonsense prompt", prompt: "This Prompt is Nonsense. " },
  {
    id: "partial-acl",
    label: "Partial ACL-only strategy",
    prompt:
      "Evaluate only ACL tear. For acl_tear, mark present only if the report explicitly identifies an ACL tear, absent only if the report explicitly rules out an ACL tear, uncertain if the ACL language is indeterminate, and not_reported if ACL tear is not discussed. Do not evaluate the other findings.",
  },
  {
    id: "basic-clinical",
    label: "Basic all-findings strategy",
    prompt:
      "For each requested finding, look for explicit evidence in the knee MRI report. Mark present only if the report identifies the finding, absent only if it explicitly rules it out, uncertain if the language is indeterminate, and not_reported if the report does not provide enough information.",
  },
] as const;

type CalibrationReport = {
  id: string;
  filename: string;
  split: "public";
  answer_key: Record<string, string | number | null>;
  supabaseReportId?: string;
  text: string;
};

export type CalibrationResult = {
  model: string;
  modelSource: "challenge_override" | "environment_fallback";
  environmentModel: string;
  challengeModel: string | null;
  reportCount: number;
  fieldCount: number;
  baselines: Array<{
    id: string;
    label: string;
    score: number;
    correctFields: number;
    totalFields: number;
    reportScores: number[];
  }>;
};

export async function runBaselineCalibration(): Promise<CalibrationResult> {
  if (!shouldUseRealLlm()) {
    throw new Error("USE_REAL_LLM must be true to run baseline calibration.");
  }

  if (!hasOpenRouterApiKey()) {
    throw new Error("OPENROUTER_API_KEY is not configured.");
  }

  const supabase = createDatabase();
  const challenge = await getActiveChallenge(supabase);
  const challengeMode = resolveChallengeMode(
    challenge.mode_id,
    challenge.schema_version,
    challenge.contest_schema,
  );
  const reports = (await getSupabaseAnswerKeysForSplit(
    supabase,
    challenge.id,
    "public",
    challengeMode,
  )) as CalibrationReport[];
  const model = resolveOpenRouterModel(challenge.evaluation_model);

  const baselines = [];

  for (const baseline of calibrationBaselines) {
    const evaluated = await mapWithConcurrency(
      reports,
      getOpenRouterConcurrency(),
      async (report) => {
        const modelOutput = await extractReportWithOpenRouter({
          prompt: baseline.prompt,
          reportText: report.text,
          model,
          mode: challengeMode,
        });
        return scoreModelOutput(modelOutput, report.answer_key, challengeMode);
      },
    );

    baselines.push(summarizeBaseline(baseline.id, baseline.label, evaluated));
  }

  return {
    model,
    modelSource: challenge.evaluation_model
      ? "challenge_override"
      : "environment_fallback",
    environmentModel: getOpenRouterModel(),
    challengeModel: challenge.evaluation_model,
    reportCount: reports.length,
    fieldCount: challengeMode.fields.length,
    baselines,
  };
}

function summarizeBaseline(
  id: string,
  label: string,
  scores: SchemaScoringResult[],
) {
  const totalFields = scores.reduce(
    (total, score) => total + score.per_field.length,
    0,
  );
  const correctFields = scores.reduce(
    (total, score) => total + countCorrectFields(score),
    0,
  );

  return {
    id,
    label,
    score: scores.length ? scores.reduce((sum,s) => sum + s.overall_score,0) / scores.length : 0,
    correctFields,
    totalFields,
    reportScores: scores.map((score) => countCorrectFields(score)),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}
