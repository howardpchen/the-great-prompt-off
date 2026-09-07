import "server-only";
import { reserveAttempt, failReservation, AttemptAdmissionError } from "../db/attempts";

import { fallbackChallengeConfig } from "@/app/lib/challenge-config";
import { getAnswerKeyItems } from "@/app/lib/challenge-data";
import type { ChallengeModeDefinition } from "@/app/lib/challenge-modes";
import type { EventPhase } from "@/app/lib/event-phase";
import {
  canShowParticipantLeaderboard,
  type LeaderboardVisibility,
} from "@/app/lib/leaderboard-visibility";
import {
  extractReportWithOpenRouter,
  getOpenRouterConcurrency,
  hasOpenRouterApiKey,
  resolveOpenRouterModel,
  shouldUseRealLlm,
} from "@/app/lib/openrouter";
import { normalizeParticipantCode } from "@/app/lib/participant-codes";
import {
  countCorrectFields,
  evaluateAnswerKeyReports,
  evaluateAnswerKeySet,
  summarizeReportResults,
} from "@/app/lib/mock-evaluation";
import { scoreModelOutput } from "@/app/lib/scoring";
import {
  buildScoredValues,
  canUseLegacySixFieldAnswerKey,
  createRunSchemaMetadata,
  resolveChallengeMode,
  validateAnswerValues,
} from "@/app/lib/schema-storage";
import type {
  FindingValue,
  ReportSplit,
  SchemaScoringResult,
  ScoreSummary,
  SubmissionKind,
} from "@/app/lib/types";
import { createDatabase } from "./admin";

type DataSource = "supabase" | "mock-file-fallback";

type ActiveChallenge = {
  id: string;
  locked_model: string;
  evaluation_model: string | null;
  mode_id: string | null;
  schema_version: number | null;
  public_submission_limit: number;
  final_submission_limit: number;
  event_phase: EventPhase;
  leaderboard_visibility: LeaderboardVisibility;
};

type Participant = {
  id: string;
  participant_code: string;
  is_active: boolean;
};

type SubmissionRow = {
  id: string;
  participant_id: string;
  submission_type: SubmissionKind;
  attempt_number: number;
  score: number;
  correct_fields: number;
  total_fields: number;
  report_count: number;
  submitted_at: string;
};

type ReportRow = {
  id: string;
  external_id: string;
  filename: string | null;
  split: ReportSplit;
  report_text: string;
};

type AnswerKeyRow = {
  report_id: string;
  mode_id: string | null;
  schema_version: number | null;
  answer_values: unknown;
  acl_tear: FindingValue;
  mcl_injury: FindingValue;
  meniscus_tear: FindingValue;
  fracture: FindingValue;
  osteoarthritis: FindingValue;
  effusion: FindingValue;
};

type SupabaseErrorLike = {
  code?: string;
  message: string;
};

type RuntimeAnswerKeyItem = {
  id: string;
  filename: string;
  split: ReportSplit;
  answer_key: Record<string, string>;
  notes?: string;
  supabaseReportId?: string;
  text?: string;
};

export type SubmissionStatusResponse = {
  source: DataSource;
  fallbackReason: string | null;
  publicSubmissionLimit: number;
  extraPublicAttempts: number;
  publicSubmissionsUsed: number;
  remainingPublicSubmissions: number;
  latestPublicScore: number | null;
  finalSubmissionUsed: boolean;
  finalScore: number | null;
};

export type SubmitScoreResponse = SubmissionStatusResponse & {
  kind: SubmissionKind;
  evaluationMode: "mock" | "real_llm";
  model: string | null;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
  summary: ScoreSummary;
  feedback?: SafeSubmissionFeedback;
};

export type SafeSubmissionFeedback = {
  kind: SubmissionKind;
  score: number;
  correctFields: number;
  totalFields: number;
  reportCount: number;
  validJsonCount?: number;
  missingFieldsCount?: number;
  invalidValuesCount?: number;
  reportScores?: Array<{
    reportLabel: string;
    correctFields: number;
    totalFields: number;
  }>;
  reportDetails?: Array<{
    reportLabel: string;
    filename: string;
    correctFields: number;
    totalFields: number;
    strictJsonValid: boolean;
    recoveredJsonUsed: boolean;
    nestedObjectUsed: boolean;
    normalizationUsed: boolean;
    keyNormalizationUsed: boolean;
    valueNormalizationUsed: boolean;
    ignoredOuterKey: string | null;
    missingFields: string[];
    invalidFields: Array<{
      field: string;
      value: unknown;
    }>;
    ignoredExtraFields: string[];
    rawModelOutput: string;
  }>;
};

