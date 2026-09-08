"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { challenge } from "../lib/challenge-constants";
import { fallbackChallengeConfig } from "../lib/challenge-config";
import {
  getPublicChallengeModeMetadata,
  type PublicChallengeModeMetadata,
} from "../lib/challenge-modes";
import { MAX_PROMPT_CHARS, promptTooLongMessage } from "../lib/prompt-limits";
import { formatFieldScore } from "../lib/score-display";
import { normalizeParticipantCode } from "../lib/participant-codes";
import {
  saveParticipantId,
  useSavedParticipantId,
  useSavedParticipantToken,
} from "../lib/participant-session";
import {
  createSubmissionId,
  getLocalLeaderboardRows,
  getParticipantHistory,
  getRemainingPublicSubmissions,
  saveSubmission,
  useSubmissionStore,
} from "../lib/submissions";
import type { PublicChallengeReport } from "../lib/challenge-data";
import {
  eventPhaseMessage,
  type EventPhase,
} from "../lib/event-phase";
import {
  canShowParticipantLeaderboard,
  type LeaderboardVisibility,
} from "../lib/leaderboard-visibility";
import type {
  ScoreSummary,
  StoredSubmission,
  SubmissionKind,
} from "../lib/types";

type LeaderboardRow = {
  rank: number;
  participant: string;
  score: number;
  final: boolean;
  submittedAt?: string;
};

type PromptDebug = {
  promptHash: string;
  promptLength: number;
  promptPreview: string;
};

type SubmissionPromptDebug = PromptDebug & {
  kind: SubmissionKind;
};

