import { loadEnvConfig } from "@next/env";
import { createDatabase } from "../app/lib/db/database";
import { getPool } from "../app/lib/db/pool";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { defaultChallengeMode } from "../app/lib/challenge-modes";
import { buildVersionedAnswerKeyStoragePayload } from "../app/lib/schema-storage";
import type { FindingKey, FindingValue } from "../app/lib/types";

loadEnvConfig(process.cwd());

const challengeSlug = "knee-mri-extraction";
const challengeTitle = defaultChallengeMode.title;
const defaultModel = "google/gemini-2.0-flash-001";
const eventPhases = [
  "not_started",
  "practice_open",
  "final_open",
  "ended",
] as const;
const leaderboardVisibilityModes = [
  "hidden",
  "practice",
  "final",
  "ended",
  "always",
] as const;
const findingFields = defaultChallengeMode.fields.map(
  (field) => field.key,
) as FindingKey[];
const allowedFindingValues = defaultChallengeMode.fields[0]
  .allowedValues as readonly FindingValue[];

type FindingField = FindingKey;
type ReportSplit = "sample" | "public" | "private";
type EventPhase = (typeof eventPhases)[number];
type LeaderboardVisibility = (typeof leaderboardVisibilityModes)[number];

type ManifestReport = {
  id: string;
  filename: string;
  split: ReportSplit;
};

type AnswerKeyReport = ManifestReport & {
  answer_key: Record<FindingField, FindingValue>;
  notes?: string;
};

type ChallengeRow = {
  id: string;
};

type ReportRow = {
  id: string;
  external_id: string;
};

type ParticipantRow = {
  participant_code: string;
  access_code: string | null;
  email: string | null;
  is_active: boolean | null;
};

function getSeedEventPhase(): EventPhase {
  const value = process.env.EVENT_PHASE || "not_started";

  if ((eventPhases as readonly string[]).includes(value)) {
    return value as EventPhase;
  }

  throw new Error(`EVENT_PHASE must be one of: ${eventPhases.join(", ")}.`);
}

function getSeedLeaderboardVisibility(): LeaderboardVisibility {
  const value = process.env.LEADERBOARD_VISIBILITY || "practice";

  if ((leaderboardVisibilityModes as readonly string[]).includes(value)) {
    return value as LeaderboardVisibility;
  }

  throw new Error(
    `LEADERBOARD_VISIBILITY must be one of: ${leaderboardVisibilityModes.join(", ")}.`,
  );
}

function createParticipantAccessCode() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(8);
  const code = Array.from(
    bytes,
    (byte) => alphabet[byte % alphabet.length],
  ).join("");

  return `GPO-${code.slice(0, 4)}-${code.slice(4, 8)}`;
}

function isCurrentAccessCodeFormat(accessCode: string | null) {
  return Boolean(
    accessCode && /^GPO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(accessCode),
  );
}

async function readJsonFile<T>(relativePath: string) {
  const filePath = path.join(process.cwd(), relativePath);
  const contents = await readFile(filePath, "utf8");

  return JSON.parse(contents) as T;
}

function assertFindingValues(report: AnswerKeyReport) {
  for (const field of findingFields) {
    const value = report.answer_key[field];

    if (!allowedFindingValues.includes(value)) {
      throw new Error(
        `${report.id} has invalid ${field}: ${String(value)}. Expected present, absent, uncertain, or not_reported.`,
      );
    }
  }
}

async function readReportText(filename: string) {
  const reportPath = path.join(
    process.cwd(),
    "seed-data",
    "mock-reports",
    filename,
  );
  const reportText = await readFile(reportPath, "utf8");

  if (!reportText.trim()) {
    throw new Error(`${filename} is empty.`);
  }

  return reportText;
}