type EvaluatedReport = {
  reportId: string;
  filename?: string;
  supabaseReportId?: string;
  prediction: Record<string, string>;
  score: SchemaScoringResult;
  modelOutput: string;
  error: string | null;
};

type EvaluationResult = {
  mode: "mock" | "real_llm";
  model: string | null;
  summary: ScoreSummary;
  reportCount: number;
  items: EvaluatedReport[];
};

export type LeaderboardRow = {
  rank: number;
  participant: string;
  score: number;
  final: boolean;
  submittedAt?: string;
};

export type LeaderboardResponse = {
  source: DataSource;
  fallbackReason: string | null;
  visible: boolean;
  rows: LeaderboardRow[];
};

export function fallbackStatus(reason: string): SubmissionStatusResponse {
  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    publicSubmissionLimit: fallbackChallengeConfig.publicSubmissionLimit,
    extraPublicAttempts: 0,
    publicSubmissionsUsed: 0,
    remainingPublicSubmissions: fallbackChallengeConfig.publicSubmissionLimit,
    latestPublicScore: null,
    finalSubmissionUsed: false,
    finalScore: null,
  };
}

export function fallbackLeaderboard(reason: string): LeaderboardResponse {
  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    visible: process.env.ALLOW_LOCAL_FALLBACK === "true",
    rows: [],
  };
}

export async function getSupabaseSubmissionStatus(
  participantCode: string,
): Promise<SubmissionStatusResponse> {
  const supabase = createDatabase();
  const challenge = await getActiveChallenge(supabase);
  const participant = await getParticipantByCode(
    supabase,
    normalizeParticipantCode(participantCode),
  );

  if (!participant) {
    throw new ParticipantValidationError(
      "Participant session is valid, but the participant is not registered.",
    );
  }

  if (!participant.is_active) {
    throw new ParticipantValidationError("This participant is inactive.");
  }

  return getSubmissionStatusForParticipant(
    supabase,
    challenge,
    participant.id,
    participant.participant_code,
  );
}