type SafeSubmissionFeedback = {
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

type ChallengeWorkspaceProps = {
  initialParticipantId: string;
  reports: PublicChallengeReport[];
};

type ChallengeDataStatus = {
  source: "supabase" | "mock-file-fallback";
  fallbackReason: string | null;
  challenge: {
    id: string;
    title: string;
    eventPhase: EventPhase;
    leaderboardVisibility: LeaderboardVisibility;
    eventAnnouncement: string;
    eventTimerEndsAt: string | null;
    eventTimerLabel: string;
    evaluationModelDisplayName?: string;
    publicSubmissionLimit: number;
    finalSubmissionLimit: number;
  } | null;
  mode: PublicChallengeModeMetadata;
  reportCounts: {
    sample: number;
    public: number;
    private: number;
  };
  participantCount: number;
};

type SubmissionSource = "supabase" | "mock-file-fallback";

type SubmissionStatus = {
  source: SubmissionSource;
  fallbackReason: string | null;
  publicSubmissionLimit: number;
  extraPublicAttempts?: number;
  publicSubmissionsUsed: number;
  remainingPublicSubmissions: number;
  latestPublicScore: number | null;
  finalSubmissionUsed: boolean;
  finalScore: number | null;
};

type LeaderboardResponse = {
  source: SubmissionSource;
  fallbackReason: string | null;
  visible: boolean;
  rows: LeaderboardRow[];
};

type ParticipantValidationResponse = {
  source: "supabase" | "mock-file-fallback";
  valid: boolean;
  participantCode: string;
  participantToken: string | null;
  message: string;
};

const initialClinicalInstructions = "";

type PromptDraftV2 = {
  clinicalInstructions: string;
};

export function ChallengeWorkspace({
  initialParticipantId,
  reports,
}: ChallengeWorkspaceProps) {
  const router = useRouter();
  const [participantId, setParticipantId] = useState(
    normalizeParticipantCode(initialParticipantId),
  );
  const savedParticipantId = useSavedParticipantId();
  const savedParticipantToken = useSavedParticipantToken();
  const submissionStore = useSubmissionStore();
  const [activeReportId, setActiveReportId] = useState(reports[0]?.id ?? "");
  const [clinicalInstructions, setClinicalInstructions] = useState(
    initialClinicalInstructions,
  );
  const [draftReadyKey, setDraftReadyKey] = useState("");
  const [lastSubmissionPromptDebug, setLastSubmissionPromptDebug] =
    useState<SubmissionPromptDebug | null>(null);
  const [lastSubmissionFeedback, setLastSubmissionFeedback] =
    useState<SafeSubmissionFeedback | null>(null);
  const [challengeDataStatus, setChallengeDataStatus] =
    useState<ChallengeDataStatus | null>(null);
  const [challengeDataError, setChallengeDataError] = useState("");
  const [lastStatusUpdated, setLastStatusUpdated] = useState<Date | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [statusRefreshWarning, setStatusRefreshWarning] = useState("");
  const [participantValidation, setParticipantValidation] =
    useState<ParticipantValidationResponse | null>(null);
  const [participantValidationError, setParticipantValidationError] =
    useState("");
  const [submissionStatus, setSubmissionStatus] =
    useState<SubmissionStatus | null>(null);
  const [leaderboardResponse, setLeaderboardResponse] =
    useState<LeaderboardResponse | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<"public" | "final" | null>(
    null,
  );
  const activeParticipantId = normalizeParticipantCode(
    participantId || savedParticipantId,
  );
  const activeParticipantToken = savedParticipantToken;
  const localParticipantHistory = activeParticipantId
    ? getParticipantHistory(submissionStore, activeParticipantId)
    : { publicSubmissions: [], finalSubmission: null };
  const usingSupabaseSubmissions = submissionStatus?.source === "supabase";
  const remainingPublicSubmissions =
    usingSupabaseSubmissions && submissionStatus
      ? submissionStatus.remainingPublicSubmissions
      : getRemainingPublicSubmissions(localParticipantHistory);
  const finalSubmissionUsed =
    usingSupabaseSubmissions && submissionStatus
      ? submissionStatus.finalSubmissionUsed
      : Boolean(localParticipantHistory.finalSubmission);
  const finalScore =
    usingSupabaseSubmissions && submissionStatus
      ? submissionStatus.finalScore
      : localParticipantHistory.finalSubmission?.score ?? null;
  const latestPublicScore =
    usingSupabaseSubmissions && submissionStatus
      ? submissionStatus.latestPublicScore
      : localParticipantHistory.publicSubmissions.at(-1)?.score ?? null;
  const publicSubmissionLimit =
    (usingSupabaseSubmissions && submissionStatus
      ? submissionStatus.publicSubmissionLimit
      : challengeDataStatus?.challenge?.publicSubmissionLimit) ??
    fallbackChallengeConfig.publicSubmissionLimit;
  const publicReportCount = challengeDataStatus?.reportCounts.public ?? reports.length;
  const privateReportCount = challengeDataStatus?.reportCounts.private ?? null;
  const activeMode =
    challengeDataStatus?.mode ?? getPublicChallengeModeMetadata();
  const publicReportDescription =
    publicReportCount > 0
      ? `${publicReportCount} public test report${publicReportCount === 1 ? "" : "s"}`
      : "the public test reports";
  const privateReportDescription =
    privateReportCount !== null && privateReportCount > 0
      ? `${privateReportCount} hidden report${privateReportCount === 1 ? "" : "s"}`
      : "the hidden final reports";
  const challengeId = challengeDataStatus?.challenge?.id ?? "pending-challenge";
  const oldDraftKey = activeParticipantId
    ? `great-prompt-off-draft:${challengeId}:${activeParticipantId}`
    : "";
  const draftKey = activeParticipantId
    ? `great-prompt-off-draft-v2:${challengeId}:${activeParticipantId}`
    : "";
  const loadedDraftKeyRef = useRef("");
  const participantPrompt = useMemo(
    () => buildParticipantPrompt(clinicalInstructions),
    [clinicalInstructions],
  );
  const participantPromptLength = participantPrompt.length;
  const promptOverLimit = participantPromptLength > MAX_PROMPT_CHARS;
  const eventPhase = challengeDataStatus?.challenge?.eventPhase ?? "practice_open";
  const leaderboardVisibility =
    challengeDataStatus?.challenge?.leaderboardVisibility ?? "practice";
  const eventAnnouncement =
    challengeDataStatus?.challenge?.eventAnnouncement.trim() ?? "";
  const eventTimerEndsAt = challengeDataStatus?.challenge?.eventTimerEndsAt ?? null;
  const eventTimerLabel =
    challengeDataStatus?.challenge?.eventTimerLabel.trim() ?? "";
  const participantLeaderboardVisible = canShowParticipantLeaderboard({
    eventPhase,
    visibility: leaderboardVisibility,
  });
  const phaseMessage = eventPhaseMessage(eventPhase);
  const canViewPublicReports = eventPhase !== "not_started";
  const canSubmitPublic = eventPhase === "practice_open";
  const canSubmitFinal = eventPhase === "final_open";

  useEffect(() => {
    if (!activeParticipantId || !activeParticipantToken) {
      return;
    }

    let ignore = false;

    async function validateCurrentParticipant() {
      try {
        const validation = await validateParticipantSession(
          activeParticipantId,
          activeParticipantToken,
        );

        if (!ignore) {
          setParticipantValidation(validation);
          setParticipantValidationError("");

          if (validation.valid && validation.participantToken) {
            saveParticipantId(validation.participantCode);
            setParticipantId(validation.participantCode);
          }
        }
      } catch (error) {
        if (!ignore) {
          setParticipantValidationError(
            error instanceof Error
              ? error.message
              : "Could not validate this participant code.",
          );
        }
      }
    }

    validateCurrentParticipant();

    return () => {
      ignore = true;
    };
  }, [activeParticipantId, activeParticipantToken]);

  useEffect(() => {
    let ignore = false;

    async function loadChallengeDataStatus() {
      try {
        const response = await fetch("/api/challenge-data");

        if (!response.ok) {
          throw new Error(`Status request failed with ${response.status}.`);
        }

        const data = (await response.json()) as ChallengeDataStatus;

        if (!ignore) {
          setChallengeDataStatus(data);
          setChallengeDataError("");
          setStatusRefreshWarning("");
          setLastStatusUpdated(new Date());
        }
      } catch (error) {
        if (!ignore) {
          setChallengeDataError(
            error instanceof Error
              ? error.message
              : "Challenge data status is unavailable.",
          );
          setStatusRefreshWarning(
            "Live status could not update. Showing the last available status.",
          );
        }
      }
    }

    loadChallengeDataStatus();
    const timer = window.setInterval(loadChallengeDataStatus, 7000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!eventTimerEndsAt) {
      return;
    }

    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [eventTimerEndsAt]);

  useEffect(() => {
    if (
      !activeParticipantId ||
      !activeParticipantToken ||
      participantValidation?.valid !== true
    ) {
      return;
    }

    let ignore = false;

    async function loadSubmissionData() {
      try {
        const status = await getSubmissionStatus(
          activeParticipantId,
          activeParticipantToken,
        );

        if (!ignore) {
          setSubmissionStatus(status);
          setStatusRefreshWarning("");
          setLastStatusUpdated(new Date());
        }
      } catch {
        if (!ignore) {
          setStatusRefreshWarning(
            "Live status could not update. Showing the last available status.",
          );
        }
      }
    }

    loadSubmissionData();
    const timer = window.setInterval(loadSubmissionData, 7000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [
    activeParticipantId,
    activeParticipantToken,
    participantValidation?.valid,
  ]);

  useEffect(() => {
    if (
      !activeParticipantId ||
      !activeParticipantToken ||
      participantValidation?.valid !== true ||
      !participantLeaderboardVisible
    ) {
      return;
    }

    let ignore = false;

    async function loadLeaderboardData() {
      try {
        const leaderboard = await getLeaderboard();

        if (!ignore) {
          setLeaderboardResponse(leaderboard);
          setStatusRefreshWarning("");
          setLastStatusUpdated(new Date());
        }
      } catch {
        if (!ignore) {
          setStatusRefreshWarning(
            "Leaderboard could not update. Showing the last available results.",
          );
        }
      }
    }

    loadLeaderboardData();
    const timer = window.setInterval(loadLeaderboardData, 12000);

    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, [
    activeParticipantId,
    activeParticipantToken,
    participantValidation?.valid,
    participantLeaderboardVisible,
  ]);

  useEffect(() => {
    if (!draftKey || loadedDraftKeyRef.current === draftKey) {
      return;
    }

    loadedDraftKeyRef.current = draftKey;
    let timer: number | null = null;

    try {
      const savedV2Draft = window.localStorage.getItem(draftKey);
      const parsedV2Draft = parsePromptDraftV2(savedV2Draft);

      if (parsedV2Draft) {
        timer = window.setTimeout(() => {
          setClinicalInstructions(
            (current) => current || parsedV2Draft.clinicalInstructions,
          );
          setDraftReadyKey(draftKey);
        }, 0);
      } else {
        const savedOldDraft = oldDraftKey
          ? window.localStorage.getItem(oldDraftKey)
          : null;

        if (savedOldDraft) {
          timer = window.setTimeout(() => {
            setClinicalInstructions((current) => current || savedOldDraft);
            setDraftReadyKey(draftKey);
          }, 0);
        } else {
          timer = window.setTimeout(() => {
            setDraftReadyKey(draftKey);
          }, 0);
        }
      }
    } catch {
      // Draft saving is best-effort; challenge work should continue without it.
      timer = window.setTimeout(() => {
        setDraftReadyKey(draftKey);
      }, 0);
    }

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [draftKey, oldDraftKey]);

  useEffect(() => {
    if (!draftKey || draftReadyKey !== draftKey) {
      return;
    }

    try {
      const draft: PromptDraftV2 = {
        clinicalInstructions,
      };
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Ignore storage quota/privacy mode failures.
    }
  }, [clinicalInstructions, draftKey, draftReadyKey]);

  const activeReport = reports.find((report) => report.id === activeReportId) ?? reports[0];
  const currentRows = useMemo(() => {
    if (!participantLeaderboardVisible) {
      return [];
    }

    if (leaderboardResponse?.source === "supabase") {
      return leaderboardResponse.rows;
    }

    return getLocalLeaderboardRows(submissionStore);
  }, [leaderboardResponse, participantLeaderboardVisible, submissionStore]);

  function submitPublic() {
    submitChallengePrompt("public");
  }

  function submitFinal() {
    submitChallengePrompt("final");
  }

  async function submitChallengePrompt(kind: SubmissionKind) {
    if (!activeParticipantId || !activeParticipantToken) {
      setSubmissionMessage("Enter your participant access code before submitting.");
      return;
    }

    if (promptOverLimit) {
      setSubmissionMessage(promptTooLongMessage);
      return;
    }

    if (pendingAction !== null) {
      return;
    }

    if (kind === "public") {
      if (!canSubmitPublic) {
        setSubmissionMessage("Test Attempts are not open right now.");
        return;
      }

      const confirmed = window.confirm(
        `Use 1 test attempt for this prompt? You have ${remainingPublicSubmissions} test attempt${remainingPublicSubmissions === 1 ? "" : "s"} remaining.`,
      );

      if (!confirmed) {
        return;
      }
    }

    if (kind === "final") {
      if (!canSubmitFinal) {
        setSubmissionMessage("Final Submission is not open right now.");
        return;
      }

      const confirmed = window.confirm(
        "Final submission can only be used once and will be locked. Continue?",
      );

      if (!confirmed) {
        return;
      }
    }

    setPendingAction(kind);
    setSubmissionMessage(
      kind === "public"
        ? "Submitting test attempt. This may take a moment while the AI evaluates your prompt."
        : `Submitting final submission. This may take longer because it evaluates ${privateReportDescription}.`,
    );
    setLastSubmissionPromptDebug(null);
    setLastSubmissionFeedback(null);

    try {
      const promptDebug = await createPromptDebug(participantPrompt);
      const score = await postSubmission(
        kind === "public"
          ? "/api/submissions/public"
          : "/api/submissions/final",
        activeParticipantId,
        activeParticipantToken,
        participantPrompt,
      );

      if (score.source === "supabase") {
        setSubmissionStatus(score);
        setLeaderboardResponse(await getLeaderboard());
      } else {
        const submission: StoredSubmission = {
          id: createSubmissionId(kind),
          participantId: activeParticipantId,
          kind,
          createdAt: new Date().toISOString(),
          promptSnapshot: participantPrompt,
          score: score.score,
          correctFields: score.correctFields ?? 0,
          totalFields: score.totalFields ?? 0,
          reportCount: score.reportCount ?? 0,
        };
        const result = saveSubmission(submission);

        if (!result.ok && result.reason === "public_limit_reached") {
          setSubmissionMessage("Test attempt limit reached for this participant.");
          return;
        }

        if (!result.ok && result.reason === "final_already_used") {
          setSubmissionMessage(
            "Final submission has already been used for this participant.",
          );
          return;
        }
      }

      setLastSubmissionPromptDebug({
        ...promptDebug,
        kind,
      });
      setLastSubmissionFeedback(score.feedback ?? null);
      if (kind === "public") {
        const fieldDetail =
          typeof score.correctFields === "number" &&
          typeof score.totalFields === "number"
            ? `, ${score.correctFields} of ${score.totalFields} fields correct`
            : "";
        const reportDetail =
          typeof score.reportCount === "number"
            ? ` across ${score.reportCount} reports`
            : "";

        setSubmissionMessage(
          `Test attempt saved: ${Math.round(score.score)}%${fieldDetail}${reportDetail}.`,
        );
      } else {
        const fieldDetail =
          typeof score.correctFields === "number" &&
          typeof score.totalFields === "number"
            ? `, ${score.correctFields} of ${score.totalFields} fields correct`
            : "";

        setSubmissionMessage(
          `Final submission saved: ${Math.round(score.score)}%${fieldDetail}.`,
        );
      }
    } catch (error) {
      setSubmissionMessage(
        error instanceof Error
          ? error.message
          : `${kind === "public" ? "Test attempt" : "Final"} submission failed. Please try again.`,
      );
    } finally {
      setPendingAction(null);
    }
  }

  function saveAndExit() {
    if (activeParticipantId) {
      saveParticipantId(activeParticipantId);
    }

    router.push("/");
  }

  function exitToHome() {
    router.push("/");
  }

  if (!activeParticipantId || !activeParticipantToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Participant required
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            Enter a participant access code before opening the challenge.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            The home page is the participant check-in point. Return home, enter
            your unique workshop access code, then continue to the workspace.
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (participantValidationError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Participant check unavailable
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            We could not validate this participant session.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Return home and try again with the access code from your workshop
            organizer.
          </p>
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {participantValidationError}
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (!participantValidation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Checking participant
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            Validating your participant code...
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            This keeps the challenge workspace limited to registered workshop
            participants.
          </p>
        </section>
      </main>
    );
  }

  if (!participantValidation.valid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 text-slate-950">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Participant not found
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            This participant code is not registered.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Use the unique access code from your workshop organizer, then return
            to the workspace.
          </p>
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {participantValidation.message}
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Return home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f9f8] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-10 lg:hidden">
        <Link href="/" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
          The Great Prompt-Off
        </Link>
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Laptop recommended
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950">
            This workshop platform is designed for desktop use.
          </h1>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Radiology reports, prompt editing, result comparisons, and
            leaderboard panels need more horizontal space than most mobile
            screens can comfortably provide.
          </p>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Please switch to a laptop or desktop browser for the full challenge
            workspace.
          </p>
          <button
            type="button"
            onClick={exitToHome}
            className="mt-5 h-11 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            Exit to home
          </button>
        </div>
      </section>

      <div className="mx-auto hidden w-full max-w-[1500px] flex-col gap-4 px-4 py-4 lg:flex lg:px-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link href="/" className="text-sm font-semibold text-teal-700 hover:text-teal-800">
              The Great Prompt-Off
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">
              {challenge.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <p className="w-fit rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                Test attempts and final submissions are evaluated by an AI model
              </p>
              {challengeDataStatus?.challenge?.evaluationModelDisplayName ? (
                <p className="w-fit rounded-md border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                  Evaluation model:{" "}
                  {challengeDataStatus.challenge.evaluationModelDisplayName}
                </p>
              ) : null}
            </div>
            <DataSourceStatus
              error={challengeDataError}
              status={challengeDataStatus}
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current participant
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
                {activeParticipantId}
              </p>
            </div>
            <button
              type="button"
              onClick={saveAndExit}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
            >
              Exit challenge
            </button>
          </div>
        </header>

        <PhaseNotice
          eventPhase={eventPhase}
          finalScore={finalScore}
          finalSubmissionUsed={finalSubmissionUsed}
          message={phaseMessage}
        />
        {eventAnnouncement ? (
          <EventAnnouncementBanner announcement={eventAnnouncement} />
        ) : null}
        {eventTimerEndsAt ? (
          <EventTimerCountdown
            endsAt={eventTimerEndsAt}
            label={eventTimerLabel}
            now={currentTime}
          />
        ) : null}
        <LiveUpdateStatus
          lastUpdated={lastStatusUpdated}
          warning={statusRefreshWarning}
        />

        <div className="grid min-h-0 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <TaskSidebar
            fields={activeMode.fields}
            privateReportDescription={privateReportDescription}
            publicReportDescription={publicReportDescription}
            publicSubmissionLimit={publicSubmissionLimit}
          />

          <section className="grid min-h-0 min-w-0 items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <PromptEditor
              fieldCount={activeMode.fields.length}
              clinicalInstructions={clinicalInstructions}
              remainingPublicSubmissions={remainingPublicSubmissions}
              setClinicalInstructions={setClinicalInstructions}
              onSubmitFinal={submitFinal}
              onSubmitPublic={submitPublic}
              finalSubmissionUsed={finalSubmissionUsed}
              participantReady={Boolean(activeParticipantId)}
              pendingAction={pendingAction}
              promptLength={participantPromptLength}
              promptOverLimit={promptOverLimit}
              canSubmitFinal={canSubmitFinal}
              canSubmitPublic={canSubmitPublic}
              privateReportDescription={privateReportDescription}
              publicReportDescription={publicReportDescription}
              publicSubmissionLimit={publicSubmissionLimit}
            />
            {activeReport ? (
              <ReportViewer
                activeReport={activeReport}
                canViewReports={canViewPublicReports}
                phaseMessage={phaseMessage}
                reports={reports}
                setActiveReportId={setActiveReportId}
              />
            ) : null}
          </section>

          <aside className="grid gap-4">
            <SubmissionPanel
              finalSubmissionUsed={finalSubmissionUsed}
              finalScore={finalScore}
              latestPublicScore={latestPublicScore}
              message={submissionMessage}
              promptDebug={lastSubmissionPromptDebug}
              feedback={lastSubmissionFeedback}
              onSubmitFinal={submitFinal}
              onSubmitPublic={submitPublic}
              pendingAction={pendingAction}
              participantReady={Boolean(activeParticipantId)}
              promptLength={participantPromptLength}
              promptOverLimit={promptOverLimit}
              canSubmitFinal={canSubmitFinal}
              canSubmitPublic={canSubmitPublic}
              privateReportDescription={privateReportDescription}
              publicReportDescription={publicReportDescription}
              publicSubmissionLimit={publicSubmissionLimit}
              publicSubmissionsUsed={
                usingSupabaseSubmissions && submissionStatus
                  ? submissionStatus.publicSubmissionsUsed
                  : localParticipantHistory.publicSubmissions.length
              }
              remainingPublicSubmissions={remainingPublicSubmissions}
            />
            <Leaderboard
              participantId={activeParticipantId}
              rows={currentRows}
              visible={participantLeaderboardVisible}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

function PhaseNotice({
  eventPhase,
  finalScore,
  finalSubmissionUsed,
  message,
}: {
  eventPhase: EventPhase;
  finalScore: number | null;
  finalSubmissionUsed: boolean;
  message: string;
}) {
  const tone =
    eventPhase === "practice_open" || eventPhase === "final_open"
      ? "border-teal-200 bg-teal-50 text-teal-950"
      : "border-amber-200 bg-amber-50 text-amber-950";
  const detail =
    eventPhase === "not_started"
      ? "Keep this page open. It will update automatically when the organizer starts the event. Your prompt draft is saved locally in this browser."
      : eventPhase === "practice_open"
        ? "Use Test Attempts to refine your prompt. Final Submission is not open yet."
        : eventPhase === "final_open"
          ? "Test Attempts are closed. Your final can only be submitted once."
          : "Thanks for participating in The Great Prompt-Off.";

  return (
    <section className={`rounded-lg border px-4 py-3 text-sm leading-6 ${tone}`}>
      <p className="font-semibold">Event status</p>
      <p>{message}</p>
      <p>{detail}</p>
      {eventPhase === "ended" ? (
        <div className="mt-2 rounded-md border border-white/60 bg-white/50 p-3">
          {finalSubmissionUsed ? (
            <>
              <p className="font-semibold">Final submitted.</p>
              <p>Your final prompt has been recorded.</p>
              {finalScore !== null ? (
                <p className="mt-1 font-semibold">
                  Final score: {Math.round(finalScore)}%
                </p>
              ) : null}
            </>
          ) : (
            <p>No final submission is recorded for this participant.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function EventAnnouncementBanner({ announcement }: { announcement: string }) {
  return (
    <section className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800">
        Organizer announcement
      </p>
      <p className="mt-1 font-medium">{announcement}</p>
    </section>
  );
}

function EventTimerCountdown({
  endsAt,
  label,
  now,
}: {
  endsAt: string;
  label: string;
  now: number;
}) {
  const endTimestamp = Date.parse(endsAt);

  if (!Number.isFinite(endTimestamp)) {
    return null;
  }

  const remainingSeconds = Math.max(0, Math.ceil((endTimestamp - now) / 1000));
  const displayLabel = label || "Event timer";
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedRemaining = `${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`;

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-950">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-800">
        Event timer
      </p>
      <p className="mt-1 font-medium">
        {remainingSeconds > 0
          ? `${displayLabel} ends in ${formattedRemaining}.`
          : "Timer ended."}
      </p>
    </section>
  );
}

function LiveUpdateStatus({
  lastUpdated,
  warning,
}: {
  lastUpdated: Date | null;
  warning: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
      <span>Updates automatically</span>
      <span aria-hidden="true">|</span>
      <span>
        Last updated:{" "}
        {lastUpdated
          ? lastUpdated.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })
          : "-"}
      </span>
      {warning ? (
        <>
          <span aria-hidden="true">|</span>
          <span className="text-amber-700">{warning}</span>
        </>
      ) : null}
    </div>
  );
}

function TaskSidebar({
  fields,
  privateReportDescription,
  publicReportDescription,
  publicSubmissionLimit,
}: {
  fields: PublicChallengeModeMetadata["fields"];
  privateReportDescription: string;
  publicReportDescription: string;
  publicSubmissionLimit: number;
}) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Active task
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Structured extraction task
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        Write a prompt that converts each report into a JSON
        object. Each field is handled by the platform&apos;s output contract.
      </p>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-800">Output schema</h3>
        <div className="mt-3 grid gap-2">
          {fields.map((field) => (
            <div
              key={field.key}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
            >
              <span className="font-mono text-xs text-slate-700">
                {field.key}
              </span>
              <span className="text-xs text-slate-500">{field.label}<br/>{field.description}<br/>{field.type === 'number' ? `Number in ${field.unit}; tolerance ±${field.tolerance}${field.minimum !== undefined ? `; min ${field.minimum}` : ''}${field.maximum !== undefined ? `; max ${field.maximum}` : ''}` : `Exact labels: ${field.allowedValues.join(', ')}`}<br/>Weight {field.weight ?? 1}; {field.nullable ? 'null allowed for missing/uncertain' : 'non-null value required'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold text-slate-800">Workflow</h3>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          <li>
            Test Attempts: {publicSubmissionLimit} counted attempt
            {publicSubmissionLimit === 1 ? "" : "s"} on {publicReportDescription}.
          </li>
          <li>Use test scores to refine your prompt.</li>
          <li>Final: one locked submission on {privateReportDescription}.</li>
        </ul>
      </div>
    </aside>
  );
}

function DataSourceStatus({
  error,
  status,
}: {
  error: string;
  status: ChallengeDataStatus | null;
}) {
  if (error) {
    return (
      <div className="mt-2 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
        Challenge details are temporarily unavailable. You can continue working
        in the challenge workspace.
      </div>
    );
  }

  if (!status) {
    return (
      <div className="mt-2 w-fit rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
        Loading challenge metadata...
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-3xl rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-semibold text-slate-800">
          {status.challenge?.title || challenge.title}
        </span>
        <span>
          Reports: {status.reportCounts.public} public test /{" "}
          {status.reportCounts.private} hidden final
        </span>
        <span>Participants: {status.participantCount}</span>
      </div>
    </div>
  );
}

function PromptEditor({
  canSubmitFinal,
  canSubmitPublic,
  clinicalInstructions,
  fieldCount,
  finalSubmissionUsed,
  onSubmitFinal,
  onSubmitPublic,
  participantReady,
  pendingAction,
  promptLength,
  promptOverLimit,
  privateReportDescription,
  publicReportDescription,
  publicSubmissionLimit,
  remainingPublicSubmissions,
  setClinicalInstructions,
}: {
  canSubmitFinal: boolean;
  canSubmitPublic: boolean;
  clinicalInstructions: string;
  fieldCount: number;
  finalSubmissionUsed: boolean;
  onSubmitFinal: () => void;
  onSubmitPublic: () => void;
  participantReady: boolean;
  pendingAction: "public" | "final" | null;
  promptLength: number;
  promptOverLimit: boolean;
  privateReportDescription: string;
  publicReportDescription: string;
  publicSubmissionLimit: number;
  remainingPublicSubmissions: number;
  setClinicalInstructions: (value: string) => void;
}) {
  return (
    <section className="h-full rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Prompt editor
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Build your prompt
          </h2>
        </div>
        <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
          Clinical strategy
        </span>
      </div>
      <div className="mt-4 grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
        <p>
          <span className="font-semibold text-slate-800">Test Attempts</span> are
          counted: {publicSubmissionLimit} attempt
          {publicSubmissionLimit === 1 ? "" : "s"} on {publicReportDescription}.
        </p>
        <p>
          Use each test score to refine your prompt. Do not click repeatedly;
          AI evaluation may take a little time.
        </p>
        <p>
          <span className="font-semibold text-slate-800">Final</span> can only be
          used once and runs on {privateReportDescription}.
        </p>
      </div>
      <div className="mt-4 grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-semibold text-slate-800">
            Clinical extraction instructions
          </span>
          <span className="text-sm leading-6 text-slate-500">
            Describe how the model should identify the {fieldCount} findings
            from the reports.
          </span>
          <textarea
            value={clinicalInstructions}
            onChange={(event) => setClinicalInstructions(event.target.value)}
            placeholder="Write your clinical extraction strategy here..."
            spellCheck={false}
            className="h-[250px] w-full resize-none rounded-md border border-slate-300 bg-slate-950 p-4 font-mono text-sm leading-6 text-slate-50 outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          <p className="font-semibold text-slate-800">Output formatting</p>
          <p className="mt-1">
            Output formatting is handled automatically by the platform. Focus
            your prompt on the clinical extraction strategy.
          </p>
        </div>
      </div>
      <div
        className={`mt-3 text-xs ${
          promptOverLimit ? "text-red-700" : "text-slate-500"
        }`}
      >
        Clinical prompt length: {promptLength.toLocaleString()} /{" "}
        {MAX_PROMPT_CHARS.toLocaleString()} characters
        {promptOverLimit ? `. ${promptTooLongMessage}` : ""}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onSubmitPublic}
          disabled={
            !participantReady ||
            !canSubmitPublic ||
            remainingPublicSubmissions === 0 ||
            promptOverLimit ||
            pendingAction !== null
          }
          className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pendingAction === "public" ? "Submitting..." : "Use test attempt"}
        </button>
        <button
          type="button"
          onClick={onSubmitFinal}
          disabled={
            !participantReady ||
            !canSubmitFinal ||
            finalSubmissionUsed ||
            promptOverLimit ||
            pendingAction !== null
          }
          className="h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
          {pendingAction === "final" ? "Submitting final..." : "Submit final"}
        </button>
      </div>
    </section>
  );
}

function ReportViewer({
  activeReport,
  canViewReports,
  phaseMessage,
  reports,
  setActiveReportId,
}: {
  activeReport: PublicChallengeReport;
  canViewReports: boolean;
  phaseMessage: string;
  reports: PublicChallengeReport[];
  setActiveReportId: (id: string) => void;
}) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Public test reports
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        {reports.length} public test report{reports.length === 1 ? "" : "s"}
      </h2>
      {!canViewReports ? (
        <div className="mt-4 flex min-h-[360px] flex-1 items-center rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          {phaseMessage}
        </div>
      ) : (
        <>
      <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(52px,1fr))] gap-2">
        {reports.map((report, index) => (
          <button
            key={report.id}
            type="button"
            onClick={() => setActiveReportId(report.id)}
            className={`h-10 rounded-md border text-sm font-semibold ${
              activeReport.id === report.id
                ? "border-teal-700 bg-teal-50 text-teal-800"
                : "border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
          >
            {String(index + 1).padStart(3, "0")}
          </button>
        ))}
      </div>
      <article className="mt-4 min-h-[360px] flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-6 text-slate-800">
        {activeReport.text}
      </article>
        </>
      )}
    </section>
  );
}

function SubmissionPanel({
  canSubmitFinal,
  canSubmitPublic,
  finalSubmissionUsed,
  finalScore,
  latestPublicScore,
  message,
  onSubmitFinal,
  onSubmitPublic,
  pendingAction,
  participantReady,
  promptLength,
  promptOverLimit,
  privateReportDescription,
  promptDebug,
  feedback,
  publicSubmissionLimit,
  publicReportDescription,
  publicSubmissionsUsed,
  remainingPublicSubmissions,
}: {
  canSubmitFinal: boolean;
  canSubmitPublic: boolean;
  finalSubmissionUsed: boolean;
  finalScore: number | null;
  latestPublicScore: number | null;
  message: string;
  onSubmitFinal: () => void;
  onSubmitPublic: () => void;
  pendingAction: "public" | "final" | null;
  participantReady: boolean;
  promptLength: number;
  promptOverLimit: boolean;
  privateReportDescription: string;
  promptDebug: SubmissionPromptDebug | null;
  feedback: SafeSubmissionFeedback | null;
  publicSubmissionLimit: number;
  publicReportDescription: string;
  publicSubmissionsUsed: number;
  remainingPublicSubmissions: number;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Submissions
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Test attempts and final
      </h2>
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
        Test attempts are counted and use {publicReportDescription}. Final
        submission can only be used once and runs on {privateReportDescription}.
        Please wait for each submission to finish before trying again.
      </div>
      <p
        className={`mt-3 text-xs ${
          promptOverLimit ? "text-red-700" : "text-slate-500"
        }`}
      >
        Clinical prompt length: {promptLength.toLocaleString()} /{" "}
        {MAX_PROMPT_CHARS.toLocaleString()} characters
        {promptOverLimit ? `. ${promptTooLongMessage}` : ""}
      </p>
      {finalSubmissionUsed ? (
        <div className="mt-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm leading-6 text-teal-950">
          <p className="font-semibold">
            Final submitted. Your final prompt has been recorded.
          </p>
          <p>Final submissions can only be made once.</p>
          {finalScore !== null ? (
            <p className="mt-1 font-semibold">
              Final score: {Math.round(finalScore)}%
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3">
        <div className="rounded-md border border-slate-200 px-3 py-3">
          <p className="text-sm font-semibold text-slate-700">
            Test attempts remaining
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-950">
            {remainingPublicSubmissions}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {publicSubmissionsUsed} of {publicSubmissionLimit} attempts used
          </p>
          {latestPublicScore !== null ? (
            <p className="mt-2 text-sm text-slate-600">
              Latest test score: {Math.round(latestPublicScore)}%
            </p>
          ) : null}
          <button
            type="button"
            onClick={onSubmitPublic}
            disabled={
              !participantReady ||
              !canSubmitPublic ||
              remainingPublicSubmissions === 0 ||
              promptOverLimit ||
              pendingAction !== null
            }
            className="mt-3 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
        >
            {pendingAction === "public" ? "Submitting..." : "Use test attempt"}
          </button>
        </div>
        <div className="rounded-md border border-slate-200 px-3 py-3">
          <p className="text-sm font-semibold text-slate-700">
            Final submission
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {finalSubmissionUsed ? "Already used" : "Available"}
          </p>
          {finalScore !== null ? (
            <p className="mt-2 text-sm text-slate-600">
              Final score: {Math.round(finalScore)}%
            </p>
          ) : null}
          <button
            type="button"
            onClick={onSubmitFinal}
            disabled={
              !participantReady ||
              !canSubmitFinal ||
              finalSubmissionUsed ||
              promptOverLimit ||
              pendingAction !== null
            }
            className="mt-3 h-10 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {pendingAction === "final" ? "Submitting final..." : "Submit final"}
          </button>
        </div>
      </div>
      {message ? (
        <p className="mt-4 rounded-md bg-teal-50 p-3 text-sm leading-6 text-teal-900">
          {message}
        </p>
      ) : null}
      {feedback ? <SafeFeedbackPanel feedback={feedback} /> : null}
      {promptDebug ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p className="font-semibold text-slate-800">
            Last {promptDebug.kind === "public" ? "test attempt" : "final"} prompt
          </p>
          <p className="mt-1 break-words">{promptDebug.promptPreview}</p>
          <p className="mt-1 font-mono">
            {promptDebug.promptLength} chars
          </p>
        </div>
      ) : null}
    </section>
  );
}

function SafeFeedbackPanel({ feedback }: { feedback: SafeSubmissionFeedback }) {
  const isPublic = feedback.kind === "public";

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
      <p className="font-semibold text-slate-800">
        {isPublic ? "Last test attempt feedback" : "Final feedback"}
      </p>
      <div className="mt-2 grid gap-2">
        <div className="grid grid-cols-2 gap-2">
          <span>Score</span>
          <span className="text-right font-semibold text-slate-800">
            {Math.round(feedback.score)}%
          </span>
          <span>Fields correct</span>
          <span className="text-right font-semibold text-slate-800">
            {feedback.correctFields} / {feedback.totalFields}
          </span>
          {typeof feedback.validJsonCount === "number" ? (
            <>
              <span>Valid JSON reports</span>
              <span className="text-right font-semibold text-slate-800">
                {feedback.validJsonCount} / {feedback.reportCount}
              </span>
            </>
          ) : null}
          {typeof feedback.missingFieldsCount === "number" ? (
            <>
              <span>Missing fields</span>
              <span className="text-right font-semibold text-slate-800">
                {feedback.missingFieldsCount}
              </span>
            </>
          ) : null}
          {typeof feedback.invalidValuesCount === "number" ? (
            <>
              <span>Invalid values</span>
              <span className="text-right font-semibold text-slate-800">
                {feedback.invalidValuesCount}
              </span>
            </>
          ) : null}
        </div>
        {isPublic && feedback.reportScores?.length ? (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <p className="font-semibold text-slate-800">Per-report score</p>
            <div className="mt-1 grid gap-1">
              {feedback.reportScores.map((report) => (
                <div
                  key={report.reportLabel}
                  className="flex items-center justify-between"
                >
                  <span>{report.reportLabel}</span>
                  <span className="font-semibold text-slate-800">
                    {formatFieldScore(
                      report.correctFields,
                      report.totalFields,
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {isPublic && feedback.reportDetails?.length ? (
          <div className="mt-2 border-t border-slate-200 pt-2">
            <p className="font-semibold text-slate-800">AI response details</p>
            <div className="mt-2 grid gap-2">
              {feedback.reportDetails.map((report) => (
                <details
                  key={report.reportLabel}
                  className="rounded-md border border-slate-200 bg-white p-2"
                >
                  <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                    {report.reportLabel} ({report.correctFields}/
                    {report.totalFields}) - {report.filename}
                  </summary>
                  <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-600">
                    <div className="grid grid-cols-2 gap-2">
                      <span>Strict JSON on first pass?</span>
                      <span className="text-right font-semibold text-slate-800">
                        {report.strictJsonValid
                          ? "Yes"
                          : report.recoveredJsonUsed ||
                              report.nestedObjectUsed ||
                              report.normalizationUsed
                            ? "No - cleaned up"
                            : "No"}
                      </span>
                      <span>Accepted after formatting cleanup?</span>
                      <span className="text-right font-semibold text-slate-800">
                        {report.recoveredJsonUsed ||
                        report.nestedObjectUsed ||
                        report.normalizationUsed
                          ? "Yes"
                          : "No"}
                      </span>
                    </div>
                    {report.recoveredJsonUsed ||
                    report.nestedObjectUsed ||
                    report.normalizationUsed ? (
                      <p className="rounded-md bg-teal-50 p-2 text-teal-900">
                        Accepted after formatting cleanup.
                      </p>
                    ) : null}
                    {report.missingFields.length ||
                    report.invalidFields.length ||
                    report.ignoredExtraFields.length ? (
                      <p className="rounded-md bg-amber-50 p-2 text-amber-900">
                        This output may not score because required fields were
                        missing or answer choices were not in the accepted
                        format.
                      </p>
                    ) : null}
                    <DiagnosticList
                      label="Missing fields"
                      values={report.missingFields}
                    />
                    <DiagnosticList
                      label="Invalid answer choices"
                      values={report.invalidFields.map(
                        (field) => `${field.field}: ${formatDiagnosticValue(field.value)}`,
                      )}
                    />
                    <DiagnosticList
                      label="Cleanup details"
                      values={[
                        report.recoveredJsonUsed
                          ? "Found the JSON object inside extra text"
                          : "",
                        report.nestedObjectUsed && report.ignoredOuterKey
                          ? `Used the single report object inside ${report.ignoredOuterKey}`
                          : "",
                        report.keyNormalizationUsed
                          ? "Matched human-readable field names to the required fields"
                          : "",
                        report.valueNormalizationUsed
                          ? "Matched short answer phrases to accepted choices"
                          : "",
                      ].filter(Boolean)}
                    />
                    <DiagnosticList
                      label="Extra fields returned"
                      values={report.ignoredExtraFields}
                    />
                    <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
                      <summary className="cursor-pointer font-semibold text-slate-800">
                        View raw AI response
                      </summary>
                      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-slate-950 p-3 font-mono text-xs leading-5 text-slate-50">
                        {report.rawModelOutput || "(empty response)"}
                      </pre>
                    </details>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DiagnosticList({
  label,
  values,
}: {
  label: string;
  values: string[];
}) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2">
      <span className="font-semibold text-slate-700">{label}</span>
      <span className="break-words">{values.length ? values.join(", ") : "None"}</span>
    </div>
  );
}

function formatDiagnosticValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function Leaderboard({
  participantId,
  rows,
  visible,
}: {
  participantId: string;
  rows: LeaderboardRow[];
  visible: boolean;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
        Leaderboard
      </p>
      <h2 className="mt-2 text-xl font-semibold text-slate-950">
        Final leaderboard
      </h2>
      {!visible ? (
        <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          Leaderboard is hidden by the organizer.
        </p>
      ) : (
      <div className="mt-4 overflow-hidden rounded-md border border-slate-200">
        {rows.length === 0 ? (
          <p className="bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            Final submissions will appear here after participants submit.
          </p>
        ) : rows.map((row) => (
          <div
            key={row.participant}
            className={`grid grid-cols-[46px_minmax(0,1fr)_60px] items-center border-b border-slate-100 px-3 py-3 text-sm last:border-b-0 ${
              row.participant === participantId ? "bg-teal-50" : "bg-white"
            }`}
          >
            <span className="font-semibold text-slate-500">#{row.rank}</span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">
                {row.participant}
              </p>
              <p className="text-xs text-slate-500">
                {row.final ? "Final submitted" : "Test attempt"}
              </p>
            </div>
            <span className="text-right font-semibold text-slate-950">
              {row.score}%
            </span>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

function buildParticipantPrompt(
  clinicalInstructions: string,
) {
  return clinicalInstructions.trim();
}

function parsePromptDraftV2(value: string | null): PromptDraftV2 | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PromptDraftV2>;

    if (typeof parsed.clinicalInstructions !== "string") {
      return null;
    }

    return {
      clinicalInstructions: parsed.clinicalInstructions,
    };
  } catch {
    return null;
  }
}

function previewPrompt(prompt: string) {
  return prompt.length > 80 ? `${prompt.slice(0, 80)}...` : prompt;
}

async function createPromptDebug(prompt: string): Promise<PromptDebug> {
  return {
    promptHash: await hashPrompt(prompt),
    promptLength: prompt.length,
    promptPreview: previewPrompt(prompt),
  };
}

async function hashPrompt(prompt: string) {
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(prompt);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 12);
  }

  let hash = 0;

  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 31 + prompt.charCodeAt(index)) >>> 0;
  }

  return hash.toString(16).padStart(8, "0").slice(0, 12);
}

async function validateParticipantSession(
  participantCode: string,
  participantToken: string,
) {
  const response = await fetch(
    "/api/participants/validate", {
      method: "POST", cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantCode, participantToken }),
    },
  );

  if (!response.ok) {
    throw new Error(`Participant validation failed with ${response.status}.`);
  }

  return (await response.json()) as ParticipantValidationResponse;
}

async function getSubmissionStatus(
  participantCode: string,
  participantToken: string,
) {
  const response = await fetch(
    `/api/submissions/status?participantCode=${encodeURIComponent(
      participantCode,
    )}`, { cache: "no-store", headers: { Authorization: `Bearer ${participantToken}` } },
  );

  if (!response.ok) {
    return {
      source: "mock-file-fallback",
      fallbackReason: `Status request failed with ${response.status}.`,
      publicSubmissionLimit: fallbackChallengeConfig.publicSubmissionLimit,
      publicSubmissionsUsed: 0,
      remainingPublicSubmissions: fallbackChallengeConfig.publicSubmissionLimit,
      latestPublicScore: null,
      finalSubmissionUsed: false,
      finalScore: null,
    } satisfies SubmissionStatus;
  }

  return (await response.json()) as SubmissionStatus;
}

async function getLeaderboard() {
  const response = await fetch("/api/leaderboard");

  if (!response.ok) {
    return {
      source: "mock-file-fallback",
      fallbackReason: `Leaderboard request failed with ${response.status}.`,
      visible: false,
      rows: [],
    } satisfies LeaderboardResponse;
  }

  return (await response.json()) as LeaderboardResponse;
}

async function postSubmission(
  url: string,
  participantCode: string,
  participantToken: string,
  prompt: string,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ participantCode, participantToken, prompt }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(
      errorBody?.error || `Submission failed with status ${response.status}`,
    );
  }

  return (await response.json()) as SubmitScoreResponse;
}

type SubmitScoreResponse = SubmissionStatus & {
  kind: SubmissionKind;
  evaluationMode: "mock" | "real_llm";
  model: string | null;
  score: number;
  correctFields?: number;
  totalFields?: number;
  reportCount?: number;
  summary?: ScoreSummary;
  feedback?: SafeSubmissionFeedback;
};
