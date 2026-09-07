import "server-only";

import { safeCsvCell, toCsv } from "@/app/lib/csv";
import { randomBytes } from "node:crypto";
import { isEventPhase, type EventPhase } from "@/app/lib/event-phase";
import {
  isLeaderboardVisibility,
  type LeaderboardVisibility,
} from "@/app/lib/leaderboard-visibility";
import {
  getOpenRouterModel,
  resolveOpenRouterModel,
} from "@/app/lib/openrouter";
import { isApprovedEvaluationModel } from "@/app/lib/model-options";
import {
  activatableChallengeModeIds,
  challengeModes,
  defaultChallengeMode,
} from "@/app/lib/challenge-modes";
import { resolveChallengeMode } from "@/app/lib/schema-storage";
import { createDatabase } from "./admin";
import {
  createChallengeModesReadiness,
  type AdminModeReadiness,
  type AdminSchemaAnswerKeyRow,
} from "./admin-challenge-schema";

export type AdminParticipantRow = {
  participantCode: string;
  displayName: string | null;
  email: string | null;
  accessCode: string;
  isActive: boolean;
  extraPublicAttempts: number;
  testAttemptsUsed: number;
  testAttemptsRemaining: number;
  finalSubmitted: boolean;
  latestTestScore: number | null;
  bestTestScore: number | null;
  finalScore: number | null;
  finalSubmittedAt: string | null;
  finalModelName: string | null;
  latestActivityAt: string | null;
  progressStatus: "inactive" | "no_activity" | "practicing" | "final_submitted";
};

export type AdminProgressSummary = {
  activeParticipants: number;
  participantsWithTestAttempt: number;
  participantsWithFinalSubmitted: number;
  participantsWithNoActivity: number;
  averageFinalScore: number | null;
  bestFinalScore: number | null;
};

export type AdminDashboardData = {
  overview: {
    totalParticipants: number;
    participantsWithAccessCodes: number;
    testSubmissionsCount: number;
    finalSubmissionsCount: number;
    participantsCompletedFinal: number;
    latestRunTimestamp: string | null;
    eventPhase: EventPhase;
    leaderboardVisibility: LeaderboardVisibility;
    eventAnnouncement: string;
    eventTimerEndsAt: string | null;
    eventTimerLabel: string;
    challengeSchema: {
      modeId: string;
      schemaVersion: number;
      title: string;
      fields: readonly { key: string; label: string }[];
      configurationLocked: boolean;
      activationOptions: readonly {
        id: string;
        title: string;
        version: number;
        fieldCount: number;
      }[];
    };
    modeReadiness: AdminModeReadiness[];
  };
  health: {
    supabaseConnected: boolean;
    useRealLlm: boolean;
    openRouterModel: string;
    openRouterEnvironmentModel: string;
    challengeEvaluationModel: string | null;
    evaluationModelSource: "challenge_override" | "environment_fallback";
    reportCounts: {
      public: number;
      private: number;
    };
    participantCount: number;
    testSubmissionsCount: number;
    finalSubmissionsCount: number;
    latestRunTimestamp: string | null;
  };
  participants: AdminParticipantRow[];
  progressSummary: AdminProgressSummary;
  leaderboard: AdminParticipantRow[];
};

type ParticipantRow = {
  id: string;
  participant_code: string;
  display_name: string | null;
  email: string | null;
  access_code: string | null;
  is_active: boolean;
};

type SubmissionRow = {
  challenge_id: string;
  participant_id: string;
  submission_type: "public" | "final";
  score: number;
  submitted_at: string;
  prompt_run_id: string;
};

type PromptRunRow = {
  id: string;
  participant_id: string;
  model: string;
  completed_at: string | null;
  created_at: string;
};

type ReportCountRow = {
  id: string;
  challenge_id: string;
  split: "sample" | "public" | "private";
};

