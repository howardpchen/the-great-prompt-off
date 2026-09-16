"use client";
import {adminFetch as fetch} from "../lib/admin-fetch";

import { useState } from "react";
import type { AdminModeReadiness as AdminModeReadinessRow } from "@/app/lib/supabase/admin-challenge-schema";
import type { AdminChallengeSchemaPreflight } from "@/app/lib/supabase/admin-challenge-schema";

const activationLabels: Record<
  AdminModeReadinessRow["activationStatus"],
  string
> = {
  active: "Active",
  allowlisted: "Allowlisted",
  dormant: "Dormant",
};

function statusClasses(status: AdminModeReadinessRow["statusMessage"]) {
  switch (status) {
    case "Active mode":
    case "Ready for activation":
      return "bg-emerald-50 text-emerald-800";
    case "Missing answer keys":
    case "Structurally valid / staging data only":
    case "Structurally valid / clinician review incomplete":
      return "bg-amber-50 text-amber-800";
    case "Validation failed":
      return "bg-rose-50 text-rose-800";
    case "Dormant / not allowlisted":
      return "bg-slate-100 text-slate-700";
  }
}

export function AdminModeReadiness({
  modes,
  configurationLocked,
}: {
  modes: readonly AdminModeReadinessRow[];
  configurationLocked: boolean;
}) {
  const initialMode = modes.find((mode) => mode.activationStatus === "dormant") || modes[0];
  const [selection, setSelection] = useState(initialMode?.modeId || "");
  const [result, setResult] = useState<AdminChallengeSchemaPreflight | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const selectedMode = modes.find((mode) => mode.modeId === selection);

  async function runPreflight() {
    if (!selectedMode) return;
    setIsPending(true);
    setMessage("");
    setResult(null);

    const response = await fetch("/api/admin/challenge-schema/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modeId: selectedMode.modeId,
        schemaVersion: selectedMode.schemaVersion,
      }),
    });
    const body = (await response.json().catch(() => null)) as
      | AdminChallengeSchemaPreflight
      | { error?: string }
      | null;

    if (!response.ok || !body || !("ok" in body)) {
      setMessage(
        body && "error" in body && body.error
          ? body.error
          : "Could not run activation preflight.",
      );
      setIsPending(false);
      return;
    }

    setResult(body);
    setIsPending(false);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Mode readiness
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Can this mode be safely activated yet?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Readiness validates version-matched answer keys for every public and
            private report. Activation also requires an allowlisted mode and an
            unlocked challenge configuration.
          </p>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
            configurationLocked
              ? "bg-amber-50 text-amber-800"
              : "bg-emerald-50 text-emerald-800"
          }`}
        >
          Configuration {configurationLocked ? "locked" : "unlocked"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1220px] border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Mode</th>
              <th className="px-4 py-3">Activation</th>
              <th className="px-4 py-3">Schema</th>
              <th className="px-4 py-3">Reports</th>
              <th className="px-4 py-3">Answer keys</th>
              <th className="px-4 py-3">Provenance</th>
              <th className="px-4 py-3">Validation</th>
              <th className="px-5 py-3">Readiness</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {modes.map((mode) => {
              const totalReports = mode.publicReportCount + mode.privateReportCount;

              return (
                <tr key={`${mode.modeId}:${mode.schemaVersion}`} className="align-top">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-slate-950">{mode.title}</p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {mode.modeId}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {activationLabels[mode.activationStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p>Version {mode.schemaVersion}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {mode.fieldCount} fields
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p>{mode.publicReportCount} public</p>
                    <p className="mt-1">{mode.privateReportCount} private</p>
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    <p className="font-semibold text-slate-900">
                      {mode.answerKeyCoverageCount} / {totalReports}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {mode.missingAnswerKeyCount} missing
                    </p>
                  </td>
                  <td className="px-4 py-4 text-xs leading-5 text-slate-600">
                    <p>{mode.provenanceCounts.clinician_adjudicated} clinician</p>
                    <p>{mode.provenanceCounts.staging_demo} staging/demo</p>
                    <p>{mode.provenanceCounts.legacy} legacy</p>
                    <p>{mode.provenanceCounts.imported} imported</p>
                    <p>{mode.provenanceCounts.unknown} unknown</p>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`font-semibold ${
                        mode.validationPasses ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {mode.validationPasses ? "Pass" : "Fail"}
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      Clinical readiness: {mode.clinicallyReady ? "yes" : "no"}
                    </p>
                    {mode.issues.length > 0 ? (
                      <p className="mt-1 max-w-56 text-xs leading-5 text-slate-500">
                        {mode.issues.map((issue) => `${issue.count}: ${issue.message}`).join(" ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${statusClasses(
                        mode.statusMessage,
                      )}`}
                    >
                      {mode.statusMessage}
                    </span>
                    {mode.provenanceNotice ? (
                      <p className="mt-2 max-w-72 text-xs leading-5 text-amber-800">
                        {mode.provenanceNotice}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-200 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label className="text-sm font-semibold text-slate-800">
              Activation preflight target
              <select
                value={selection}
                onChange={(event) => {
                  setSelection(event.target.value);
                  setResult(null);
                  setMessage("");
                }}
                disabled={isPending}
                className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100"
              >
                {modes.map((mode) => (
                  <option key={`${mode.modeId}:${mode.schemaVersion}`} value={mode.modeId}>
                    {mode.title} ({mode.modeId})
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Preflight only. This checks dormant modes without activating them
              or changing the activation allowlist.
            </p>
          </div>
          <button
            type="button"
            onClick={runPreflight}
            disabled={!selectedMode || isPending}
            className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPending ? "Checking..." : "Run activation preflight"}
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-md bg-rose-50 p-3 text-sm text-rose-800">
            {message}
          </p>
        ) : null}

        {result ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
              <PreflightStatus label="Structural" ready={result.structurallyReady} />
              <PreflightStatus label="Clinical" ready={result.clinicallyReady} />
              <PreflightStatus label="Allowlisted" ready={result.allowlisted} />
              <PreflightStatus label="Unlocked" ready={!result.locked} />
              <PreflightStatus
                label="Activatable if allowlisted"
                ready={result.activatableIfAllowlisted}
              />
            </div>
            <p className="mt-4 text-xs text-slate-600">
              Coverage: {result.coverage.answerKeys} answer keys, {result.coverage.missing} missing.
              {" "}Reports: {result.reportCounts.public} public / {result.reportCounts.private} private.
            </p>
            <p className="mt-2 text-xs text-slate-600">
              Provenance: {result.provenanceCounts.clinician_adjudicated} clinician,
              {" "}{result.provenanceCounts.staging_demo} staging/demo,
              {" "}{result.provenanceCounts.legacy} legacy,
              {" "}{result.provenanceCounts.imported} imported,
              {" "}{result.provenanceCounts.unknown} unknown.
            </p>
            {result.messages.length > 0 ? (
              <ul className="mt-3 grid gap-1 text-xs leading-5 text-slate-700">
                {result.messages.map((item) => <li key={item}>{item}</li>)}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PreflightStatus({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold ${ready ? "text-emerald-700" : "text-amber-800"}`}>
        {ready ? "Yes" : "No"}
      </p>
    </div>
  );
}