export async function submitToSupabase({
  kind,
  participantCode,
  prompt,
  idempotencyKey,
}: {
  kind: SubmissionKind;
  participantCode: string;
  prompt: string;
  idempotencyKey?: string;
}): Promise<SubmitScoreResponse> {
  const supabase = createDatabase();
  let challenge = await getActiveChallenge(supabase);
  const participant = await getParticipantByCode(
    supabase,
    normalizeParticipantCode(participantCode),
  );

  if (!participant) {
    throw new ParticipantValidationError(
      "Participant session is valid, but the participant is not registered.",
    );
  }

  if (!participant.is_active) {
    throw new ParticipantValidationError("This participant is inactive.");
  }

  let reservation;
  try {reservation = await reserveAttempt(supabase, {challengeId:challenge.id, participantId:participant.id, kind, prompt, idempotencyKey});}
  catch(error) {if(error instanceof AttemptAdmissionError) throw new SubmissionLimitError(error.message);throw error;}
  if(reservation.status === 'completed') return reservation.response as SubmitScoreResponse;
  try {
  const refreshedChallenge = await getActiveChallenge(supabase);
  if(refreshedChallenge.id !== challenge.id) throw new EventPhaseError("Active challenge changed; please reload.");
  challenge = refreshedChallenge;
  const challengeMode = resolveChallengeMode(challenge.mode_id,challenge.schema_version);
  const split: ReportSplit = kind === "public" ? "public" : "private";
  const answerKeys = await getSupabaseAnswerKeysForSplit(
    supabase,
    challenge.id,
    split,
    challengeMode,
  );
  const evaluation = await evaluateSubmission({
    answerKeys,
    kind,
    prompt,
    model: resolveOpenRouterModel(challenge.evaluation_model),
    mode: challengeMode,
  });
  return await supabase.transaction(async (supabase) => {
  const [held] = await supabase.sql<{status:string}>('SELECT status FROM attempt_reservations WHERE id=$1 FOR UPDATE',[reservation.id]);
  if(held?.status !== 'pending') throw new SubmissionLimitError('Attempt reservation is no longer active.');
  const now = new Date().toISOString();
  const attemptNumber =
    reservation.attempt_number;
  const runType = kind === "public" ? "public_submission" : "final_submission";
  const promptText = prompt.trim() ? prompt : "(blank prompt)";

  const { data: promptRun, error: promptRunError } = await supabase.execute<{ id: string }>({ table: "prompt_runs", values: {
      challenge_id: challenge.id,
      participant_id: participant.id,
      run_type: runType,
      prompt_text: promptText,
      ...createRunSchemaMetadata(challengeMode),
      model:
        evaluation.model ||
        (evaluation.mode === "mock" ? "mock-evaluator" : challenge.locked_model),
      total_reports: evaluation.reportCount,
      correct_fields: evaluation.summary.correct,
      total_fields: evaluation.summary.total,
      field_accuracy: evaluation.summary.accuracy,
      overall_score: evaluation.summary.accuracy,
      completed_at: now,
    }, columns: "id", single: "single", operation: "insert" });

  if (promptRunError) {
    throw new SubmissionStorageError(
      `Your ${kind === "final" ? "final submission" : "test attempt"} was not counted. Please try again or contact the organizer.`,
      promptRunError.message,
    );
  }

  if (evaluation.items.length > 0) {
    const { error: runItemsError } = await supabase.execute<Record<string, unknown>[]>({ table: "prompt_run_items", values: evaluation.items.map((item) => ({
          prompt_run_id: promptRun.id,
          report_id: item.supabaseReportId,
          raw_model_output: item.modelOutput,
          parsed_output: parseJsonObject(item.modelOutput),
          valid_json: item.score.valid_json,
          missing_fields: item.score.missing_fields,
          invalid_fields: item.score.invalid_fields,
          field_accuracy: item.score.field_accuracy,
          overall_score: item.score.overall_score,
          scored_values: item.prediction,
          acl_tear: item.prediction.acl_tear ?? null,
          mcl_injury: item.prediction.mcl_injury ?? null,
          meniscus_tear: item.prediction.meniscus_tear ?? null,
          fracture: item.prediction.fracture ?? null,
          osteoarthritis: item.prediction.osteoarthritis ?? null,
          effusion: item.prediction.effusion ?? null,
          error_message: item.error,
        })), operation: "insert" });

    if (runItemsError) {
      // Transaction rollback removes partial rows.
      throw new SubmissionStorageError(
        `Your ${kind === "final" ? "final submission" : "test attempt"} was not counted. Please try again or contact the organizer.`,
        runItemsError.message,
      );
    }
  }

  const { error: submissionError } = await supabase.execute<Record<string, unknown>[]>({ table: "submissions", values: {
    challenge_id: challenge.id,
    participant_id: participant.id,
    prompt_run_id: promptRun.id,
    submission_type: kind,
    attempt_number: attemptNumber,
    score: evaluation.summary.accuracy,
    correct_fields: evaluation.summary.correct,
    total_fields: evaluation.summary.total,
    report_count: evaluation.reportCount,
    mode_id: challengeMode.id,
    schema_version: challengeMode.version,
    submitted_at: now,
  }, operation: "insert" });

  if (submissionError) {
    // Transaction rollback removes partial rows.

    if (kind === "final" && isDuplicateSubmissionError(submissionError)) {
      throw new SubmissionLimitError("Final submission has already been used.");
    }

    throw new SubmissionStorageError(
      `Your ${kind === "final" ? "final submission" : "test attempt"} was not counted. Please try again or contact the organizer.`,
      submissionError.message,
    );
  }

  const nextStatus = await getSubmissionStatusForParticipant(
    supabase,
    challenge,
    participant.id,
    participant.participant_code,
  );

  const response: SubmitScoreResponse = {
    ...nextStatus,
    kind,
    evaluationMode: evaluation.mode,
    model: evaluation.model,
    score: evaluation.summary.accuracy,
    correctFields: evaluation.summary.correct,
    totalFields: evaluation.summary.total,
    reportCount: evaluation.reportCount,
    summary: evaluation.summary,
    feedback: createSafeFeedback(kind, evaluation),
  };
  await supabase.sql("UPDATE attempt_reservations SET status='completed',response=$2::jsonb,completed_at=now() WHERE id=$1",[reservation.id,JSON.stringify(response)]);
  return response;
  });
  } catch(error) {await failReservation(supabase,reservation.id);throw error;}

}