type ChallengeControlRow = {
  id: string;
  evaluation_model: string | null;
  mode_id: string | null;
  schema_version: number | null;
  event_phase: EventPhase;
  leaderboard_visibility: LeaderboardVisibility;
  event_announcement: string;
  event_timer_ends_at: string | null;
  event_timer_label: string;
  public_submission_limit: number;
};

type ParticipantAttemptOverrideRow = {
  participant_code: string;
  extra_public_attempts: number;
};

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = createDatabase();
  const [
    challengeResult,
    participantsResult,
    attemptOverridesResult,
    submissionsResult,
    runsResult,
    reportsResult,
  ] =
    await Promise.all([
    supabase.execute<ChallengeControlRow>({ table: "challenges", columns: "id, evaluation_model, mode_id, schema_version, event_phase, leaderboard_visibility, event_announcement, event_timer_ends_at, event_timer_label, public_submission_limit", limit: 1, single: "single", operation: "select", where: [["is_active", "eq", true]], order: [["created_at", { ascending: false }]] }),
    supabase.execute<ParticipantRow[]>({ table: "participants", columns: "id, participant_code, display_name, email, access_code, is_active", operation: "select", order: [["participant_code", { ascending: true }]] }),
    supabase.execute<ParticipantAttemptOverrideRow[]>({ table: "participant_attempt_overrides", columns: "participant_code, extra_public_attempts", operation: "select" }),
    supabase.execute<SubmissionRow[]>({ table: "submissions", columns: "challenge_id, participant_id, submission_type, score, submitted_at, prompt_run_id", operation: "select", order: [["submitted_at", { ascending: true }]] }),
    supabase.execute<PromptRunRow[]>({ table: "prompt_runs", columns: "id, participant_id, model, completed_at, created_at", operation: "select", order: [["created_at", { ascending: false }]] }),
    supabase.execute<ReportCountRow[]>({ table: "reports", columns: "id, challenge_id, split", operation: "select" }),
  ]);

  if (challengeResult.error) {
    throw new Error(`Failed to load active challenge: ${challengeResult.error.message}`);
  }

  if (participantsResult.error) {
    throw new Error(`Failed to load participants: ${participantsResult.error.message}`);
  }

  if (attemptOverridesResult.error) {
    throw new Error(
      `Failed to load participant attempt overrides: ${attemptOverridesResult.error.message}`,
    );
  }

  if (submissionsResult.error) {
    throw new Error(`Failed to load submissions: ${submissionsResult.error.message}`);
  }

  if (runsResult.error) {
    throw new Error(`Failed to load prompt runs: ${runsResult.error.message}`);
  }

  if (reportsResult.error) {
    throw new Error(`Failed to load report counts: ${reportsResult.error.message}`);
  }

  const activeReports = reportsResult.data.filter(
    (report) => report.challenge_id === challengeResult.data.id,
  );
  const readinessReports = activeReports.filter(
    (report): report is ReportCountRow & { split: "public" | "private" } =>
      report.split === "public" || report.split === "private",
  );
  let readinessAnswerKeys: AdminSchemaAnswerKeyRow[] = [];

  if (readinessReports.length > 0) {
    const answerKeysResult = await supabase.execute<AdminSchemaAnswerKeyRow[]>({ table: "answer_keys", columns: "report_id, mode_id, schema_version, provenance, answer_values, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion", operation: "select", where: [["report_id", "in", readinessReports.map((report) => report.id)]] });

    if (answerKeysResult.error) {
      throw new Error(
        `Failed to load answer-key readiness: ${answerKeysResult.error.message}`,
      );
    }
    readinessAnswerKeys = answerKeysResult.data;
  }

  const runsById = new Map(runsResult.data.map((run) => [run.id, run]));
  const extraAttemptsByParticipantCode = new Map(
    attemptOverridesResult.data.map((override) => [
      override.participant_code,
      override.extra_public_attempts,
    ]),
  );
  const runsByParticipant = new Map<string, PromptRunRow[]>();
  const submissionsByParticipant = new Map<string, SubmissionRow[]>();

  for (const run of runsResult.data) {
    const participantRuns = runsByParticipant.get(run.participant_id) || [];
    participantRuns.push(run);
    runsByParticipant.set(run.participant_id, participantRuns);
  }

  for (const submission of submissionsResult.data) {
    const participantSubmissions =
      submissionsByParticipant.get(submission.participant_id) || [];
    participantSubmissions.push(submission);
    submissionsByParticipant.set(submission.participant_id, participantSubmissions);
  }

  const participants = participantsResult.data.map((participant) => {
    const submissions = submissionsByParticipant.get(participant.id) || [];
    const testSubmissions = submissions.filter(
      (submission) => submission.submission_type === "public",
    );
    const finalSubmission =
      submissions.find((submission) => submission.submission_type === "final") || null;
    const latestTest = testSubmissions[testSubmissions.length - 1] || null;
    const bestTestScore =
      testSubmissions.length > 0
        ? Math.max(...testSubmissions.map((submission) => submission.score))
        : null;
    const participantRuns = runsByParticipant.get(participant.id) || [];
    const finalRun = finalSubmission
      ? runsById.get(finalSubmission.prompt_run_id) || null
      : null;
    const latestActivityAt = getLatestTimestamp([
      ...submissions.map((submission) => submission.submitted_at),
      ...participantRuns.map((run) => run.completed_at || run.created_at),
    ]);
    const progressStatus = getParticipantProgressStatus({
      finalSubmitted: Boolean(finalSubmission),
      isActive: participant.is_active,
      latestActivityAt,
      testAttemptsUsed: testSubmissions.length,
    });
    const extraPublicAttempts =
      extraAttemptsByParticipantCode.get(participant.participant_code) ?? 0;
    const effectivePublicSubmissionLimit =
      challengeResult.data.public_submission_limit + extraPublicAttempts;

    return {
      participantCode: participant.participant_code,
      displayName: participant.display_name,
      email: participant.email,
      accessCode: participant.access_code || "",
      isActive: participant.is_active,
      extraPublicAttempts,
      testAttemptsUsed: testSubmissions.length,
      testAttemptsRemaining: Math.max(
        0,
        effectivePublicSubmissionLimit - testSubmissions.length,
      ),
      finalSubmitted: Boolean(finalSubmission),
      latestTestScore: latestTest?.score ?? null,
      bestTestScore,
      finalScore: finalSubmission?.score ?? null,
      finalSubmittedAt: finalSubmission?.submitted_at ?? null,
      finalModelName: finalRun?.model ?? null,
      latestActivityAt,
      progressStatus,
    };
  });

  const testSubmissionsCount = submissionsResult.data.filter(
    (submission) => submission.submission_type === "public",
  ).length;
  const finalSubmissionsCount = submissionsResult.data.filter(
    (submission) => submission.submission_type === "final",
  ).length;
  const latestRunTimestamp =
    runsResult.data[0]?.completed_at || runsResult.data[0]?.created_at || null;
  const challengeMode = resolveChallengeMode(
    challengeResult.data.mode_id,
    challengeResult.data.schema_version,
  );
  const challengeSchema = {
    modeId: challengeResult.data.mode_id || defaultChallengeMode.id,
    schemaVersion: challengeResult.data.schema_version || challengeMode.version,
    title: challengeMode.title,
    fields: challengeMode.fields.map(({ key, label }) => ({ key, label })),
    configurationLocked: submissionsResult.data.some(
      (submission) => submission.challenge_id === challengeResult.data.id,
    ),
    activationOptions: activatableChallengeModeIds.map((modeId) => {
      const mode = challengeModes[modeId];
      return {
        id: mode.id,
        title: mode.title,
        version: mode.version,
        fieldCount: mode.fields.length,
      };
    }),
  };
  const modeReadiness = createChallengeModesReadiness(
    readinessReports,
    readinessAnswerKeys,
    challengeSchema.modeId,
    challengeSchema.schemaVersion,
  );
  const reportCounts = activeReports.reduce(
    (counts, report) => ({
      ...counts,
      [report.split]: (counts[report.split] || 0) + 1,
    }),
    { sample: 0, public: 0, private: 0 } as Record<ReportCountRow["split"], number>,
  );
  const finalScores = participants
    .map((participant) => participant.finalScore)
    .filter((score): score is number => score !== null);
  const progressSummary: AdminProgressSummary = {
    activeParticipants: participants.filter((participant) => participant.isActive)
      .length,
    participantsWithTestAttempt: participants.filter(
      (participant) => participant.testAttemptsUsed > 0,
    ).length,
    participantsWithFinalSubmitted: participants.filter(
      (participant) => participant.finalSubmitted,
    ).length,
    participantsWithNoActivity: participants.filter(
      (participant) => participant.progressStatus === "no_activity",
    ).length,
    averageFinalScore:
      finalScores.length > 0
        ? finalScores.reduce((sum, score) => sum + score, 0) / finalScores.length
        : null,
    bestFinalScore: finalScores.length > 0 ? Math.max(...finalScores) : null,
  };
  const progressSortedParticipants = [...participants].sort(
    (left, right) =>
      progressStatusRank(right.progressStatus) -
        progressStatusRank(left.progressStatus) ||
      right.testAttemptsUsed - left.testAttemptsUsed ||
      left.participantCode.localeCompare(right.participantCode),
  );

  return {
    overview: {
      totalParticipants: participants.length,
      participantsWithAccessCodes: participants.filter((participant) =>
        Boolean(participant.accessCode),
      ).length,
      testSubmissionsCount,
      finalSubmissionsCount,
      participantsCompletedFinal: participants.filter(
        (participant) => participant.finalSubmitted,
      ).length,
      latestRunTimestamp,
      eventPhase: challengeResult.data.event_phase,
      leaderboardVisibility: challengeResult.data.leaderboard_visibility,
      eventAnnouncement: challengeResult.data.event_announcement,
      eventTimerEndsAt: challengeResult.data.event_timer_ends_at,
      eventTimerLabel: challengeResult.data.event_timer_label,
      challengeSchema,
      modeReadiness,
    },
    health: {
      supabaseConnected: true,
      useRealLlm: process.env.USE_REAL_LLM === "true",
      openRouterModel: resolveOpenRouterModel(
        challengeResult.data.evaluation_model,
      ),
      openRouterEnvironmentModel: getOpenRouterModel(),
      challengeEvaluationModel: challengeResult.data.evaluation_model,
      evaluationModelSource: isApprovedEvaluationModel(
        challengeResult.data.evaluation_model,
      )
        ? "challenge_override"
        : "environment_fallback",
      reportCounts: {
        public: reportCounts.public,
        private: reportCounts.private,
      },
      participantCount: participants.length,
      testSubmissionsCount,
      finalSubmissionsCount,
      latestRunTimestamp,
    },
    participants: progressSortedParticipants,
    progressSummary,
    leaderboard: [...participants].sort((a, b) => {
      const bScore = b.finalScore ?? -1;
      const aScore = a.finalScore ?? -1;

      if (bScore !== aScore) {
        return bScore - aScore;
      }

      return (b.bestTestScore ?? -1) - (a.bestTestScore ?? -1);
    }),
  };
}

