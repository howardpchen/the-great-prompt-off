import "server-only";

import { createDatabase } from "./admin";

type ParticipantRow = {
  id: string;
  participant_code: string;
  display_name: string | null;
};

type SubmissionRow = {
  participant_id: string;
  submission_type: "public" | "final";
  score: number;
  submitted_at: string;
  prompt_run_id: string;
};

type PromptRunItemRow = {
  valid_json: boolean;
  missing_fields: unknown;
  invalid_fields: unknown;
};

export type ScoreBucket = {
  label: string;
  count: number;
};

export type AttemptDistributionRow = {
  attempts: number;
  participants: number;
};

export type PracticeFinalComparisonRow = {
  participantCode: string;
  displayName: string | null;
  bestTestScore: number;
  finalScore: number;
  difference: number;
};

export type AttemptsByParticipantRow = {
  participantCode: string;
  displayName: string | null;
  attemptsUsed: number;
  bestTestScore: number | null;
  latestTestScore: number | null;
};

export type AdminAnalyticsData = {
  summary: {
    totalParticipants: number;
    participantsWithTestAttempt: number;
    participantsWithFinalSubmission: number;
    averageBestTestScore: number | null;
    averageFinalScore: number | null;
    highestTestScore: number | null;
    highestFinalScore: number | null;
  };
  practiceImprovement: {
    averageImprovement: number | null;
    participantsImproved: number;
    participantsWithNoImprovement: number;
  };
  attemptBehavior: {
    averageAttemptsUsed: number | null;
    distribution: AttemptDistributionRow[];
  };
  scoreDistributions: {
    test: ScoreBucket[];
    final: ScoreBucket[];
  };
  diagnostics: {
    totalRunItems: number;
    validJsonRate: number | null;
    invalidValuesCount: number;
    missingFieldsCount: number;
    commonInvalidFields: Array<{ field: string; count: number }>;
  };
  attemptsByParticipant: AttemptsByParticipantRow[];
  practiceVsFinal: PracticeFinalComparisonRow[];
};

export async function getAdminAnalyticsData(): Promise<AdminAnalyticsData> {
  const supabase = createDatabase();
  const [participantsResult, submissionsResult, runItemsResult] = await Promise.all([
    supabase.execute<ParticipantRow[]>({ table: "participants", columns: "id, participant_code, display_name", operation: "select", order: [["participant_code", { ascending: true }]] }),
    supabase.execute<SubmissionRow[]>({ table: "submissions", columns: "participant_id, submission_type, score, submitted_at, prompt_run_id", operation: "select", order: [["submitted_at", { ascending: true }]] }),
    supabase.execute<PromptRunItemRow[]>({ table: "prompt_run_items", columns: "valid_json, missing_fields, invalid_fields", operation: "select" }),
  ]);

  if (participantsResult.error) {
    throw new Error(`Failed to load participants: ${participantsResult.error.message}`);
  }

  if (submissionsResult.error) {
    throw new Error(`Failed to load submissions: ${submissionsResult.error.message}`);
  }

  if (runItemsResult.error) {
    throw new Error(`Failed to load prompt run diagnostics: ${runItemsResult.error.message}`);
  }

  const publicSubmissions = submissionsResult.data.filter(
    (submission) => submission.submission_type === "public",
  );
  const finalSubmissions = submissionsResult.data.filter(
    (submission) => submission.submission_type === "final",
  );
  const submissionsByParticipant = new Map<string, SubmissionRow[]>();

  for (const submission of submissionsResult.data) {
    const participantSubmissions =
      submissionsByParticipant.get(submission.participant_id) || [];
    participantSubmissions.push(submission);
    submissionsByParticipant.set(submission.participant_id, participantSubmissions);
  }

  const bestTestScores: number[] = [];
  const finalScores: number[] = [];
  const practiceImprovements: number[] = [];
  let participantsImproved = 0;
  let participantsWithNoImprovement = 0;
  const attemptDistribution = new Map<number, number>();
  const attemptsByParticipant: AttemptsByParticipantRow[] = [];
  const practiceVsFinal: PracticeFinalComparisonRow[] = [];

  for (const participant of participantsResult.data) {
    const submissions = submissionsByParticipant.get(participant.id) || [];
    const tests = submissions.filter(
      (submission) => submission.submission_type === "public",
    );
    const final = submissions.find(
      (submission) => submission.submission_type === "final",
    );
    const attemptsUsed = tests.length;

    attemptDistribution.set(
      attemptsUsed,
      (attemptDistribution.get(attemptsUsed) || 0) + 1,
    );
    attemptsByParticipant.push({
      participantCode: participant.participant_code,
      displayName: participant.display_name,
      attemptsUsed,
      bestTestScore:
        tests.length > 0
          ? Math.max(...tests.map((submission) => submission.score))
          : null,
      latestTestScore: tests.length > 0 ? tests[tests.length - 1].score : null,
    });

    if (tests.length > 0) {
      const firstTestScore = tests[0].score;
      const bestTestScore = Math.max(...tests.map((submission) => submission.score));
      const improvement = bestTestScore - firstTestScore;
      bestTestScores.push(bestTestScore);
      practiceImprovements.push(improvement);

      if (improvement > 0) {
        participantsImproved += 1;
      } else {
        participantsWithNoImprovement += 1;
      }

      if (final) {
        practiceVsFinal.push({
          participantCode: participant.participant_code,
          displayName: participant.display_name,
          bestTestScore,
          finalScore: final.score,
          difference: final.score - bestTestScore,
        });
      }
    }

    if (final) {
      finalScores.push(final.score);
    }
  }

  return {
    summary: {
      totalParticipants: participantsResult.data.length,
      participantsWithTestAttempt: countUniqueParticipants(publicSubmissions),
      participantsWithFinalSubmission: countUniqueParticipants(finalSubmissions),
      averageBestTestScore: average(bestTestScores),
      averageFinalScore: average(finalScores),
      highestTestScore: maxOrNull(publicSubmissions.map((submission) => submission.score)),
      highestFinalScore: maxOrNull(finalScores),
    },
    practiceImprovement: {
      averageImprovement: average(practiceImprovements),
      participantsImproved,
      participantsWithNoImprovement,
    },
    attemptBehavior: {
      averageAttemptsUsed: average(
        participantsResult.data.map((participant) => {
          const submissions = submissionsByParticipant.get(participant.id) || [];

          return submissions.filter(
            (submission) => submission.submission_type === "public",
          ).length;
        }),
      ),
      distribution: Array.from(attemptDistribution.entries())
        .map(([attempts, participants]) => ({ attempts, participants }))
        .sort((left, right) => left.attempts - right.attempts),
    },
    scoreDistributions: {
      test: bucketScores(publicSubmissions.map((submission) => submission.score)),
      final: bucketScores(finalScores),
    },
    diagnostics: buildDiagnostics(runItemsResult.data),
    attemptsByParticipant: attemptsByParticipant.sort(
      (left, right) =>
        right.attemptsUsed - left.attemptsUsed ||
        left.participantCode.localeCompare(right.participantCode),
    ),
    practiceVsFinal: practiceVsFinal.sort(
      (left, right) =>
        right.finalScore - left.finalScore ||
        left.participantCode.localeCompare(right.participantCode),
    ),
  };
}