export async function getSupabaseLeaderboard(): Promise<LeaderboardResponse> {
  const supabase = createDatabase();
  const challenge = await getActiveChallenge(supabase);

  if (
    !canShowParticipantLeaderboard({
      eventPhase: challenge.event_phase,
      visibility: challenge.leaderboard_visibility,
    })
  ) {
    return {
      source: "supabase",
      fallbackReason: null,
      visible: false,
      rows: [],
    };
  }

  if (challenge.event_phase === "not_started") {
    return {
      source: "supabase",
      fallbackReason: null,
      visible: true,
      rows: [],
    };
  }

  const submissionType: SubmissionKind =
    challenge.event_phase === "practice_open" ? "public" : "final";
  const { data: submissions, error: submissionsError } = await supabase.execute<Array<Pick<SubmissionRow, "participant_id" | "score" | "submitted_at">>>({ table: "submissions", columns: "participant_id, score, submitted_at", operation: "select", where: [["challenge_id", "eq", challenge.id],["submission_type", "eq", submissionType]], order: [["score", { ascending: false }],["submitted_at", { ascending: true }]] });

  if (submissionsError) {
    throw new Error(`Failed to load leaderboard: ${submissionsError.message}`);
  }

  const leaderboardSubmissions =
    submissionType === "public"
      ? getBestPublicLeaderboardSubmissions(submissions)
      : submissions.slice(0, 25);
  const participantIds = [
    ...new Set(leaderboardSubmissions.map((row) => row.participant_id)),
  ];
  const participantCodes = await getParticipantCodes(supabase, participantIds);

  return {
    source: "supabase",
    fallbackReason: null,
    visible: true,
    rows: leaderboardSubmissions.map((submission, index) => ({
      rank: index + 1,
      participant:
        participantCodes.get(submission.participant_id) || submission.participant_id,
      score: Math.round(submission.score),
      final: submissionType === "final",
      submittedAt: submission.submitted_at,
    })),
  };
}

function getBestPublicLeaderboardSubmissions(
  submissions: Array<Pick<SubmissionRow, "participant_id" | "score" | "submitted_at">>,
) {
  const bestByParticipant = new Map<
    string,
    Pick<SubmissionRow, "participant_id" | "score" | "submitted_at">
  >();

  for (const submission of submissions) {
    const currentBest = bestByParticipant.get(submission.participant_id);

    if (
      !currentBest ||
      submission.score > currentBest.score ||
      (submission.score === currentBest.score &&
        submission.submitted_at < currentBest.submitted_at)
    ) {
      bestByParticipant.set(submission.participant_id, submission);
    }
  }

  return [...bestByParticipant.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.submitted_at.localeCompare(right.submitted_at),
    )
    .slice(0, 25);
}

export function getFallbackSubmissionScore(
  kind: SubmissionKind,
  prompt: string,
): Omit<SubmitScoreResponse, keyof SubmissionStatusResponse> {
  const split = kind === "public" ? "public" : "private";
  const answerKeys = getAnswerKeyItems().filter((item) => item.split === split);
  const items = evaluateAnswerKeyReports(answerKeys, prompt).map((item) => ({
    ...item,
    filename: answerKeys.find((answerKey) => answerKey.id === item.reportId)
      ?.filename,
    modelOutput: item.modelOutput ?? "",
    error: item.error ?? null,
  }));
  const summary =
    kind === "public" || kind === "final"
      ? summarizeReportResults(items)
      : evaluateAnswerKeySet(answerKeys, prompt);
  const evaluation: EvaluationResult = {
    mode: "mock",
    model: null,
    summary,
    reportCount: answerKeys.length,
    items,
  };

  return {
    kind,
    evaluationMode: "mock",
    model: null,
    score: summary.accuracy,
    correctFields: summary.correct,
    totalFields: summary.total,
    reportCount: answerKeys.length,
    summary,
    feedback: createSafeFeedback(kind, evaluation),
  };
}

