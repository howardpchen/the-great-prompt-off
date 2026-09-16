"use client";
import {adminFetch as fetch} from "../lib/admin-fetch";

import { useEffect, useState } from "react";

type ReferenceResponse = {
  ok: true;
  deterministic: true;
  simulationOnly: true;
  reference: null | {
    batchId: string;
    label: string | null;
    notes: string | null;
    modeId: string;
    schemaVersion: number;
    evaluatorType: string;
    reportScope: string;
    reportCount: number;
    fieldCount: number;
    totalEvaluations: number;
    createdAt: string;
    completedAt: string | null;
    profiles: Array<{
      profileId: string;
      profileVersion: number;
      profileLabel: string;
    }>;
    disclaimer: string;
  };
  thresholds: {
    scoreChangePoints: number;
    warnOnJsonValidityDecrease: true;
    warnOnMissingFieldIncrease: true;
    warnOnInvalidValueIncrease: true;
  };
  comparisons: Array<{
    candidate: {
      batchId: string;
      modeId: string;
      schemaVersion: number;
      reportScope: string;
      createdAt: string;
      averageScore: number | null;
      jsonValidityRate: number | null;
      missingFieldCount: number;
      invalidValueCount: number;
      totalEvaluations: number;
    };
    configurationMatches: boolean;
    deltas: {
      averageScore: number | null;
      totalEvaluations: number;
      missingFieldCount: number;
      invalidValueCount: number;
      jsonValidityRate: number | null;
    };
    profiles: Array<{
      profileId: string;
      profileVersion: number;
      profileLabel: string;
      referenceScore: number | null;
      candidateScore: number | null;
      scoreDelta: number | null;
      referenceMissingFieldCount: number | null;
      candidateMissingFieldCount: number | null;
      referenceInvalidValueCount: number | null;
      candidateInvalidValueCount: number | null;
    }>;
    warnings: Array<{
      code: string;
      message: string;
      profileId?: string;
    }>;
  }>;
};

const referenceEndpoint = "/api/admin/simulations/reference";

export function AdminSimulationReferencePanel({
  refreshVersion,
  onReferenceChanged,
}: {
  refreshVersion: number;
  onReferenceChanged: () => void;
}) {
  const [data, setData] = useState<ReferenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(referenceEndpoint, { cache: "no-store" })
      .then((response) => readJson<ReferenceResponse>(response))
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          setError("");
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(getErrorMessage(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshVersion]);

  async function clearReference() {
    if (!window.confirm("Clear the current simulation reference baseline? The simulation batch and its results will remain stored.")) {
      return;
    }

    setClearing(true);
    setError("");
    try {
      const response = await fetch(referenceEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "CLEAR REFERENCE" }),
      });
      await readJson<{ ok: true }>(response);
      setData((current) => current ? { ...current, reference: null, comparisons: [] } : current);
      onReferenceChanged();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setClearing(false);
    }
  }

  return (
    <section aria-labelledby="simulation-reference-heading" className="grid gap-5 border-y border-slate-200 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Simulation-only regression checking</p>
          <h2 id="simulation-reference-heading" className="mt-2 text-2xl font-semibold text-slate-950">Reference baseline</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Compare completed deterministic rehearsals against one reference batch. This is not clinical validation and does not affect live workshop results.
          </p>
        </div>
        {data?.reference ? (
          <button type="button" onClick={() => void clearReference()} disabled={clearing} className="inline-flex h-10 w-fit items-center rounded-md border border-rose-300 bg-white px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50">
            {clearing ? "Clearing..." : "Clear reference"}
          </button>
        ) : null}
      </div>

      {error ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}
      {loading && !data ? <p className="text-sm text-slate-600">Loading reference baseline...</p> : null}

      {data && !data.reference ? (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-8 text-sm text-slate-600 shadow-sm">
          No reference is set. Mark a completed batch below to begin deterministic regression checking.
        </div>
      ) : null}

      {data?.reference ? (
        <>
          <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-5 py-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-cyan-800">Current reference</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">{data.reference.label || formatTimestamp(data.reference.createdAt)}</h3>
                <p className="mt-1 break-all text-xs text-slate-600">{data.reference.batchId}</p>
              </div>
              <span className="w-fit rounded-md border border-cyan-300 bg-white px-2.5 py-1 text-xs font-semibold text-cyan-900">{data.reference.modeId} v{data.reference.schemaVersion}</span>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <ReferenceFact label="Scope" value={capitalize(data.reference.reportScope)} />
              <ReferenceFact label="Reports / fields" value={`${data.reference.reportCount} / ${data.reference.fieldCount}`} />
              <ReferenceFact label="Profiles" value={String(data.reference.profiles.length)} />
              <ReferenceFact label="Evaluations" value={String(data.reference.totalEvaluations)} />
            </div>
            {data.reference.notes ? <p className="mt-3 text-sm leading-6 text-slate-700">{data.reference.notes}</p> : null}
            <p className="mt-3 text-xs text-slate-600">{data.reference.disclaimer}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ThresholdFact label="Score warning" value={`More than ${data.thresholds.scoreChangePoints} points`} />
            <ThresholdFact label="JSON warning" value="Any decrease" />
            <ThresholdFact label="Missing fields" value="Any increase" />
            <ThresholdFact label="Invalid values" value="Any increase" />
          </div>

          <div className="grid gap-4">
            <h3 className="text-lg font-semibold text-slate-950">Recent batches versus reference</h3>
            {data.comparisons.length ? data.comparisons.map((comparison) => (
              <RegressionComparison key={comparison.candidate.batchId} comparison={comparison} />
            )) : <p className="rounded-lg border border-slate-200 bg-white px-5 py-8 text-sm text-slate-600 shadow-sm">No other completed simulation batches are available for comparison.</p>}
          </div>
        </>
      ) : null}
    </section>
  );
}