function countUniqueParticipants(submissions: SubmissionRow[]) {
  return new Set(submissions.map((submission) => submission.participant_id)).size;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function maxOrNull(values: number[]) {
  return values.length > 0 ? Math.max(...values) : null;
}

function bucketScores(scores: number[]): ScoreBucket[] {
  const buckets = [
    { label: "0-20", min: 0, max: 20 },
    { label: "21-40", min: 21, max: 40 },
    { label: "41-60", min: 41, max: 60 },
    { label: "61-80", min: 61, max: 80 },
    { label: "81-100", min: 81, max: 100 },
  ];

  return buckets.map((bucket) => ({
    label: bucket.label,
    count: scores.filter((score) => {
      const rounded = Math.round(score);

      return rounded >= bucket.min && rounded <= bucket.max;
    }).length,
  }));
}

function buildDiagnostics(items: PromptRunItemRow[]): AdminAnalyticsData["diagnostics"] {
  const invalidFieldCounts = new Map<string, number>();
  let missingFieldsCount = 0;
  let invalidValuesCount = 0;

  for (const item of items) {
    const missingFields = arrayValue(item.missing_fields);
    const invalidFields = arrayValue(item.invalid_fields);
    missingFieldsCount += missingFields.length;
    invalidValuesCount += invalidFields.length;

    for (const invalidField of invalidFields) {
      const field = invalidFieldName(invalidField);

      if (field) {
        invalidFieldCounts.set(field, (invalidFieldCounts.get(field) || 0) + 1);
      }
    }
  }

  return {
    totalRunItems: items.length,
    validJsonRate:
      items.length > 0
        ? (items.filter((item) => item.valid_json).length / items.length) * 100
        : null,
    invalidValuesCount,
    missingFieldsCount,
    commonInvalidFields: Array.from(invalidFieldCounts.entries())
      .map(([field, count]) => ({ field, count }))
      .sort((left, right) => right.count - left.count || left.field.localeCompare(right.field))
      .slice(0, 8),
  };
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function invalidFieldName(value: unknown) {
  if (typeof value === "object" && value !== null && "field" in value) {
    const field = (value as { field?: unknown }).field;

    return typeof field === "string" ? field : "";
  }

  return "";
}
