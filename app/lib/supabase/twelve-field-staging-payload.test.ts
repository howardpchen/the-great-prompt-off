import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import payload from "../../../staging-data/knee-mri-12/knee-mri-12-answer-keys.demo.json";
import { isChallengeModeActivationAllowed } from "../challenge-modes";
import {
  getChallengeModeForValidation,
  parseAnswerKeyImportMetadata,
  prepareAnswerKeyImportPayload,
} from "./admin-challenge-schema";

describe("knee MRI twelve-field staging payload", () => {
  it("covers existing seed reports with valid demo-only answer values", () => {
    const mode = getChallengeModeForValidation(payload.modeId, payload.schemaVersion);
    const reports = payload.items.map((item, index) => ({
      id: `staging-report-${index + 1}`,
      split: index < 5 ? "public" as const : "private" as const,
      filename: item.report_id_or_filename,
    }));
    const metadata = parseAnswerKeyImportMetadata(
      payload,
      "generated-staging-batch",
      "2026-08-20T12:00:00Z",
    );
    const preparation = prepareAnswerKeyImportPayload(payload, reports, mode, metadata);

    expect(payload.stagingNotice).toContain("not clinically adjudicated truth");
    expect(payload.write).toBe(false);
    expect(payload.overwrite).toBe(false);
    expect(metadata).toMatchObject({
      provenance: "staging_demo",
      import_batch_id: "knee-mri-12-staging-demo-v1",
      adjudicated_by: null,
      adjudicated_at: null,
    });
    expect(metadata.notes).toContain("not clinically adjudicated");
    expect(new Set(payload.items.map((item) => item.report_id_or_filename)).size).toBe(
      payload.items.length,
    );
    expect(payload.items).toHaveLength(50);
    expect(preparation.validation).toMatchObject({
      ok: true,
      itemCount: 50,
      validItemCount: 50,
      reportCounts: { public: 5, private: 45 },
      issues: [],
    });

    for (const item of payload.items) {
      expect(
        existsSync(
          path.join(process.cwd(), "seed-data", "mock-reports", item.report_id_or_filename),
        ),
      ).toBe(true);
    }

    expect(isChallengeModeActivationAllowed(payload.modeId)).toBe(false);
  });

  it("is not referenced by the production Supabase seed script", () => {
    const seedScript = readFileSync(
      path.join(process.cwd(), "scripts", "seed-demo.ts"),
      "utf8",
    );

    expect(seedScript).not.toContain("staging-data");
    expect(seedScript).not.toContain("knee-mri-12-answer-keys.demo.json");
  });
});