export class SubmissionLimitError extends Error {}

export class ParticipantValidationError extends Error {}

export class RealLlmEvaluationError extends Error {}

export class EventPhaseError extends Error {}

export class SubmissionStorageError extends Error {
  constructor(message: string, public readonly detail: string) {
    super(message);
  }
}

async function evaluateSubmission({
  answerKeys,
  kind,
  prompt,
  model,
  mode,
}: {
  answerKeys: RuntimeAnswerKeyItem[];
  kind: SubmissionKind;
  prompt: string;
  model: string;
  mode: ChallengeModeDefinition;
}): Promise<EvaluationResult> {
  if (shouldUseRealLlm()) {
    return evaluateWithRealLlm(answerKeys, prompt, kind, model, mode);
  }

  if (kind === "public" || kind === "final") {
    const items = evaluateAnswerKeyReports(answerKeys, prompt, mode).map((item) => ({
      ...item,
      filename: answerKeys.find((answerKey) => answerKey.id === item.reportId)
        ?.filename,
      supabaseReportId: answerKeys.find((answerKey) => answerKey.id === item.reportId)
        ?.supabaseReportId,
      modelOutput: item.modelOutput ?? "",
      error: item.error ?? null,
    }));

    return {
      mode: "mock",
      model: null,
      summary: summarizeReportResults(items),
      reportCount: answerKeys.length,
      items,
    };
  }

  const summary = evaluateAnswerKeySet(answerKeys, prompt, mode);

  return {
    mode: "mock",
    model: null,
    summary,
    reportCount: answerKeys.length,
    items: [],
  };
}

