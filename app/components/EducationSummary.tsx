"use client";
import { useEffect, useState } from "react";
type Summary = { baseline?: { accuracy: number }; hiddenBaseline?: { accuracy: number }; simulated?: boolean; revealed?: boolean; message?: string };
export function EducationSummary({ token, contestId, phase, baselineInstructions, latestScore, finalScore, onUseBaseline }: {
  token: string; contestId: string; phase: string; baselineInstructions: string; latestScore: number | null; finalScore: number | null; onUseBaseline: () => void;
}) {
  const [result, setResult] = useState<Summary | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/education-summary", { headers: { Authorization: `Bearer ${token}` } }).then(async r => {
      if (!r.ok) throw new Error();
      const data = await r.json(); if (!cancelled) setResult(data);
    }).catch(() => { if (!cancelled) setResult({ message: "Baseline comparison unavailable; no score is implied." }); });
    return () => { cancelled = true; };
  }, [token, contestId, phase]);
  return <section className="rounded border border-teal-200 bg-teal-50 p-4 text-slate-900 space-y-2">
    <h2 className="font-semibold">Report-to-Registry Challenge</h2>
    <p>One team code, one shared budget, one fixed extraction model. Focus on explicit clinical assumptions, not JSON. Drafts are local to each browser; coordinate who submits.</p>
    <details><summary>Shared starting instructions</summary><p className="whitespace-pre-wrap">{baselineInstructions}</p></details>
    <button type="button" className="rounded border px-3 py-1" onClick={onUseBaseline}>Copy baseline into editor</button>
    {result?.simulated ? <p className="font-semibold">SIMULATION — workflow rehearsal only. These scores are synthetic, not clinical performance or evidence that instructions work.</p> : null}
    {result?.baseline ? <p>Shared practice baseline: {Math.round(result.baseline.accuracy)}%. Your latest practice: {latestScore === null ? "not evaluated" : `${Math.round(latestScore)}%`}. Both use the same practice cases and pipeline. The common baseline costs no team attempt.</p> : <p>{result?.message || "Loading shared baseline…"}</p>}
    <p>Scoring: each correct field earns its declared weight; an incorrect value or no decision earns zero. Scores average weighted report scores. Clinical null can be a valid reference value; no decision is never a negative.</p>
    {phase === "ended" ? <div><h3 className="font-semibold">Clinical debrief</h3><p>Team hidden score: {finalScore === null ? "not evaluated" : `${Math.round(finalScore)}%`}. Hidden baseline: {result?.hiddenBaseline ? `${Math.round(result.hiddenBaseline.accuracy)}%` : "unavailable"}.</p><ul className="list-disc pl-5"><li>Which assumptions did your instructions make explicit?</li><li>Where did practice improvements fail to generalize?</li><li>Review negation, uncertainty and ambiguous reference labels with the organizer.</li><li>Distinguish clinical extraction mistakes from infrastructure failures.</li></ul></div> : <p>Final instructions are locked on submission. Hidden results remain concealed until the organizer ends the event.</p>}
  </section>;
}
