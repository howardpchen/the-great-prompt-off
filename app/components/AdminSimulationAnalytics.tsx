"use client";
import {adminFetch as fetch} from "../lib/admin-fetch";

import { useEffect, useState } from "react";

type AnalyticsResponse = {
  ok: true;
  deterministic: true;
  simulationOnly: true;
  summary: {
    batchCount: number;
    completedBatchCount: number;
    profileRunCount: number;
    averageScore: number | null;
    jsonValidityRate: number | null;
    missingFieldCount: number;
    invalidValueCount: number;
    weakAverageScore: number | null;
    strongAverageScore: number | null;
    weakStrongSeparation: number | null;
  };
  averagesByProfile: Array<{
    profileId: string;
    profileVersion: number;
    profileLabel: string;
    batchCount: number;
    profileRunCount: number;
    averageScore: number;
  }>;
  averagesByMode: Array<{
    modeId: string;
    schemaVersion: number;
    batchCount: number;
    profileRunCount: number;
    averageScore: number;
  }>;
  averagesByReportScope: Array<{
    reportScope: string;
    batchCount: number;
    profileRunCount: number;
    averageScore: number;
  }>;
  batchesOverTime: Array<{
    batchId: string;
    modeId: string;
    schemaVersion: number;
    reportScope: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    totalEvaluations: number;
    averageScore: number | null;
  }>;
  batchRankings: Array<{
    batchId: string;
    createdAt: string;
    modeId: string;
    schemaVersion: number;
    reportScope: string;
    rankings: Array<{
      rank: number;
      profileId: string;
      profileVersion: number;
      profileLabel: string;
      score: number;
      correctFields: number;
      totalFields: number;
      missingFieldCount: number;
      invalidValueCount: number;
    }>;
  }>;
};

type ComparisonResponse = {
  ok: true;
  deterministic: true;
  simulationOnly: true;
  left: BatchComparisonSummary;
  right: BatchComparisonSummary;
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
    leftScore: number | null;
    rightScore: number | null;
    scoreDelta: number | null;
    leftMissingFieldCount: number | null;
    rightMissingFieldCount: number | null;
    leftInvalidValueCount: number | null;
    rightInvalidValueCount: number | null;
  }>;
};

type BatchComparisonSummary = {
  batchId: string;
  modeId: string;
  schemaVersion: number;
  reportScope: string;
  createdAt: string;
  completedAt: string | null;
  status: string;
  reportCount: number;
  fieldCount: number;
  profileCount: number;
  totalEvaluations: number;
  averageScore: number | null;
  jsonValidityRate: number | null;
  missingFieldCount: number;
  invalidValueCount: number;
};

const analyticsEndpoint = "/api/admin/simulations/analytics";
const compareEndpoint = "/api/admin/simulations/compare";