function getLatestTimestamp(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function getParticipantProgressStatus({
  finalSubmitted,
  isActive,
  latestActivityAt,
  testAttemptsUsed,
}: {
  finalSubmitted: boolean;
  isActive: boolean;
  latestActivityAt: string | null;
  testAttemptsUsed: number;
}): AdminParticipantRow["progressStatus"] {
  if (!isActive) {
    return "inactive";
  }

  if (finalSubmitted) {
    return "final_submitted";
  }

  if (testAttemptsUsed > 0 || latestActivityAt) {
    return "practicing";
  }

  return "no_activity";
}

function progressStatusRank(status: AdminParticipantRow["progressStatus"]) {
  switch (status) {
    case "final_submitted":
      return 4;
    case "practicing":
      return 3;
    case "no_activity":
      return 2;
    case "inactive":
      return 1;
  }
}

export async function updateActiveChallengePhase(phase: EventPhase) {
  if (!isEventPhase(phase)) {
    throw new Error("Invalid event phase.");
  }

  const supabase = createDatabase();
  const { error } = await supabase.execute<Record<string, unknown>[]>({ table: "challenges", values: { event_phase: phase }, operation: "update", where: [["is_active", "eq", true]] });

  if (error) {
    throw new Error(`Failed to update event phase: ${error.message}`);
  }
}

export async function updateActiveChallengeLeaderboardVisibility(
  visibility: LeaderboardVisibility,
) {
  if (!isLeaderboardVisibility(visibility)) {
    throw new Error("Invalid leaderboard visibility.");
  }

  const supabase = createDatabase();
  const { error } = await supabase.execute<Record<string, unknown>[]>({ table: "challenges", values: { leaderboard_visibility: visibility }, operation: "update", where: [["is_active", "eq", true]] });

  if (error) {
    throw new Error(`Failed to update leaderboard visibility: ${error.message}`);
  }
}

export async function updateActiveChallengeAnnouncement(announcement: string) {
  const normalizedAnnouncement = announcement.trim();

  if (normalizedAnnouncement.length > 240) {
    throw new Error("Announcement must be 240 characters or fewer.");
  }

  const supabase = createDatabase();
  const { error } = await supabase.execute<Record<string, unknown>[]>({ table: "challenges", values: { event_announcement: normalizedAnnouncement }, operation: "update", where: [["is_active", "eq", true]] });

  if (error) {
    throw new Error(`Failed to update announcement: ${error.message}`);
  }
}

export async function updateActiveChallengeTimer({
  durationMinutes,
  label,
}: {
  durationMinutes: number | null;
  label: string;
}) {
  const normalizedLabel = label.trim();

  if (normalizedLabel.length > 80) {
    throw new Error("Timer label must be 80 characters or fewer.");
  }

  if (
    durationMinutes !== null &&
    (!Number.isInteger(durationMinutes) ||
      durationMinutes < 1 ||
      durationMinutes > 180)
  ) {
    throw new Error("Timer duration must be between 1 and 180 minutes.");
  }

  const supabase = createDatabase();
  const eventTimerEndsAt =
    durationMinutes === null
      ? null
      : new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  const { error } = await supabase.execute<Record<string, unknown>[]>({ table: "challenges", values: {
      event_timer_ends_at: eventTimerEndsAt,
      event_timer_label: durationMinutes === null ? "" : normalizedLabel,
    }, operation: "update", where: [["is_active", "eq", true]] });

  if (error) {
    throw new Error(`Failed to update event timer: ${error.message}`);
  }

  return {
    eventTimerEndsAt,
    eventTimerLabel: durationMinutes === null ? "" : normalizedLabel,
  };
}

export async function resetWorkshopRunData() {
  const supabase = createDatabase();
  const { error } = await supabase.rpc("admin_reset_workshop_run_data");

  if (error) {
    throw new Error(`Failed to reset workshop run data: ${adminRpcError(error.message)}`);
  }
}

export async function regenerateParticipantAccessCode(participantCode: string) {
  const supabase = createDatabase();
  let accessCode = createParticipantAccessCode();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data: existing, error: existingError } = await supabase.execute<{ id: string }>({ table: "participants", columns: "id", single: "maybeSingle", operation: "select", where: [["access_code", "eq", accessCode]] });

    if (existingError) {
      throw new Error(`Failed to check access code uniqueness: ${existingError.message}`);
    }

    if (!existing) {
      break;
    }

    accessCode = createParticipantAccessCode();
  }

  const { error } = await supabase.execute<Record<string, unknown>[]>({ table: "participants", values: { access_code: accessCode }, operation: "update", where: [["participant_code", "eq", participantCode]] });

  if (error) {
    throw new Error(`Failed to regenerate access code: ${error.message}`);
  }

  return accessCode;
}

