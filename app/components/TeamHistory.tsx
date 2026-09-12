"use client";
import { useEffect, useState } from "react";
import type { TeamHistory as History } from "../lib/db/team-history";
export function TeamHistory({ token, contestId, revision, onUseInstructions }: {
  token: string; contestId: string; revision: string; onUseInstructions: (instructions: string) => void;
}) {
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/team-history", { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error(); const data = await r.json(); if (!controller.signal.aborted) { setHistory(data); setError(false); } })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [token, contestId, revision, refresh]);
  const restoreInstructions = (text: string) => {
    if (window.confirm("Replace this browser's draft with these saved team instructions?")) onUseInstructions(text);
  };
  return <section className="rounded border p-4 space-y-3" aria-label="Saved team instructions">
    <h2 className="font-semibold">Saved team instructions and practice results</h2>
    <p>Shared across browsers using your team code. Latest 100 completed practice versions; scores are for the practice cases only.</p>
    <button type="button" className="rounded border px-3 py-1" onClick={() => { setHistory(null); setError(false); setRefresh(n => n + 1); }}>Refresh team history</button>
    {error ? <p role="alert">Team history unavailable. Your local draft has not been changed; try refreshing history.</p> : !history ? <p>Loading saved instructions…</p> : <>
      {history.final ? <div className="rounded border p-3">
        <h3 className="font-semibold">Locked final instructions</h3>
        <p>These instructions remain locked even after an infrastructure failure. Copying them does not submit or charge an attempt.</p>
        {history.final.instructions !== null ? <>
          <details><summary>Read locked instructions</summary><p className="whitespace-pre-wrap">{history.final.instructions}</p></details>
          <button type="button" className="rounded border px-3 py-1" onClick={() => restoreInstructions(history.final!.instructions!)}>Restore locked final instructions to editor</button>
        </> : <p>This older attempt predates instruction recovery. Its hash is locked, but the original text is unavailable. Contact the organizer; no replacement is inferred.</p>}
      </div> : null}
      {history.practice.length === 0 ? <p>No completed practice versions yet.</p> : history.practice.map(version => <details key={version.id} className="rounded border p-3">
        <summary>Practice {version.attemptNumber} — {Math.round(version.score)}% — {new Date(version.submittedAt).toLocaleString()}</summary>
        <p>{version.correctFields}/{version.totalFields} fields correct across {version.reportCount} practice reports. Weighted scoring follows the organizer definitions.</p>
        <p className="whitespace-pre-wrap">{version.instructions}</p>
        <button type="button" className="rounded border px-3 py-1" onClick={() => restoreInstructions(version.instructions)}>Copy practice {version.attemptNumber} instructions to editor</button>
      </details>)}
    </>}
  </section>;
}
