import {
  defaultChallengeMode,
  type ChallengeFieldDefinition,
  type ChallengeModeDefinition,
} from "./challenge-modes";
import { scoreModelOutput } from "./scoring";
import type {
  ScoreSummary,
  SchemaScoringResult,
} from "./types";

type RuntimeAnswerKeyItem = {
  id: string;
  filename: string;
  split: "sample" | "public" | "private";
  answer_key: Record<string, string | number | null>;
  notes?: string;
  text?: string;
};

export type MockReportResult = {
  reportId: string;
  prediction: Record<string, string | number | null>;
  score: SchemaScoringResult;
  modelOutput?: string;
  error?: string | null;
};

export function evaluateSampleReports(
  reports: RuntimeAnswerKeyItem[],
  prompt: string,
  mode: ChallengeModeDefinition = defaultChallengeMode,
): MockReportResult[] {
  return reports.map((report) => {
    const prediction = createMockPrediction(prompt, report.answer_key, mode);

    return {
      reportId: report.id,
      prediction,
      score: scoreModelOutput(JSON.stringify(prediction), report.answer_key, mode),
    };
  });
}

export function evaluateAnswerKeySet(
  answerKeys: RuntimeAnswerKeyItem[],
  prompt: string,
  mode: ChallengeModeDefinition = defaultChallengeMode,
): ScoreSummary {
  const scores = evaluateAnswerKeyReports(answerKeys, prompt, mode).map(
    (result) => result.score,
  );
  const correct = scores.reduce(
    (sum, score) => sum + countCorrectFields(score),
    0,
  );
  const total = scores.reduce((sum, score) => sum + score.per_field.length, 0);

  return {
    correct,
    total,
    accuracy: scores.length ? scores.reduce((sum,s) => sum + s.overall_score,0) / scores.length : 0,
  };
}

export function evaluateAnswerKeyReports(
  answerKeys: RuntimeAnswerKeyItem[],
  prompt: string,
  mode: ChallengeModeDefinition = defaultChallengeMode,
): MockReportResult[] {
  return answerKeys.map((item) => {
    const prediction = createMockPrediction(prompt, item.answer_key, mode);

    return {
      reportId: item.id,
      prediction,
      score: scoreModelOutput(JSON.stringify(prediction), item.answer_key, mode),
      modelOutput: JSON.stringify(prediction),
      error: null,
    };
  });
}

export function summarizeReportResults(results: MockReportResult[]): ScoreSummary {
  const correct = results.reduce(
    (sum, result) => sum + countCorrectFields(result.score),
    0,
  );
  const total = results.reduce(
    (sum, result) => sum + result.score.per_field.length,
    0,
  );

  return {
    correct,
    total,
    accuracy: results.length ? results.reduce((sum,r) => sum + r.score.overall_score,0) / results.length : 0,
  };
}

export function countCorrectFields(score: SchemaScoringResult) {
  return score.per_field.filter((field) => field.correct).length;
}

function createMockPrediction(
  prompt: string,
  answerKey: Record<string, string | number | null>,
  mode: ChallengeModeDefinition,
) {
  const quality = promptQuality(prompt, mode);

  return mode.fields.reduce<Record<string, string | number | null>>((prediction, field, index) => {
    const key = field.key;
    if (quality === "strong") {
      prediction[key] = answerKey[key];
      return prediction;
    }

    if (quality === "medium" && index !== 4) {
      prediction[key] = answerKey[key];
      return prediction;
    }

    prediction[key] = mode.id === defaultChallengeMode.id ? fallbackValue(key, answerKey[key]) : differentFieldValue(field,answerKey[key]);
    return prediction;
  }, {});
}

function promptQuality(prompt: string, mode: ChallengeModeDefinition) {
  const lower = prompt.toLowerCase();
  const mentionedFindings = mode.fields.filter((field) =>
    termsForField(field, mode).some((term) => lower.includes(term)),
  ).length;

  // Mock mode treats the platform-controlled output contract as satisfied.
  // Its lightweight quality approximation should respond to the participant's
  // clinical strategy, not to formatting instructions that are no longer editable.
  if (mentionedFindings === mode.fields.length) {
    return "strong";
  }

  if (mentionedFindings >= Math.ceil(mode.fields.length * (2 / 3))) {
    return "medium";
  }

  return "weak";
}

const defaultFindingTerms: Record<string, string[]> = {
  acl_tear: ["acl", "anterior cruciate"],
  mcl_injury: ["mcl", "medial collateral"],
  meniscus_tear: ["meniscus", "meniscal"],
  fracture: ["fracture", "bone break"],
  osteoarthritis: ["osteoarthritis", "degenerative", "narrowing", "spurring"],
  effusion: ["effusion", "fluid collection"],
};

function termsForField(
  field: ChallengeFieldDefinition,
  mode: ChallengeModeDefinition,
) {
  if (mode.id === defaultChallengeMode.id) {
    return defaultFindingTerms[field.key] ?? [];
  }

  return [
    field.key.replaceAll("_", " "),
    field.label,
    ...(field.aliases ?? []),
  ].map((term) => term.toLowerCase());
}

function fallbackValue(key: string, correct: string | number | null) {
  if (key === "effusion" && correct === "present") {
    return "uncertain";
  }

  if (correct === "present") {
    return "absent";
  }

  return correct;
}

export function differentFieldValue(field: ChallengeFieldDefinition, expected: string | number | null): string | number | null {
 if(field.type !== 'number') return field.allowedValues.find(v=>v!==expected) ?? null;
 if(typeof expected !== 'number') return field.minimum ?? 0;
 const delta = (field.tolerance ?? 0) + 1;
 if(field.maximum === undefined || expected + delta <= field.maximum) return expected + delta;
 if(field.minimum === undefined || expected - delta >= field.minimum) return expected - delta;
 return null; // Intentionally unsuccessful prediction when no valid wrong number exists.
}
