import fs from "node:fs/promises";
import path from "node:path";

import answerKeys from "@/data/mock-answer-keys.json";
import manifest from "@/data/mock-report-manifest.json";
import { createDatabase } from "./supabase/admin";
import {
  canUseLegacySixFieldAnswerKey,
  resolveChallengeMode,
  validateAnswerValues,
} from "./schema-storage";
import type {
  AnswerKeyItem,
  FindingValue,
  ReportManifestItem,
  ReportSplit,
  SampleReport,
} from "./types";

const typedManifest = manifest as ReportManifestItem[];
const typedAnswerKeys = answerKeys as AnswerKeyItem[];

type SupabaseChallengeRow = {
  id: string;
  mode_id: string | null;
  schema_version: number | null;
};

type SupabaseReportRow = {
  id: string;
  external_id: string;
  filename: string | null;
  split: ReportSplit;
  report_text: string;
};

type SupabaseAnswerKeyRow = {
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

export type PublicChallengeReport = Pick<
  SampleReport,
  "id" | "filename" | "split" | "text"
>;

export function getAnswerKeyItems() {
  return typedAnswerKeys;
}

export function getLeaderboardRows(participantId?: string) {
  const rows = [
    { rank: 1, participant: "RAD-014", score: 94, final: true },
    { rank: 2, participant: "RAD-027", score: 91, final: true },
    { rank: 3, participant: "RAD-006", score: 88, final: true },
    { rank: 4, participant: "RAD-033", score: 83, final: true },
  ];

  if (!participantId) {
    return rows;
  }

  return [
    ...rows,
    { rank: rows.length + 1, participant: participantId, score: 0, final: false },
  ];
}

export async function getSampleReports(): Promise<SampleReport[]> {
  try {
    return await getSupabasePublicReports();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (process.env.ALLOW_LOCAL_FALLBACK !== "true") {
      console.error(
        "[challenge-data] Supabase public reports unavailable and local fallback is disabled",
        message,
      );

      return [];
    }

    return getLocalPublicReports();
  }
}

export async function getPublicChallengeReports(): Promise<PublicChallengeReport[]> {
  const reports = await getSampleReports();

  return reports.map(({ id, filename, split, text }) => ({
    id,
    filename,
    split,
    text,
  }));
}

async function getLocalPublicReports(): Promise<SampleReport[]> {
  const publicFiles = typedManifest.filter((item) => item.split === "public");

  return Promise.all(
    publicFiles.map(async (item) => {
      const key = typedAnswerKeys.find((answer) => answer.id === item.id);

      if (!key) {
        throw new Error(`Missing answer key for ${item.id}`);
      }

      const reportPath = path.join(
        process.cwd(),
        "seed-data",
        "mock-reports",
        item.filename,
      );
      const text = await fs.readFile(reportPath, "utf8");

      return {
        ...key,
        text,
      };
    }),
  );
}

async function getSupabasePublicReports(): Promise<SampleReport[]> {
  const supabase = createDatabase();
  const { data: challenge, error: challengeError } = await supabase.execute<SupabaseChallengeRow>({ table: "challenges", columns: "id, mode_id, schema_version", limit: 1, single: "single", operation: "select", where: [["is_active", "eq", true]], order: [["created_at", { ascending: false }]] });

  if (challengeError || !challenge) {
    throw new Error(challengeError?.message || "No active challenge found.");
  }

  const mode = resolveChallengeMode(challenge.mode_id, challenge.schema_version);

  const { data: reports, error: reportsError } = await supabase.execute<SupabaseReportRow[]>({ table: "reports", columns: "id, external_id, filename, split, report_text", operation: "select", where: [["challenge_id", "eq", challenge.id],["split", "eq", "public"]], order: [["filename", { ascending: true }]] });

  if (reportsError) {
    throw new Error(reportsError.message);
  }

  if (reports.length === 0) {
    throw new Error("No public reports are seeded.");
  }

  const reportIds = reports.map((report) => report.id);
  const { data: answerKeyRows, error: answerKeyError } = await supabase.execute<SupabaseAnswerKeyRow[]>({ table: "answer_keys", columns: "report_id, mode_id, schema_version, answer_values, acl_tear, mcl_injury, meniscus_tear, fracture, osteoarthritis, effusion", operation: "select", where: [["report_id", "in", reportIds],["mode_id", "eq", mode.id],["schema_version", "eq", mode.version]] });

  if (answerKeyError) {
    throw new Error(answerKeyError.message);
  }

  const answerKeyByReportId = new Map(
    answerKeyRows.map((answerKey) => [answerKey.report_id, answerKey]),
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

    return {
      id: report.external_id,
      filename: report.filename || report.external_id,
      split: report.split,
      text: report.report_text,
      answer_key: validateAnswerValues(
        answerKey.answer_values ??
          (canUseLegacySixFieldAnswerKey(mode) ? legacyAnswerValues : null),
        mode,
      ) as SampleReport["answer_key"],
    };
  });
}
