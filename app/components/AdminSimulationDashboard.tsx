"use client";
import {adminFetch as fetch} from "../lib/admin-fetch";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminSimulationAnalytics } from "@/app/components/AdminSimulationAnalytics";
import { AdminSimulationReferencePanel } from "@/app/components/AdminSimulationReferencePanel";
import {
  buildSimulationRunPayload,
  getSimulationEvaluationEstimate,
} from "@/app/lib/simulation-dashboard";
import type { SimulationReportScope } from "@/app/lib/simulation-runner";

type SimulationModeOption = {
  id: string;
  version: number;
  title: string;
  fieldCount: number;
  active: boolean;
  rehearsalOnly: boolean;
};

type SimulationProfileOption = {
  id: string;
  version: number;
  label: string;
  description: string;
  purpose: string;
};

type SimulationBatch = {
  id: string;
  mode_id: string;
  schema_version: number;
  evaluator_type: string;
  report_scope: SimulationReportScope;
  status: "running" | "completed" | "failed";
  report_count: number;
  field_count: number;
  profile_count: number;
  total_evaluations: number;
  created_at: string;
  completed_at: string | null;
  is_reference: boolean;
  reference_label: string | null;
};

type SimulationProfileResult = {
  id: string;
  profile_id: string;
  profile_version: number;
  profile_label: string;
  correct_fields: number;
  total_fields: number;
  score: number;
  valid_json_count: number;
  invalid_json_count: number;
  missing_field_count: number;
  invalid_value_count: number;
  completed_report_count: number;
  created_at: string;
};

type SimulationListResponse = {
  ok: true;
  batches: SimulationBatch[];
  configuration: {
    activeModeId: string;
    modes: SimulationModeOption[];
    profiles: SimulationProfileOption[];
    reportCounts: Record<SimulationReportScope, number>;
  };
};

type SimulationDetailResponse = {
  ok: true;
  batch: SimulationBatch;
  profiles: SimulationProfileResult[];
  reproducibility: {
    batchId: string;
    modeId: string;
    schemaVersion: number;
    schemaSnapshotHash: string;
    evaluatorType: string;
    reportScope: SimulationReportScope;
    profiles: Array<{
      profileId: string;
      profileVersion: number;
      profileLabel: string;
    }>;
    reportCount: number;
    fieldCount: number;
    totalEvaluations: number;
    deterministic: true;
    synthetic: true;
    disclaimer: string;
  };
};

const simulationEndpoint = "/api/admin/simulations";

