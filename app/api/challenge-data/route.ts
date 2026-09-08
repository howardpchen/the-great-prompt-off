import manifest from "@/data/mock-report-manifest.json";
import answerKeys from "@/data/mock-answer-keys.json";
import { createDatabase } from "@/app/lib/supabase/admin";
import { fallbackChallengeConfig } from "@/app/lib/challenge-config";
import { challenge as mockChallenge } from "@/app/lib/challenge-constants";
import { getPublicChallengeModeMetadata } from "@/app/lib/challenge-modes";
import { resolveChallengeMode } from "@/app/lib/schema-storage";
import { getFriendlyModelName } from "@/app/lib/model-display";
import {
  getOpenRouterModel,
  resolveOpenRouterModel,
} from "@/app/lib/openrouter";
import type { EventPhase } from "@/app/lib/event-phase";
import type { LeaderboardVisibility } from "@/app/lib/leaderboard-visibility";
import type { ReportManifestItem } from "@/app/lib/types";

type ReportSplit = "sample" | "public" | "private";

type ChallengeRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  instructions: string | null;
  locked_model: string;
  evaluation_model: string | null;
  public_submission_limit: number;
  final_submission_limit: number;
  event_phase: EventPhase;
  leaderboard_visibility: LeaderboardVisibility;
  event_announcement: string;
  event_timer_ends_at: string | null;
  event_timer_label: string;
  mode_id: string | null;
  schema_version: number | null;
  contest_schema?: unknown;
};

type ReportMetadataRow = {
  id: string;
  external_id: string;
  filename: string | null;
  split: ReportSplit;
};

const typedManifest = manifest as ReportManifestItem[];
const typedAnswerKeys = answerKeys as unknown[];

function emptySplitCounts() {
  return {
    sample: 0,
    public: 0,
    private: 0,
  };
}

function getFallbackChallengeData(reason: string) {
  const reportCounts = typedManifest.reduce<Record<ReportSplit, number>>(
    (counts, report) => {
      counts[report.split] += 1;
      return counts;
    },
    emptySplitCounts(),
  );

  return {
    source: "mock-file-fallback",
    fallbackReason: reason,
    challenge: {
      id: "local-mock-challenge",
      slug: "knee-mri-extraction",
      title: mockChallenge.title,
      description: mockChallenge.subtitle,
      instructions: null,
      evaluationModelDisplayName: getFriendlyModelName(getOpenRouterModel()),
      publicSubmissionLimit: fallbackChallengeConfig.publicSubmissionLimit,
      finalSubmissionLimit: fallbackChallengeConfig.finalSubmissionLimit,
      eventPhase: "practice_open" satisfies EventPhase,
      leaderboardVisibility: "practice" satisfies LeaderboardVisibility,
      eventAnnouncement: "",
      eventTimerEndsAt: null,
      eventTimerLabel: "",
    },
    mode: getPublicChallengeModeMetadata(),
    reportCounts,
    sampleReports: typedManifest
      .filter((report) => report.split === "public")
      .map((report) => ({
        id: report.id,
        filename: report.filename,
        split: report.split,
      })),
    participantCount: 0,
    answerKeyCount: typedAnswerKeys.length,
  };
}

async function getExactCount(
  query: PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>,
  label: string,
) {
  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to load ${label}: ${error.message}`);
  }

  return count ?? 0;
}

export async function GET() {
  try {
    const supabase = createDatabase();

    const { data: challenge, error: challengeError } = await supabase.execute<ChallengeRow>({ table: "challenges", columns: "id, slug, title, description, instructions, locked_model, evaluation_model, mode_id, schema_version, contest_schema, public_submission_limit, final_submission_limit, event_phase, leaderboard_visibility, event_announcement, event_timer_ends_at, event_timer_label", limit: 1, single: "single", operation: "select", where: [["is_active", "eq", true]], order: [["created_at", { ascending: false }]] });

    if (challengeError) {
      return Response.json(
        getFallbackChallengeData(
          `Database active challenge unavailable: ${challengeError.message}`,
        ),
      );
    }

    if (!challenge) {
      return Response.json(
        getFallbackChallengeData(
          "Database is reachable, but no active challenge is seeded.",
        ),
      );
    }

    const { data: reports, error: reportsError } = await supabase.execute<ReportMetadataRow[]>({ table: "reports", columns: "id, external_id, filename, split", operation: "select", where: [["challenge_id", "eq", challenge.id]], order: [["external_id", { ascending: true }]] });

    if (reportsError) {
      throw new Error(`Failed to load reports: ${reportsError.message}`);
    }

    if (reports.length === 0) {
      return Response.json(
        getFallbackChallengeData(
          "Database active challenge exists, but no reports are seeded.",
        ),
      );
    }

    const reportIds = reports.map((report) => report.id);
    const activeMode = resolveChallengeMode(challenge.mode_id, challenge.schema_version, challenge.contest_schema);
    const [participantCount, answerKeyCount] = await Promise.all([
      getExactCount(
        supabase.execute({table:'participants',count:true}),
        "participant count",
      ),
      getExactCount(
        supabase.execute({table:'answer_keys',count:true,where:[['report_id','in',reportIds],['mode_id','eq',activeMode.id],['schema_version','eq',activeMode.version]]}),
        "answer key count",
      ),
    ]);
    const reportCounts = reports.reduce<Record<ReportSplit, number>>(
      (counts, report) => {
        counts[report.split] += 1;
        return counts;
      },
      emptySplitCounts(),
    );

    return Response.json({
      source: "supabase",
      fallbackReason: null,
      challenge: {
        id: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        description: challenge.description,
        instructions: challenge.instructions,
        evaluationModelDisplayName: getFriendlyModelName(
          resolveOpenRouterModel(challenge.evaluation_model),
        ),
        publicSubmissionLimit: challenge.public_submission_limit,
        finalSubmissionLimit: challenge.final_submission_limit,
        eventPhase: challenge.event_phase,
        leaderboardVisibility: challenge.leaderboard_visibility,
        eventAnnouncement: challenge.event_announcement,
        eventTimerEndsAt: challenge.event_timer_ends_at,
        eventTimerLabel: challenge.event_timer_label,
      },
      mode: getPublicChallengeModeMetadata(activeMode),
      reportCounts,
      sampleReports: reports
        .filter((report) => report.split === "public")
        .map((report) => ({
          id: report.external_id,
          filename: report.filename,
          split: report.split,
        })),
      participantCount,
      answerKeyCount,
    });
  } catch {
    const message = "Challenge data is temporarily unavailable";

    return Response.json(getFallbackChallengeData(message));
  }
}