export function AdminSimulationAnalytics({
  refreshVersion,
}: {
  refreshVersion: number;
}) {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [leftBatchId, setLeftBatchId] = useState("");
  const [rightBatchId, setRightBatchId] = useState("");
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch(analyticsEndpoint, { cache: "no-store" })
      .then((response) => readJson<AnalyticsResponse>(response))
      .then((payload) => {
        if (cancelled) return;
        setAnalytics(payload);
        const newestFirst = payload.batchesOverTime
          .filter((batch) => batch.status === "completed")
          .reverse();
        const availableIds = new Set(newestFirst.map((batch) => batch.batchId));
        setLeftBatchId((current) =>
          availableIds.has(current) ? current : newestFirst[1]?.batchId ?? "",
        );
        setRightBatchId((current) =>
          availableIds.has(current) ? current : newestFirst[0]?.batchId ?? "",
        );
        setComparison(null);
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

  async function compareBatches() {
    if (!leftBatchId || !rightBatchId || leftBatchId === rightBatchId) {
      setError("Select two different simulation batches.");
      return;
    }

    setComparing(true);
    setError("");
    try {
      const query = new URLSearchParams({ leftBatchId, rightBatchId });
      const response = await fetch(`${compareEndpoint}?${query.toString()}`, {
        cache: "no-store",
      });
      setComparison(await readJson<ComparisonResponse>(response));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setComparing(false);
    }
  }

  if (loading && !analytics) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white px-5 py-8 shadow-sm">
        <p className="text-sm text-slate-600">Loading simulation-only analytics...</p>
      </section>
    );
  }

  if (!analytics) {
    return (
      <section className="rounded-lg border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
        {error || "Simulation analytics are unavailable."}
      </section>
    );
  }

  const comparisonOptions = analytics.batchesOverTime
    .filter((batch) => batch.status === "completed")
    .reverse();

  return (
    <section aria-labelledby="simulation-analytics-heading" className="grid gap-5 border-y border-slate-200 py-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Simulation-only analytics</p>
          <h2 id="simulation-analytics-heading" className="mt-2 text-2xl font-semibold text-slate-950">Deterministic rehearsal trends</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            These aggregates use isolated deterministic simulation batches only. They are not workshop results or a real LLM benchmark.
          </p>
        </div>
        <span className="w-fit rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-900">
          {analytics.summary.completedBatchCount} completed of {analytics.summary.batchCount} batches
        </span>
      </div>

      {error ? <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AnalyticsMetric label="Average score" value={formatPercent(analytics.summary.averageScore)} />
        <AnalyticsMetric label="JSON validity" value={formatPercent(analytics.summary.jsonValidityRate)} />
        <AnalyticsMetric label="Missing fields" value={String(analytics.summary.missingFieldCount)} />
        <AnalyticsMetric label="Invalid values" value={String(analytics.summary.invalidValueCount)} />
        <AnalyticsMetric label="Profile runs" value={String(analytics.summary.profileRunCount)} />
        <AnalyticsMetric label="Weak average" value={formatPercent(analytics.summary.weakAverageScore)} />
        <AnalyticsMetric label="Strong average" value={formatPercent(analytics.summary.strongAverageScore)} />
        <AnalyticsMetric label="Strong minus weak" value={formatSignedPoints(analytics.summary.weakStrongSeparation)} />
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Weak profiles are blank, nonsense, and vague. Strong profiles are the basic and strong all-fields strategies. The partial-field profile is excluded from separation.
      </p>

      {analytics.summary.batchCount === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-5 py-10 text-sm text-slate-600 shadow-sm">
          Run and save at least one deterministic simulation batch to populate trends and comparisons.
        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-2">
            <AnalyticsBars
              title="Average score by profile"
              rows={analytics.averagesByProfile.map((profile) => ({
                key: `${profile.profileId}:${profile.profileVersion}`,
                label: profile.profileLabel,
                detail: `${profile.batchCount} batches`,
                value: profile.averageScore,
              }))}
            />
            <AnalyticsBars
              title="Batches over time"
              rows={analytics.batchesOverTime.filter((batch) => batch.status === "completed").slice(-12).map((batch) => ({
                key: batch.batchId,
                label: formatTimestamp(batch.createdAt),
                detail: `${batch.modeId} · ${batch.reportScope}`,
                value: batch.averageScore ?? 0,
              }))}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <AggregateTable
              title="Average score by mode"
              headers={["Mode", "Batches", "Profile runs", "Average"]}
              rows={analytics.averagesByMode.map((mode) => [
                `${mode.modeId} v${mode.schemaVersion}`,
                String(mode.batchCount),
                String(mode.profileRunCount),
                formatPercent(mode.averageScore),
              ])}
            />
            <AggregateTable
              title="Average score by report scope"
              headers={["Scope", "Batches", "Profile runs", "Average"]}
              rows={analytics.averagesByReportScope.map((scope) => [
                capitalize(scope.reportScope),
                String(scope.batchCount),
                String(scope.profileRunCount),
                formatPercent(scope.averageScore),
              ])}
            />
          </div>

          <BatchComparisonForm
            options={comparisonOptions}
            leftBatchId={leftBatchId}
            rightBatchId={rightBatchId}
            setLeftBatchId={setLeftBatchId}
            setRightBatchId={setRightBatchId}
            comparing={comparing}
            onCompare={() => void compareBatches()}
          />

          {comparison ? <BatchComparisonResult comparison={comparison} /> : null}

          <BatchRankings rankings={analytics.batchRankings.filter((batch) => batch.rankings.length > 0).slice(0, 10)} />
        </>
      )}
    </section>
  );
}

function AnalyticsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function AnalyticsBars({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; label: string; detail: string; value: number }>;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-4 grid gap-4">
        {rows.length ? rows.map((row) => (
          <div key={row.key}>
            <div className="flex items-end justify-between gap-3 text-sm">
              <span className="min-w-0 font-semibold text-slate-800"><span className="block truncate">{row.label}</span><span className="block text-xs font-normal text-slate-500">{row.detail}</span></span>
              <span className="shrink-0 font-semibold text-slate-950">{formatPercent(row.value)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${clampPercent(row.value)}%` }} />
            </div>
          </div>
        )) : <p className="text-sm text-slate-600">No aggregate data available.</p>}
      </div>
    </section>
  );
}

function AggregateTable({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <h3 className="border-b border-slate-200 px-5 py-4 text-lg font-semibold text-slate-950">{title}</h3>
      <div className="overflow-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-4 py-3">{header}</th>)}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.join(":")} className="border-t border-slate-100">{row.map((cell, index) => <td key={`${cell}:${index}`} className="px-4 py-3">{cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function BatchComparisonForm({
  options,
  leftBatchId,
  rightBatchId,
  setLeftBatchId,
  setRightBatchId,
  comparing,
  onCompare,
}: {
  options: AnalyticsResponse["batchesOverTime"];
  leftBatchId: string;
  rightBatchId: string;
  setLeftBatchId: (value: string) => void;
  setRightBatchId: (value: string) => void;
  comparing: boolean;
  onCompare: () => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-950">Compare two batches</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">Compare safe per-profile scores and aggregate diagnostics from two isolated deterministic batches.</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <BatchSelect label="Left batch" value={leftBatchId} options={options} onChange={setLeftBatchId} />
        <BatchSelect label="Right batch" value={rightBatchId} options={options} onChange={setRightBatchId} />
        <button type="button" onClick={onCompare} disabled={comparing || options.length < 2 || !leftBatchId || !rightBatchId || leftBatchId === rightBatchId} className="inline-flex h-11 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300">
          {comparing ? "Comparing..." : "Compare batches"}
        </button>
      </div>
    </section>
  );
}

function BatchSelect({ label, value, options, onChange }: { label: string; value: string; options: AnalyticsResponse["batchesOverTime"]; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-800">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-950">
        <option value="">Select a batch</option>
        {options.map((batch) => <option key={batch.batchId} value={batch.batchId}>{formatTimestamp(batch.createdAt)} · {batch.modeId} · {batch.reportScope}</option>)}
      </select>
    </label>
  );
}

function BatchComparisonResult({ comparison }: { comparison: ComparisonResponse }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <h3 className="text-lg font-semibold text-slate-950">Batch comparison</h3>
        <p className="mt-1 text-sm text-slate-600">Delta is right batch minus left batch.</p>
      </div>
      <div className="grid gap-3 border-b border-slate-200 p-5 sm:grid-cols-2 xl:grid-cols-5">
        <ComparisonMetric label="Average score delta" value={formatSignedPoints(comparison.deltas.averageScore)} />
        <ComparisonMetric label="Evaluation delta" value={formatSignedNumber(comparison.deltas.totalEvaluations)} />
        <ComparisonMetric label="JSON validity delta" value={formatSignedPoints(comparison.deltas.jsonValidityRate)} />
        <ComparisonMetric label="Missing-field delta" value={formatSignedNumber(comparison.deltas.missingFieldCount)} />
        <ComparisonMetric label="Invalid-value delta" value={formatSignedNumber(comparison.deltas.invalidValueCount)} />
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Profile</th><th className="px-4 py-3">Left score</th><th className="px-4 py-3">Right score</th><th className="px-4 py-3">Delta</th><th className="px-4 py-3">Missing left / right</th><th className="px-4 py-3">Invalid left / right</th></tr></thead>
          <tbody>{comparison.profiles.map((profile) => <tr key={`${profile.profileId}:${profile.profileVersion}`} className="border-t border-slate-100"><td className="px-4 py-3 font-semibold text-slate-900">{profile.profileLabel}</td><td className="px-4 py-3">{formatPercent(profile.leftScore)}</td><td className="px-4 py-3">{formatPercent(profile.rightScore)}</td><td className="px-4 py-3 font-semibold">{formatSignedPoints(profile.scoreDelta)}</td><td className="px-4 py-3">{formatPair(profile.leftMissingFieldCount, profile.rightMissingFieldCount)}</td><td className="px-4 py-3">{formatPair(profile.leftInvalidValueCount, profile.rightInvalidValueCount)}</td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function ComparisonMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-semibold text-slate-950">{value}</p></div>;
}

function BatchRankings({ rankings }: { rankings: AnalyticsResponse["batchRankings"] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h3 className="text-lg font-semibold text-slate-950">Profile ranking within each batch</h3><p className="mt-1 text-sm text-slate-600">Latest ten batches, ranked by score with diagnostic counts as tie-breakers.</p></div>
      <div className="divide-y divide-slate-200">
        {rankings.map((batch) => (
          <div key={batch.batchId} className="grid gap-3 px-5 py-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <div><p className="text-sm font-semibold text-slate-900">{formatTimestamp(batch.createdAt)}</p><p className="mt-1 break-all text-xs text-slate-500">{batch.modeId} v{batch.schemaVersion} · {batch.reportScope}<br />{batch.batchId}</p></div>
            <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{batch.rankings.map((ranking) => <li key={`${ranking.profileId}:${ranking.profileVersion}`} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm"><span className="font-semibold text-slate-900">{ranking.rank}. {ranking.profileLabel}</span><span className="mt-1 block text-xs text-slate-600">{formatPercent(ranking.score)} · {ranking.correctFields}/{ranking.totalFields} correct · {ranking.missingFieldCount} missing · {ranking.invalidValueCount} invalid</span></li>)}</ol>
          </div>
        ))}
      </div>
    </section>
  );
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "The simulation analytics request failed.");
  return payload as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The simulation analytics request failed.";
}

function formatPercent(value: number | null) {
  return value === null ? "-" : `${Math.round(value * 10) / 10}%`;
}

function formatSignedPoints(value: number | null) {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${Math.round(value * 10) / 10} pts`;
}

function formatSignedNumber(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatPair(left: number | null, right: number | null) {
  return `${left ?? "-"} / ${right ?? "-"}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
