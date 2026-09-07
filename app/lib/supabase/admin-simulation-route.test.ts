import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("admin simulation dry-run route", () => {
  it("does not request a challenge-level schema snapshot", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app", "lib", "supabase", "submission-workflow.ts"),
      "utf8",
    );
    const helperStart = source.indexOf("export async function getActiveChallenge");
    const helperEnd = source.indexOf("async function getParticipantByCode", helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(helper).toContain("schema_version");
    expect(helper).not.toContain("schema_snapshot");
  });

  it("requires admin auth and delegates only to the dry-run service", () => {
    const route = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "dry-run",
        "route.ts",
      ),
      "utf8",
    );

    expect(route).toContain("requireAdminSession");
    expect(route).toContain("runAdminSimulationDryRun");
    expect(route).not.toContain("extractReportWithOpenRouter");
    expect(route).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });

  it("keeps reference reads and writes isolated to simulation storage", () => {
    const service = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "lib",
        "supabase",
        "admin-simulation-references.ts",
      ),
      "utf8",
    );

    expect(service).toContain('table: "simulation_batches"');
    expect(service).toContain('table: "simulation_runs"');
    expect(service).toContain('"admin_set_simulation_reference"');
    expect(service).toContain('"admin_clear_simulation_reference"');
    expect(service).not.toContain('table: "participants"');
    expect(service).not.toContain('table: "prompt_runs"');
    expect(service).not.toContain('table: "prompt_run_items"');
    expect(service).not.toContain('table: "submissions"');
    expect(service).not.toContain('table: "reports"');
    expect(service).not.toContain('table: "answer_keys"');
  });

  it("limits reference storage and replacement to completed deterministic batches", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "supabase", "simulation-reference-batches.sql"),
      "utf8",
    );

    expect(migration).toContain("add column if not exists is_reference");
    expect(migration).toContain("status = 'completed'");
    expect(migration).toContain("evaluator_type = 'deterministic_mock'");
    expect(migration).toContain("simulation_batches_one_reference_per_challenge_idx");
    expect(migration).toContain("admin_set_simulation_reference");
    expect(migration).toContain("admin_clear_simulation_reference");
    expect(migration).not.toContain("public.prompt_runs");
    expect(migration).not.toContain("public.prompt_run_items");
    expect(migration).not.toContain("public.submissions");
    expect(migration).not.toContain("public.participants");
  });

  it("requires confirmation for reference mutations and keeps their UI aggregate-only", () => {
    const dashboard = readFileSync(
      path.join(process.cwd(), "app", "components", "AdminSimulationDashboard.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "components",
        "AdminSimulationReferencePanel.tsx",
      ),
      "utf8",
    );

    expect(dashboard).toContain("Mark as reference");
    expect(dashboard).toContain("window.confirm");
    expect(panel).toContain("CLEAR REFERENCE");
    expect(panel).toContain("Simulation-only regression checking");
    for (const source of [dashboard, panel]) {
      expect(source).not.toContain("answer_values");
      expect(source).not.toContain("report_text");
      expect(source).not.toContain("strategy_snapshot");
      expect(source).not.toContain("raw_model_output");
    }
  });

  it("protects persistent, retrieval, and cleanup routes with admin auth", () => {
    const routePaths = [
      path.join(process.cwd(), "app", "api", "admin", "simulations", "run", "route.ts"),
      path.join(process.cwd(), "app", "api", "admin", "simulations", "route.ts"),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "analytics",
        "route.ts",
      ),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "reference",
        "route.ts",
      ),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "compare",
        "route.ts",
      ),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "export",
        "route.ts",
      ),
      path.join(
        process.cwd(),
        "app",
        "api",
        "admin",
        "simulations",
        "[batchId]",
        "route.ts",
      ),
    ];

    for (const routePath of routePaths) {
      expect(readFileSync(routePath, "utf8")).toContain("requireAdminSession");
    }
  });

  it("persists and cleans up only isolated simulation data", () => {
    const service = readFileSync(
      path.join(process.cwd(), "app", "lib", "supabase", "admin-simulations.ts"),
      "utf8",
    );

    expect(service).toContain('table: "simulation_batches"');
    expect(service).toContain('table: "simulation_runs"');
    expect(service).toContain('table: "simulation_run_items"');
    expect(service).toContain('"admin_delete_simulation_batch"');
    expect(service).toContain('"admin_clear_simulation_data"');
    expect(service).not.toContain('table: "participants"');
    expect(service).not.toContain('table: "prompt_runs"');
    expect(service).not.toContain('table: "prompt_run_items"');
    expect(service).not.toContain('table: "submissions"');
    expect(service).not.toContain('table: "participant_attempt_overrides"');
  });

  it("reads simulation analytics only from isolated simulation tables", () => {
    const service = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "lib",
        "supabase",
        "admin-simulation-analytics.ts",
      ),
      "utf8",
    );

    expect(service).toContain('table: "simulation_batches"');
    expect(service).toContain('table: "simulation_runs"');
    expect(service).not.toContain('table: "simulation_run_items"');
    expect(service).not.toContain('table: "participants"');
    expect(service).not.toContain('table: "prompt_runs"');
    expect(service).not.toContain('table: "prompt_run_items"');
    expect(service).not.toContain('table: "submissions"');
    expect(service).not.toContain('table: "reports"');
    expect(service).not.toContain('table: "answer_keys"');
  });

  it("keeps simulation analytics UI free of source and private result fields", () => {
    const component = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "components",
        "AdminSimulationAnalytics.tsx",
      ),
      "utf8",
    );

    expect(component).not.toContain("answer_values");
    expect(component).not.toContain("report_text");
    expect(component).not.toContain("strategy_snapshot");
    expect(component).not.toContain("raw_model_output");
    expect(component).not.toContain("/api/submissions");
    expect(component).not.toContain("/api/admin/challenge-schema");
  });

  it("exports completed simulation aggregates with active-challenge and optional batch scoping", () => {
    const service = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "lib",
        "supabase",
        "admin-simulation-exports.ts",
      ),
      "utf8",
    );

    expect(service).toContain('table: "simulation_batches"');
    expect(service).toContain('table: "simulation_runs"');
    expect(service).toContain('["challenge_id", "eq", challenge.id]');
    expect(service).toContain("['status','eq','completed']");
    expect(service).toContain("['id','eq',batchId]");
    expect(service).not.toContain('table: "simulation_run_items"');
    expect(service).not.toContain('table: "participants"');
    expect(service).not.toContain('table: "prompt_runs"');
    expect(service).not.toContain('table: "prompt_run_items"');
    expect(service).not.toContain('table: "submissions"');
    expect(service).not.toContain('table: "reports"');
    expect(service).not.toContain('table: "answer_keys"');
  });

  it("does not expose source content through exports or reproducibility UI", () => {
    const exportService = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "lib",
        "supabase",
        "admin-simulation-exports.ts",
      ),
      "utf8",
    );
    const component = readFileSync(
      path.join(
        process.cwd(),
        "app",
        "components",
        "AdminSimulationDashboard.tsx",
      ),
      "utf8",
    );

    for (const source of [exportService, component]) {
      expect(source).not.toContain("answer_values");
      expect(source).not.toContain("report_text");
      expect(source).not.toContain("strategy_snapshot");
      expect(source).not.toContain("raw_model_output");
    }
    expect(component).toContain("schemaSnapshotHash");
    expect(component).not.toContain("schema_snapshot");
  });
});