async function main() {
  if (process.env.SEED_DEMO !== "true")
    throw new Error("Demo seed requires SEED_DEMO=true");
  await createDatabase().transaction(async (supabase) => {
    await supabase.sql("SELECT pg_advisory_xact_lock(784216)");
    const existing = await supabase.sql<{ count: number }>(
      "SELECT count(*)::int AS count FROM challenges",
    );
    if (existing[0].count !== 0)
      throw new Error("Demo seed refuses a nonempty database");

    const [manifest, answerKeys] = await Promise.all([
      readJsonFile<ManifestReport[]>("data/mock-report-manifest.json"),
      readJsonFile<AnswerKeyReport[]>("data/mock-answer-keys.json"),
    ]);

    const answerKeyById = new Map(
      answerKeys.map((report) => [report.id, report]),
    );

    for (const report of manifest) {
      const answerKey = answerKeyById.get(report.id);

      if (!answerKey) {
        throw new Error(`No answer key found for ${report.id}.`);
      }

      if (
        answerKey.filename !== report.filename ||
        answerKey.split !== report.split
      ) {
        throw new Error(
          `Manifest and answer key metadata disagree for ${report.id}.`,
        );
      }

      assertFindingValues(answerKey);
    }

    const outputSchema = {
      type: "object",
      required: findingFields,
      additionalProperties: false,
      properties: Object.fromEntries(
        findingFields.map((field) => [
          field,
          {
            type: "string",
            enum: allowedFindingValues,
          },
        ]),
      ),
    };

    const { data: challenge, error: challengeError } =
      await supabase.execute<ChallengeRow>({
        table: "challenges",
        values: {
          slug: challengeSlug,
          title: challengeTitle,
          description:
            "Synthetic knee MRI report extraction challenge seeded from local mock data.",
          instructions:
            "Extract six structured findings from each synthetic knee MRI report.",
          mode_id: defaultChallengeMode.id,
          schema_version: defaultChallengeMode.version,
          output_schema: outputSchema,
          locked_model: process.env.OPENROUTER_MODEL || defaultModel,
          // Leave evaluation_model unset so an organizer's challenge override
          // survives later seed runs and fresh challenges use the env fallback.
          public_submission_limit: 5,
          final_submission_limit: 1,
          event_phase: getSeedEventPhase(),
          leaderboard_visibility: getSeedLeaderboardVisibility(),
          event_announcement: "",
          event_timer_ends_at: null,
          event_timer_label: "",
          is_active: true,
        },
        conflict: { onConflict: "slug" }.onConflict,
        columns: "id",
        single: "single",
        operation: "upsert",
      });

    if (challengeError) {
      throw new Error(`Failed to upsert challenge: ${challengeError.message}`);
    }

    const reportRows = await Promise.all(
      manifest.map(async (report) => ({
        challenge_id: challenge.id,
        external_id: report.id,
        filename: report.filename,
        split: report.split,
        report_text: await readReportText(report.filename),
        synthetic: true,
      })),
    );

    const { data: reports, error: reportsError } = await supabase.execute<
      ReportRow[]
    >({
      table: "reports",
      values: reportRows,
      conflict: { onConflict: "challenge_id,external_id" }.onConflict,
      columns: "id, external_id",
      operation: "upsert",
    });

    if (reportsError) {
      throw new Error(`Failed to upsert reports: ${reportsError.message}`);
    }

    const reportIdByExternalId = new Map(
      reports.map((report) => [report.external_id, report.id]),
    );
    const answerKeyRows = answerKeys.map((report) => {
      const reportId = reportIdByExternalId.get(report.id);

      if (!reportId) {
        throw new Error(`Could not resolve seeded report ID for ${report.id}.`);
      }

      return {
        report_id: reportId,
        ...buildVersionedAnswerKeyStoragePayload(
          report.answer_key,
          defaultChallengeMode,
        ),
        notes: report.notes || null,
      };
    });

    const { error: answerKeysError } = await supabase.execute<
      Record<string, unknown>[]
    >({
      table: "answer_keys",
      values: answerKeyRows,
      conflict: { onConflict: "report_id,mode_id,schema_version" }.onConflict,
      operation: "upsert",
    });

    if (answerKeysError) {
      throw new Error(
        `Failed to upsert answer keys: ${answerKeysError.message}`,
      );
    }

    const { data: existingParticipants, error: existingParticipantsError } =
      await supabase.execute<ParticipantRow[]>({
        table: "participants",
        columns: "participant_code, access_code, email, is_active",
        operation: "select",
      });

    if (existingParticipantsError) {
      throw new Error(
        `Failed to load existing participant access codes: ${existingParticipantsError.message}`,
      );
    }

    const existingAccessCodeByParticipant = new Map(
      existingParticipants.map((participant) => [
        participant.participant_code,
        participant.access_code,
      ]),
    );
    const existingParticipantByCode = new Map(
      existingParticipants.map((participant) => [
        participant.participant_code,
        participant,
      ]),
    );
    const allExistingAccessCodes = new Set(
      existingParticipants
        .map((participant) => participant.access_code)
        .filter((accessCode): accessCode is string => Boolean(accessCode)),
    );
    const usedAccessCodes = new Set<string>();
    const participantRows = Array.from({ length: 50 }, (_, index) => {
      const participantNumber = String(index + 1).padStart(3, "0");
      const participantCode = `P${participantNumber}`;
      const existingAccessCode =
        existingAccessCodeByParticipant.get(participantCode) || null;
      const existingParticipant =
        existingParticipantByCode.get(participantCode);
      let accessCode: string =
        isCurrentAccessCodeFormat(existingAccessCode) && existingAccessCode
          ? existingAccessCode
          : createParticipantAccessCode();

      while (
        accessCode !== existingAccessCode &&
        (usedAccessCodes.has(accessCode) ||
          allExistingAccessCodes.has(accessCode))
      ) {
        accessCode = createParticipantAccessCode();
      }

      usedAccessCodes.add(accessCode);

      return {
        participant_code: participantCode,
        access_code: accessCode,
        display_name: `Participant ${participantNumber}`,
        email: existingParticipant?.email || null,
        is_active: existingParticipant?.is_active ?? true,
        role: "participant",
      };
    });

    const { error: participantsError } = await supabase.execute<
      Record<string, unknown>[]
    >({
      table: "participants",
      values: participantRows,
      conflict: { onConflict: "participant_code" }.onConflict,
      operation: "upsert",
    });

    if (participantsError) {
      throw new Error(
        `Failed to upsert mock participants: ${participantsError.message}`,
      );
    }

    const splitCounts = manifest.reduce<Record<ReportSplit, number>>(
      (counts, report) => {
        counts[report.split] += 1;
        return counts;
      },
      { sample: 0, public: 0, private: 0 },
    );

    console.log(`Seeded challenge: ${challengeTitle} (${challengeSlug})`);
    console.log(
      `Seeded ${manifest.length} reports: ${splitCounts.public} public test, ${splitCounts.private} hidden final, ${splitCounts.sample} legacy sample.`,
    );
    console.log(`Seeded ${answerKeyRows.length} answer keys.`);
    console.log(
      `Seeded ${participantRows.length} mock participants with access codes.`,
    );
    console.log(
      "Export access codes with: select participant_code, display_name, access_code from participants order by participant_code;",
    );
  });
  await getPool().end();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Demo seed failed: ${message}`);
  process.exit(1);
});