async function evaluateWithRealLlm(
  answerKeys: RuntimeAnswerKeyItem[],
  prompt: string,
  kind: SubmissionKind,
  model: string,
  mode: ChallengeModeDefinition,
): Promise<EvaluationResult> {
  if (!hasOpenRouterApiKey()) {
    console.error(
      `[submission-workflow] OPENROUTER_API_KEY missing for ${submissionLabel(kind)}.`,
    );
    throw new RealLlmEvaluationError(
      "The evaluation model could not complete this request. Please try again.",
    );
  }

  const concurrency = getOpenRouterConcurrency();

  try {
    // Final submissions can evaluate many private reports. Limit OpenRouter
    // fan-out so one participant submission is less likely to hit rate limits.
    const items = await mapWithConcurrency(
      answerKeys,
      concurrency,
      async (item) => {
        if (!item.text) {
          throw new Error(`Missing report text for ${item.id}.`);
        }

        const modelOutput = await extractReportWithOpenRouter({
          prompt,
          reportText: item.text,
          model,
          mode,
        });
        const score = scoreModelOutput(modelOutput, item.answer_key, mode);

        return {
          reportId: item.id,
          filename: item.filename,
          supabaseReportId: item.supabaseReportId,
          prediction: predictionFromScore(score.per_field),
          score,
          modelOutput,
          error: validationMessage(score),
        };
      },
    );

    return {
      mode: "real_llm",
      model,
      summary: summarizeReportResults(items),
      reportCount: answerKeys.length,
      items,
    };
  } catch {
    const message = "Evaluation provider request failed";

    console.error("[submission-workflow] Real LLM evaluation failed", {
      kind,
      message,
    });

    throw new RealLlmEvaluationError(
      "The evaluation model could not complete this request. Please try again.",
    );
  }
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

export async function getActiveChallenge(
  supabase: ReturnType<typeof createDatabase>,
) {
  const { data, error } = await supabase.execute<ActiveChallenge>({ table: "challenges", columns: "id, locked_model, evaluation_model, mode_id, schema_version, public_submission_limit, final_submission_limit, event_phase, leaderboard_visibility", limit: 1, single: "single", operation: "select", where: [["is_active", "eq", true]], order: [["created_at", { ascending: false }]] });

  if (error) {
    throw new Error(`Supabase active challenge unavailable: ${error.message}`);
  }

  return data;
}

async function getParticipantByCode(
  supabase: ReturnType<typeof createDatabase>,
  participantCode: string,
) {
  const { data, error } = await supabase.execute<Participant>({ table: "participants", columns: "id, participant_code, is_active", single: "maybeSingle", operation: "select", where: [["participant_code", "eq", participantCode]] });

  if (error) {
    throw new Error(`Failed to load participant: ${error.message}`);
  }

  return data;
}

async function getSubmissionStatusForParticipant(
  supabase: ReturnType<typeof createDatabase>,
  challenge: ActiveChallenge,
  participantId: string,
  participantCode: string,
): Promise<SubmissionStatusResponse> {
  const { data, error } = await supabase.execute<SubmissionRow[]>({ table: "submissions", columns: "id, participant_id, submission_type, attempt_number, score, correct_fields, total_fields, report_count, submitted_at", operation: "select", where: [["challenge_id", "eq", challenge.id],["participant_id", "eq", participantId]], order: [["submitted_at", { ascending: true }]] });

  if (error) {
    throw new Error(`Failed to load submissions: ${error.message}`);
  }

  const publicSubmissions = data.filter(
    (submission) => submission.submission_type === "public",
  );
  const finalSubmission =
    data.find((submission) => submission.submission_type === "final") ?? null;
  const latestPublic = publicSubmissions[publicSubmissions.length - 1] ?? null;
  const extraPublicAttempts = await getExtraPublicAttempts(supabase, participantCode);
  const publicSubmissionLimit =
    challenge.public_submission_limit + extraPublicAttempts;
  const remainingPublicSubmissions = Math.max(
    0,
    publicSubmissionLimit - publicSubmissions.length,
  );

  return {
    source: "supabase",
    fallbackReason: null,
    publicSubmissionLimit,
    extraPublicAttempts,
    publicSubmissionsUsed: publicSubmissions.length,
    remainingPublicSubmissions,
    latestPublicScore: latestPublic?.score ?? null,
    finalSubmissionUsed: Boolean(finalSubmission),
    finalScore: finalSubmission?.score ?? null,
  };
}

async function getExtraPublicAttempts(
  supabase: ReturnType<typeof createDatabase>,
  participantCode: string,
) {
  const { data, error } = await supabase.execute<{ extra_public_attempts: number }>({ table: "participant_attempt_overrides", columns: "extra_public_attempts", single: "maybeSingle", operation: "select", where: [["participant_code", "eq", participantCode]] });

  if (error) {
    throw new Error(`Failed to load participant attempt overrides: ${error.message}`);
  }

  return data?.extra_public_attempts ?? 0;
}

export async function getSupabaseAnswerKeysForSplit(
  supabase: ReturnType<typeof createDatabase>,
  challengeId: string,
  split: ReportSplit,
  mode = resolveChallengeMode(),
) {
  const { data: reports, error: reportsError } = await supabase.execute<ReportRow[]>({ table: "reports", columns: "id, external_id, filename, split, report_text", operation: "select", where: [["challenge_id", "eq", challengeId],["split", "eq", split]], order: [["external_id", { ascending: true }]] });

  if (reportsError) {
    throw new Error(`Failed to load ${split} reports: ${reportsError.message}`);
  }

  if (reports.length === 0) {
    throw new Error(`No ${split} reports are seeded.`);
  }

  const reportIds = reports.map((report) => report.id);
  const { data: answerKeys, error: answerKeysError } = await supabase.execute<AnswerKeyRow[]>({ table: "answer_keys", columns: "report_id, mode_id, schema_version, answer_values, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion", operation: "select", where: [["report_id", "in", reportIds],["mode_id", "eq", mode.id],["schema_version", "eq", mode.version]] });

  if (answerKeysError) {
    throw new Error(`Failed to load ${split} answer keys: ${answerKeysError.message}`);
  }

  const answerKeyByReportId = new Map(
    answerKeys.map((answerKey) => [answerKey.report_id, answerKey]),
  );

  return reports.map((report) => {
    const answerKey = answerKeyByReportId.get(report.id);

    if (!answerKey) {
      throw new Error(`Missing answer key for ${report.external_id}.`);
    }

    const legacyAnswerValues = {
      acl_tear: answerKey.acl_tear,
      mcl_injury: answerKey.mcl_injury,
      meniscus_tear: answerKey.meniscus_tear,
      fracture: answerKey.fracture,
      osteoarthritis: answerKey.osteoarthritis,
      effusion: answerKey.effusion,
    };
    const answerValues = validateAnswerValues(
      answerKey.answer_values ??
        (canUseLegacySixFieldAnswerKey(mode) ? legacyAnswerValues : null),
      mode,
    );

    return {
      id: report.external_id,
      supabaseReportId: report.id,
      filename: report.filename || report.external_id,
      split: report.split,
      text: report.report_text,
      answer_key: answerValues,
    } satisfies RuntimeAnswerKeyItem;
  });
}

function validationMessage(score: SchemaScoringResult) {
  if (!score.valid_json) {
    return "Model output was not valid JSON.";
  }

  const problems: string[] = [];

  if (score.missing_fields.length > 0) {
    problems.push(`Missing fields: ${score.missing_fields.join(", ")}`);
  }

  if (score.invalid_fields.length > 0) {
    problems.push(
      `Invalid fields: ${score.invalid_fields
        .map((field) => field.field)
        .join(", ")}`,
    );
  }

  return problems.length > 0 ? problems.join(". ") : null;
}

function createSafeFeedback(
  kind: SubmissionKind,
  evaluation: EvaluationResult,
): SafeSubmissionFeedback {
  const feedback: SafeSubmissionFeedback = {
    kind,
    score: evaluation.summary.accuracy,
    correctFields: evaluation.summary.correct,
    totalFields: evaluation.summary.total,
    reportCount: evaluation.reportCount,
  };

  const items = evaluation.items;

  const aggregateFeedback = {
    ...feedback,
    validJsonCount: items.filter((item) => item.score.valid_json).length,
    missingFieldsCount: items.reduce(
      (sum, item) => sum + item.score.missing_fields.length,
      0,
    ),
    invalidValuesCount: items.reduce(
      (sum, item) => sum + item.score.invalid_fields.length,
      0,
    ),
  };

  if (kind !== "public") {
    return aggregateFeedback;
  }

  return {
    ...aggregateFeedback,
    reportScores: items.map((item, index) => ({
      reportLabel: reportLabel(item.reportId, index),
      correctFields: countCorrectFields(item.score),
      totalFields: item.score.per_field.length,
    })),
    reportDetails: items.map((item, index) => ({
      reportLabel: reportLabel(item.reportId, index),
      filename: item.filename || item.reportId,
      correctFields: countCorrectFields(item.score),
      totalFields: item.score.per_field.length,
      strictJsonValid: item.score.diagnostics.strict_json_valid,
      recoveredJsonUsed: item.score.diagnostics.recovered_json_used,
      nestedObjectUsed: item.score.diagnostics.nested_object_used,
      normalizationUsed: item.score.diagnostics.normalization_used,
      keyNormalizationUsed: item.score.diagnostics.key_normalization_used,
      valueNormalizationUsed: item.score.diagnostics.value_normalization_used,
      ignoredOuterKey: item.score.diagnostics.ignored_outer_key,
      missingFields: item.score.missing_fields,
      invalidFields: item.score.invalid_fields,
      ignoredExtraFields: item.score.diagnostics.ignored_extra_fields,
      rawModelOutput: item.modelOutput,
    })),
  };
}

function reportLabel(reportId: string, index: number) {
  const match = reportId.match(/(\d{3})$/);
  return `Report ${match?.[1] ?? String(index + 1).padStart(3, "0")}`;
}

function submissionLabel(kind: SubmissionKind) {
  return kind === "final" ? "Final submission" : "Public attempt";
}

function predictionFromScore(
  perField: Array<{
    field: string;
    actual: string | null;
  }>,
) {
  return buildScoredValues(perField);
}

function parseJsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function isDuplicateSubmissionError(error: SupabaseErrorLike) {
  return (
    error.code === "23505" ||
    error.message.toLowerCase().includes("duplicate key") ||
    error.message.toLowerCase().includes("unique")
  );
}

async function getParticipantCodes(
  supabase: ReturnType<typeof createDatabase>,
  participantIds: string[],
) {
  if (participantIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase.execute<Array<{ id: string; participant_code: string }>>({ table: "participants", columns: "id, participant_code", operation: "select", where: [["id", "in", participantIds]] });

  if (error) {
    throw new Error(`Failed to load participant codes: ${error.message}`);
  }

  return new Map(data.map((participant) => [participant.id, participant.participant_code]));
}