export async function clearParticipantRunData(participantCode: string) {
  const supabase = createDatabase();
  const { error } = await supabase.rpc("admin_clear_participant_run_data", {
    target_participant_code: participantCode,
  });

  if (error) {
    throw new Error(`Failed to clear participant run data: ${adminRpcError(error.message)}`);
  }
}

export async function grantExtraPublicAttempt(participantCode: string) {
  const supabase = createDatabase();
  const normalizedParticipantCode = participantCode.trim().toUpperCase();
  const { data: participant, error: participantError } = await supabase.execute<{ participant_code: string; is_active: boolean }>({ table: "participants", columns: "participant_code, is_active", single: "maybeSingle", operation: "select", where: [["participant_code", "eq", normalizedParticipantCode]] });

  if (participantError) {
    throw new Error(`Failed to load participant: ${participantError.message}`);
  }

  if (!participant) {
    throw new Error("Participant not found.");
  }

  if (!participant.is_active) {
    throw new Error("Reactivate this participant before granting an extra Test Attempt.");
  }

  const { data: existing, error: existingError } = await supabase.execute<{ extra_public_attempts: number }>({ table: "participant_attempt_overrides", columns: "extra_public_attempts", single: "maybeSingle", operation: "select", where: [["participant_code", "eq", normalizedParticipantCode]] });

  if (existingError) {
    throw new Error(
      `Failed to load participant attempt override: ${existingError.message}`,
    );
  }

  const extraPublicAttempts = (existing?.extra_public_attempts ?? 0) + 1;
  const { error: upsertError } = await supabase.execute<Record<string, unknown>[]>({ table: "participant_attempt_overrides", values: {
      participant_code: normalizedParticipantCode,
      extra_public_attempts: extraPublicAttempts,
      updated_at: new Date().toISOString(),
    }, operation: "upsert" });

  if (upsertError) {
    throw new Error(`Failed to grant extra Test Attempt: ${upsertError.message}`);
  }

  return extraPublicAttempts;
}