export function AdminSimulationDashboard() {
  const [data, setData] = useState<SimulationListResponse | null>(null);
  const [selectedModeId, setSelectedModeId] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [reportScope, setReportScope] = useState<SimulationReportScope>("public");
  const [detail, setDetail] = useState<SimulationDetailResponse | null>(null);
  const [clearConfirmation, setClearConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [analyticsRefreshVersion, setAnalyticsRefreshVersion] = useState(0);
  const [referenceRefreshVersion, setReferenceRefreshVersion] = useState(0);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(simulationEndpoint, { cache: "no-store" });
      const payload = await readJson<SimulationListResponse>(response);
      setData(payload);
      setSelectedModeId((current) => current || payload.configuration.activeModeId);
      setSelectedProfileIds((current) =>
        current.length > 0
          ? current
          : payload.configuration.profiles.map((profile) => profile.id),
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(simulationEndpoint, { cache: "no-store" })
      .then((response) => readJson<SimulationListResponse>(response))
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setSelectedModeId(payload.configuration.activeModeId);
        setSelectedProfileIds(
          payload.configuration.profiles.map((profile) => profile.id),
        );
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
  }, []);

  const selectedMode = data?.configuration.modes.find(
    (mode) => mode.id === selectedModeId,
  );
  const reportCount = data?.configuration.reportCounts[reportScope] ?? 0;
  const estimatedEvaluations = useMemo(
    () => getSimulationEvaluationEstimate(reportCount, selectedProfileIds.length),
    [reportCount, selectedProfileIds.length],
  );

  async function runSimulation() {
    if (!selectedMode || selectedProfileIds.length === 0) {
      setError("Select a challenge mode and at least one simulation profile.");
      return;
    }

    const rehearsalLabel = selectedMode.rehearsalOnly
      ? " This mode is dormant and this run is rehearsal-only."
      : "";
    const confirmed = window.confirm(
      `Run deterministic simulation?\n\nMode: ${selectedMode.title} (${selectedMode.id})\nSchema version: ${selectedMode.version}\nReport scope: ${reportScope}\nEstimated evaluations: ${estimatedEvaluations}\n\nDeterministic simulation is synthetic and not a real LLM benchmark.${rehearsalLabel}`,
    );
    if (!confirmed) {
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${simulationEndpoint}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildSimulationRunPayload({
            modeId: selectedMode.id,
            schemaVersion: selectedMode.version,
            reportScope,
            profileIds: selectedProfileIds,
          }),
        ),
      });
      const payload = await readJson<{ batchId: string }>(response);
      setNotice("Deterministic simulation completed and was saved in isolated simulation storage.");
      await loadBatches();
      await loadDetail(payload.batchId);
      setAnalyticsRefreshVersion((version) => version + 1);
      setReferenceRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorking(false);
    }
  }

  async function loadDetail(batchId: string) {
    setError("");
    try {
      const response = await fetch(`${simulationEndpoint}/${encodeURIComponent(batchId)}`, {
        cache: "no-store",
      });
      setDetail(await readJson<SimulationDetailResponse>(response));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    }
  }

  async function deleteBatch(batch: SimulationBatch) {
    const confirmation = window.prompt(
      `Delete this simulation batch? This affects simulation data only.\n\nType the batch ID to confirm:\n${batch.id}`,
    );
    if (confirmation !== batch.id) {
      if (confirmation !== null) {
        setError("The batch ID did not match. Nothing was deleted.");
      }
      return;
    }

    setWorking(true);
    setError("");
    try {
      const response = await fetch(`${simulationEndpoint}/${encodeURIComponent(batch.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: batch.id }),
      });
      await readJson<{ ok: true }>(response);
      if (detail?.batch.id === batch.id) {
        setDetail(null);
      }
      setNotice("Simulation batch deleted. Real event data was not changed.");
      await loadBatches();
      setAnalyticsRefreshVersion((version) => version + 1);
      setReferenceRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorking(false);
    }
  }

  async function clearAllSimulations() {
    if (clearConfirmation !== "CLEAR SIMULATIONS") {
      setError("Type CLEAR SIMULATIONS to confirm.");
      return;
    }

    setWorking(true);
    setError("");
    try {
      const response = await fetch(simulationEndpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: clearConfirmation }),
      });
      await readJson<{ ok: true }>(response);
      setDetail(null);
      setClearConfirmation("");
      setNotice("All simulation data for the active challenge was cleared. Real event data was not changed.");
      await loadBatches();
      setAnalyticsRefreshVersion((version) => version + 1);
      setReferenceRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorking(false);
    }
  }

  function toggleProfile(profileId: string) {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId],
    );
  }

  async function refreshSimulationData() {
    await loadBatches();
    setAnalyticsRefreshVersion((version) => version + 1);
    setReferenceRefreshVersion((version) => version + 1);
  }

  async function markReference(batch: SimulationBatch) {
    const label = window.prompt(
      "Optional reference label (80 characters maximum):",
      batch.reference_label || `Reference ${formatTimestamp(batch.created_at)}`,
    );
    if (label === null) return;
    if (label.trim().length > 80) {
      setError("Reference label must be 80 characters or fewer.");
      return;
    }
    if (!window.confirm(`Mark ${batch.id} as the simulation reference? This will replace the current reference baseline. No batch results or real event data will be changed.`)) {
      return;
    }

    setWorking(true);
    setError("");
    try {
      const response = await fetch(`${simulationEndpoint}/reference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batch.id, label: label.trim() || null }),
      });
      await readJson<{ ok: true }>(response);
      setNotice("Simulation reference baseline updated. Real event data was not changed.");
      await loadBatches();
      setReferenceRefreshVersion((version) => version + 1);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorking(false);
    }
  }

  function handleReferenceChanged() {
    void loadBatches();
    setReferenceRefreshVersion((version) => version + 1);
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-950">
        <p className="font-semibold">Deterministic simulation is synthetic and not a real LLM benchmark.</p>
        <p className="mt-1 leading-6">
          Runs are stored separately from participants, attempts, submissions, and the live leaderboard.
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">New batch</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Run deterministic rehearsal</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Choose a schema, report scope, and built-in profiles. Dormant modes remain rehearsal-only and are not activated by a simulation.
            </p>
          </div>
          <div className="min-w-48 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Estimated evaluations</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{estimatedEvaluations}</p>
            <p className="text-xs text-slate-500">{reportCount} reports × {selectedProfileIds.length} profiles</p>
          </div>
        </div>

        {loading && !data ? (
          <p className="py-8 text-sm text-slate-600">Loading simulation configuration...</p>
        ) : data ? (
          <div className="mt-5 grid gap-5">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Challenge mode
                <select
                  value={selectedModeId}
                  onChange={(event) => setSelectedModeId(event.target.value)}
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-950"
                >
                  {data.configuration.modes.map((mode) => (
                    <option key={mode.id} value={mode.id}>
                      {mode.title} · v{mode.version}{mode.rehearsalOnly ? " · Rehearsal only" : ""}
                    </option>
                  ))}
                </select>
                {selectedMode ? (
                  <span className="font-normal text-slate-500">
                    {selectedMode.id} · {selectedMode.fieldCount} fields · {selectedMode.active ? "Active mode" : "Dormant / rehearsal-only"}
                  </span>
                ) : null}
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Schema version
                <select
                  value={selectedMode?.version ?? ""}
                  disabled
                  className="h-11 rounded-md border border-slate-300 bg-slate-100 px-3 font-normal text-slate-700"
                >
                  {selectedMode ? (
                    <option value={selectedMode.version}>Version {selectedMode.version}</option>
                  ) : null}
                </select>
                <span className="font-normal text-slate-500">Version is fixed by the selected registry mode.</span>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-slate-800">
                Report scope
                <select
                  value={reportScope}
                  onChange={(event) => setReportScope(event.target.value as SimulationReportScope)}
                  className="h-11 rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-950"
                >
                  <option value="public">Public ({data.configuration.reportCounts.public})</option>
                  <option value="private">Private ({data.configuration.reportCounts.private})</option>
                  <option value="all">All ({data.configuration.reportCounts.all})</option>
                </select>
                <span className="font-normal text-slate-500">Reports are counted from the active challenge.</span>
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">Built-in simulation profiles</legend>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.configuration.profiles.map((profile) => (
                  <label key={profile.id} className="flex gap-3 rounded-md border border-slate-200 p-3 hover:border-teal-400">
                    <input
                      type="checkbox"
                      checked={selectedProfileIds.includes(profile.id)}
                      onChange={() => toggleProfile(profile.id)}
                      className="mt-1 size-4 accent-teal-700"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-900">{profile.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">{profile.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void runSimulation()}
                disabled={working || selectedProfileIds.length === 0 || reportCount === 0}
                className="inline-flex h-10 items-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {working ? "Working..." : "Run simulation batch"}
              </button>
              <button
                type="button"
                onClick={() => void refreshSimulationData()}
                disabled={working || loading}
                className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:opacity-50"
              >
                Refresh history
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Recent simulation batches</h2>
            <p className="mt-1 text-sm text-slate-600">The 25 most recent batches for the active challenge.</p>
          </div>
          <button type="button" onClick={() => downloadSimulationCsv()} className="inline-flex h-10 w-fit items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700">
            Export completed batches CSV
          </button>
        </div>
        {data?.batches.length ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Scope</th>
                  <th className="px-4 py-3">Evaluator</th>
                  <th className="px-4 py-3">Reports / fields</th>
                  <th className="px-4 py-3">Profiles / evaluations</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.batches.map((batch) => (
                  <tr key={batch.id} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3">{formatTimestamp(batch.created_at)}</td>
                    <td className="px-4 py-3"><span className="font-semibold">{batch.mode_id}</span><br /><span className="text-xs text-slate-500">v{batch.schema_version}</span>{batch.is_reference ? <span className="mt-1 block w-fit rounded-md border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-900">Reference</span> : null}</td>
                    <td className="px-4 py-3 capitalize">{batch.report_scope}</td>
                    <td className="px-4 py-3">{formatIdentifier(batch.evaluator_type)}</td>
                    <td className="px-4 py-3">{batch.report_count} / {batch.field_count}</td>
                    <td className="px-4 py-3">{batch.profile_count} / {batch.total_evaluations}</td>
                    <td className="px-4 py-3"><StatusBadge status={batch.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void loadDetail(batch.id)} className="text-sm font-semibold text-teal-700 hover:text-teal-900">View</button>
                        {batch.status === "completed" ? <button type="button" onClick={() => downloadSimulationCsv(batch.id)} className="text-sm font-semibold text-slate-700 hover:text-teal-900">Export</button> : null}
                        {batch.status === "completed" && !batch.is_reference ? <button type="button" onClick={() => void markReference(batch)} disabled={working} className="text-sm font-semibold text-cyan-700 hover:text-cyan-900 disabled:opacity-50">Mark as reference</button> : null}
                        <button type="button" onClick={() => void deleteBatch(batch)} disabled={working} className="text-sm font-semibold text-rose-700 hover:text-rose-900 disabled:opacity-50">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 py-10 text-sm text-slate-600">No deterministic simulation batches have been saved yet.</p>
        )}
      </section>

      {detail ? <SimulationBatchDetail detail={detail} /> : null}

      <AdminSimulationReferencePanel
        refreshVersion={referenceRefreshVersion}
        onReferenceChanged={handleReferenceChanged}
      />

      <AdminSimulationAnalytics refreshVersion={analyticsRefreshVersion} />

      <section className="rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Simulation cleanup</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">Clear all simulation data</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Deletes isolated simulation batches for the active challenge only. It does not clear workshop participants, attempts, runs, or submissions.
        </p>
        <label className="mt-4 grid max-w-md gap-2 text-sm font-semibold text-slate-800">
          Type CLEAR SIMULATIONS to confirm
          <input
            value={clearConfirmation}
            onChange={(event) => setClearConfirmation(event.target.value)}
            className="h-11 rounded-md border border-slate-300 px-3 font-mono font-normal text-slate-950"
          />
        </label>
        <button
          type="button"
          onClick={() => void clearAllSimulations()}
          disabled={working || clearConfirmation !== "CLEAR SIMULATIONS"}
          className="mt-3 inline-flex h-10 items-center rounded-md bg-rose-700 px-4 text-sm font-semibold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Clear simulation data
        </button>
      </section>
    </div>
  );
}

function SimulationBatchDetail({ detail }: { detail: SimulationDetailResponse }) {
  const reproducibility = detail.reproducibility;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Batch detail</p>
        <h2 className="mt-2 break-all text-lg font-semibold text-slate-950">{detail.batch.id}</h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <span>{detail.batch.mode_id} v{detail.batch.schema_version}</span>
          <span>{detail.batch.report_count} reports</span>
          <span>{detail.batch.field_count} fields</span>
          <span>{detail.batch.total_evaluations} evaluations</span>
          <span>Completed {formatTimestamp(detail.batch.completed_at)}</span>
        </div>
        <button type="button" onClick={() => downloadSimulationCsv(detail.batch.id)} className="mt-4 inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700">
          Export this batch CSV
        </button>
      </div>
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Reproducibility summary</p>
            <h3 className="mt-2 text-lg font-semibold text-slate-950">Deterministic batch contract</h3>
          </div>
          <span className="w-fit rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900">Synthetic / deterministic</span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
          <ReproducibilityItem label="Mode" value={`${reproducibility.modeId} v${reproducibility.schemaVersion}`} />
          <ReproducibilityItem label="Evaluator" value={formatIdentifier(reproducibility.evaluatorType)} />
          <ReproducibilityItem label="Report scope" value={reproducibility.reportScope} />
          <ReproducibilityItem label="Reports / fields" value={`${reproducibility.reportCount} / ${reproducibility.fieldCount}`} />
          <ReproducibilityItem label="Total evaluations" value={String(reproducibility.totalEvaluations)} />
          <div className="border-l-2 border-slate-300 pl-3 sm:col-span-2 xl:col-span-3">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schema snapshot hash</dt>
            <dd className="mt-1 break-all font-mono text-xs text-slate-800">{reproducibility.schemaSnapshotHash}</dd>
          </div>
        </dl>
        <div className="mt-4 border-t border-slate-200 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected profiles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {reproducibility.profiles.map((profile) => <span key={`${profile.profileId}:${profile.profileVersion}`} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">{profile.profileLabel} · {profile.profileId} v{profile.profileVersion}</span>)}
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">{reproducibility.disclaimer}</p>
      </div>
      {detail.profiles.length ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Profile</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Correct / total</th>
                <th className="px-4 py-3">Reports</th>
                <th className="px-4 py-3">Valid / invalid JSON</th>
                <th className="px-4 py-3">Missing fields</th>
                <th className="px-4 py-3">Invalid values</th>
              </tr>
            </thead>
            <tbody>
              {detail.profiles.map((profile) => (
                <tr key={profile.id} className="border-t border-slate-100">
                  <td className="px-4 py-3"><span className="font-semibold text-slate-900">{profile.profile_label}</span><br /><span className="text-xs text-slate-500">{profile.profile_id} v{profile.profile_version}</span></td>
                  <td className="px-4 py-3 font-semibold">{formatPercent(profile.score)}</td>
                  <td className="px-4 py-3">{profile.correct_fields} / {profile.total_fields}</td>
                  <td className="px-4 py-3">{profile.completed_report_count}</td>
                  <td className="px-4 py-3">{profile.valid_json_count} / {profile.invalid_json_count}</td>
                  <td className="px-4 py-3">{profile.missing_field_count}</td>
                  <td className="px-4 py-3">{profile.invalid_value_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-sm text-slate-600">No profile summaries are available for this batch.</p>
      )}
    </section>
  );
}

function ReproducibilityItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-slate-300 pl-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: SimulationBatch["status"] }) {
  const style = status === "completed"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "failed"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold capitalize ${style}`}>{status}</span>;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
  if (!response.ok) {
    throw new Error(typeof payload?.error === "string" ? payload.error : "The simulation request failed.");
  }
  return payload as T;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The simulation request failed.";
}

function formatTimestamp(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatIdentifier(value: string) {
  return value.replaceAll("_", " ");
}

function formatPercent(value: number) {
  return `${Math.round(Number(value) * 10) / 10}%`;
}

function downloadSimulationCsv(batchId?: string) {
  const url = batchId
    ? `/api/admin/simulations/export?batchId=${encodeURIComponent(batchId)}`
    : "/api/admin/simulations/export";
  window.location.assign(url);
}