function RegressionComparison({ comparison }: { comparison: ReferenceResponse["comparisons"][number] }) {
  return (
    <details className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4 hover:bg-slate-50">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-semibold text-slate-950">{formatTimestamp(comparison.candidate.createdAt)}</p>
            <p className="mt-1 text-xs text-slate-500">{comparison.candidate.modeId} v{comparison.candidate.schemaVersion} · {comparison.candidate.reportScope}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DeltaBadge label="Score" value={formatSignedPoints(comparison.deltas.averageScore)} warning={comparison.deltas.averageScore !== null && Math.abs(comparison.deltas.averageScore) > 5} />
            <DeltaBadge label="JSON" value={formatSignedPoints(comparison.deltas.jsonValidityRate)} warning={comparison.deltas.jsonValidityRate !== null && comparison.deltas.jsonValidityRate < 0} />
            <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${comparison.warnings.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>{comparison.warnings.length ? `${comparison.warnings.length} warnings` : "Within thresholds"}</span>
          </div>
        </div>
      </summary>
      <div className="border-t border-slate-200 px-5 py-4">
        {comparison.warnings.length ? <ul className="grid gap-2">{comparison.warnings.map((warning, index) => <li key={`${warning.code}:${warning.profileId ?? "batch"}:${index}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{warning.message}</li>)}</ul> : <p className="text-sm text-emerald-700">No configured regression thresholds were crossed.</p>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReferenceFact label="Evaluation delta" value={formatSignedNumber(comparison.deltas.totalEvaluations)} />
          <ReferenceFact label="Missing-field delta" value={formatSignedNumber(comparison.deltas.missingFieldCount)} />
          <ReferenceFact label="Invalid-value delta" value={formatSignedNumber(comparison.deltas.invalidValueCount)} />
          <ReferenceFact label="Configuration" value={comparison.configurationMatches ? "Matches reference" : "Different setup"} />
        </div>
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Profile</th><th className="px-3 py-3">Reference</th><th className="px-3 py-3">Candidate</th><th className="px-3 py-3">Score delta</th><th className="px-3 py-3">Missing ref / candidate</th><th className="px-3 py-3">Invalid ref / candidate</th></tr></thead>
            <tbody>{comparison.profiles.map((profile) => <tr key={`${profile.profileId}:${profile.profileVersion}`} className="border-t border-slate-100"><td className="px-3 py-3 font-semibold text-slate-900">{profile.profileLabel}</td><td className="px-3 py-3">{formatPercent(profile.referenceScore)}</td><td className="px-3 py-3">{formatPercent(profile.candidateScore)}</td><td className="px-3 py-3 font-semibold">{formatSignedPoints(profile.scoreDelta)}</td><td className="px-3 py-3">{formatPair(profile.referenceMissingFieldCount, profile.candidateMissingFieldCount)}</td><td className="px-3 py-3">{formatPair(profile.referenceInvalidValueCount, profile.candidateInvalidValueCount)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function ReferenceFact({ label, value }: { label: string; value: string }) {
  return <div className="border-l-2 border-slate-300 pl-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>;
}

function ThresholdFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-lg font-semibold text-slate-950">{value}</p></div>;
}

function DeltaBadge({ label, value, warning }: { label: string; value: string; warning: boolean }) {
  return <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${warning ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-slate-50 text-slate-700"}`}>{label} {value}</span>;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "The simulation reference request failed.");
  return payload as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The simulation reference request failed.";
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${Math.round(value * 10) / 10}%`;
}

function formatSignedPoints(value: number | null) {
  return value === null ? "-" : `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10} pts`;
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPair(reference: number | null, candidate: number | null) {
  return `${reference ?? "-"} / ${candidate ?? "-"}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