function adminRpcError(message: string) {
  if (
    message.toLowerCase().includes("admin_reset_workshop_run_data") ||
    message.toLowerCase().includes("admin_clear_participant_run_data") ||
    message.toLowerCase().includes("function") ||
    message.toLowerCase().includes("where clause")
  ) {
    return `${message}. Ask the operator to verify and apply the ordered PostgreSQL migrations using deploy/README.md; do not reset or reseed existing event data.`;
  }

  return message;
}

export async function setParticipantActive(participantCode: string, isActive: boolean) {
  const supabase = createDatabase();
  const { error } = await supabase.execute<Record<string, unknown>[]>({ table: "participants", values: { is_active: isActive }, operation: "update", where: [["participant_code", "eq", participantCode]] });

  if (error) {
    throw new Error(`Failed to update participant status: ${error.message}`);
  }
}

export async function updateParticipantIdentity({
  displayName,
  email,
  participantCode,
}: {
  displayName: string | null;
  email: string | null;
  participantCode: string;
}) {
  const supabase = createDatabase();
  const { error } = await supabase.execute<Record<string, unknown>[]>({ table: "participants", values: {
      display_name: displayName,
      email,
    }, operation: "update", where: [["participant_code", "eq", participantCode]] });

  if (error) {
    throw new Error(`Failed to update participant identity: ${error.message}`);
  }
}

function createParticipantAccessCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");

  return `GPO-${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

export { safeCsvCell, toCsv };
