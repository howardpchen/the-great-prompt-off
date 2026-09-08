import { differentFieldValue } from "./mock-evaluation";
import type { ChallengeModeDefinition } from "./challenge-modes";
import {
  getSimulationProfiles,
  type SimulationProfile,
} from "./simulation-profiles";
import { scoreModelOutput } from "./scoring";

export type SimulationReportScope = "public" | "private" | "all";

export type SimulationAnswerKeyReport = {
  id: string;
  split: "public" | "private";
  answerKey: Record<string, string | number | null>;
};

export type SimulationDryRunResult = {
  ok: true;
  deterministic: true;
  persisted: false;
  modeId: string;
  schemaVersion: number;
  reportScope: SimulationReportScope;
  reportCount: number;
  fieldCount: number;
  totalEvaluations: number;
  profiles: Array<{
    id: string;
    version: number;
    label: string;
    description: string;
    purpose: string;
    score: number;
    correctFields: number;
    totalFields: number;
    validJsonRate: number;
    missingFieldsCount: number;
    invalidValuesCount: number;
  }>;
  messages: string[];
};

export type DeterministicSimulationExecution = {
  summary: SimulationDryRunResult;
  runs: Array<{
    profileId: string;
    profileVersion: number;
    profileLabel: string;
    strategySnapshot: string;
    correctFields: number;
    totalFields: number;
    score: number;
    validJsonCount: number;
    invalidJsonCount: number;
    missingFieldCount: number;
    invalidValueCount: number;
    completedReportCount: number;
    items: Array<{
      reportId: string;
      correctFields: number;
      totalFields: number;
      score: number;
      validJson: boolean;
      missingFields: string[];
      invalidFields: string[];
      scoredValues: Record<string, string | number | null>;
    }>;
  }>;
};

export function runDeterministicSimulation({
  mode,
  reportScope,
  reports,
  profileIds,
}: {
  mode: ChallengeModeDefinition;
  reportScope: SimulationReportScope;
  reports: readonly SimulationAnswerKeyReport[];
  profileIds?: readonly string[];
}): SimulationDryRunResult {
  return executeDeterministicSimulation({
    mode,
    reportScope,
    reports,
    profileIds,
  }).summary;
}

export function executeDeterministicSimulation({
  mode,
  reportScope,
  reports,
  profileIds,
}: {
  mode: ChallengeModeDefinition;
  reportScope: SimulationReportScope;
  reports: readonly SimulationAnswerKeyReport[];
  profileIds?: readonly string[];
}): DeterministicSimulationExecution {
  if (reports.length === 0) {
    throw new Error("No matching reports and answer keys are available for this simulation.");
  }

  const profiles = getSimulationProfiles(profileIds);
  if (profiles.length === 0) {
    throw new Error("Select at least one simulation profile.");
  }

  const executions = profiles.map((profile) => {
    const strategySnapshot = profile.buildStrategy(mode);
    const evaluations = reports.map((report) => {
      const prediction = createDeterministicPrediction(
        profile,
        report.answerKey,
        mode,
      );
      const score = scoreModelOutput(
        JSON.stringify(prediction),
        report.answerKey,
        mode,
      );

      return { report, prediction, score };
    });
    const totalFields = evaluations.reduce(
      (total, evaluation) => total + evaluation.score.per_field.length,
      0,
    );
    const correctFields = evaluations.reduce(
      (total, evaluation) =>
        total + evaluation.score.per_field.filter((field) => field.correct).length,
      0,
    );
    const validJsonCount = evaluations.filter(
      (evaluation) => evaluation.score.valid_json,
    ).length;
    const missingFieldCount = evaluations.reduce(
      (total, evaluation) => total + evaluation.score.missing_fields.length,
      0,
    );
    const invalidValueCount = evaluations.reduce(
      (total, evaluation) => total + evaluation.score.invalid_fields.length,
      0,
    );
    const aggregateScore =
      evaluations.length ? evaluations.reduce((sum,e) => sum + e.score.overall_score,0) / evaluations.length : 0;

    return {
      summary: {
        id: profile.id,
        version: profile.version,
        label: profile.label,
        description: profile.description,
        purpose: profile.purpose,
        score: aggregateScore,
        correctFields,
        totalFields,
        validJsonRate: (validJsonCount / evaluations.length) * 100,
        missingFieldsCount: missingFieldCount,
        invalidValuesCount: invalidValueCount,
      },
      persistence: {
        profileId: profile.id,
        profileVersion: profile.version,
        profileLabel: profile.label,
        strategySnapshot,
        correctFields,
        totalFields,
        score: aggregateScore,
        validJsonCount,
        invalidJsonCount: evaluations.length - validJsonCount,
        missingFieldCount,
        invalidValueCount,
        completedReportCount: evaluations.length,
        items: evaluations.map(({ report, prediction, score }) => ({
          reportId: report.id,
          correctFields: score.per_field.filter((field) => field.correct).length,
          totalFields: score.per_field.length,
          score: score.overall_score,
          validJson: score.valid_json,
          missingFields: score.missing_fields,
          invalidFields: score.invalid_fields.map((field) => field.field),
          scoredValues: prediction,
        })),
      },
    };
  });

  return {
    summary: {
      ok: true,
      deterministic: true,
      persisted: false,
      modeId: mode.id,
      schemaVersion: mode.version,
      reportScope,
      reportCount: reports.length,
      fieldCount: mode.fields.length,
      totalEvaluations: reports.length * profiles.length,
      profiles: executions.map((execution) => execution.summary),
      messages: [
        "Deterministic dry-run only. These results are synthetic and are not a real LLM benchmark.",
        "No participants, attempts, prompt runs, submissions, or leaderboard rows were created.",
      ],
    },
    runs: executions.map((execution) => execution.persistence),
  };
}

function createDeterministicPrediction(
  profile: SimulationProfile,
  answerKey: Record<string, string | number | null>,
  mode: ChallengeModeDefinition,
) {
  return Object.fromEntries(
    mode.fields.map((field, index) => {
      const expected = answerKey[field.key];
      let value: string | number | null;

      switch (profile.predictionPolicy) {
        case "all_not_reported":
          value = "not_reported";
          break;
        case "first_field_only":
          value = index === 0 ? expected : "not_reported";
          break;
        case "weak_all_fields":
          value = index % 3 === 0 ? expected : differentFieldValue(field, expected);
          break;
        case "basic_all_fields":
          value = index % 4 === 0 ? differentFieldValue(field, expected) : expected;
          break;
        case "exact_all_fields":
          value = expected;
          break;
      }

      return [field.key, value];
    }),
  );
}
