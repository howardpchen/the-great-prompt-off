"use client";
import { useEffect, useState } from "react";
import type { PublicChallengeModeMetadata } from "../lib/challenge-modes";
import { educationInstruction } from "../lib/education-contract";

type Summary = { baseline?: { accuracy: number }; hiddenBaseline?: { accuracy: number }; simulated?: boolean; revealed?: boolean; message?: string };
const disclosure = "border-t border-slate-200 dark:border-slate-700 py-3";
const toggle = "cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700";
const code = "mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 dark:bg-slate-950 p-3 text-xs leading-5 text-slate-700 dark:text-slate-200";

export function EducationSummary({ mode, token, contestId, phase, baselineInstructions, latestScore, finalScore, onUseBaseline }: {
  mode: PublicChallengeModeMetadata; token: string; contestId: string; phase: string; baselineInstructions: string; latestScore: number | null; finalScore: number | null; onUseBaseline: () => void;
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
  const field = mode.fields[0];
  const exampleValue = field?.type === "number" ? (field.minimum ?? field.maximum ?? 0) : field?.allowedValues[0];
  const example = field ? JSON.stringify({ [field.key]: { status: "decision", value: exampleValue } }, null, 2) : "{}";

  return <section className="mt-3 min-w-0 text-sm text-slate-700 dark:text-slate-200" aria-label="Starting instructions and model request">
    <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 leading-6" tabIndex={0} aria-label="Shared baseline text">{baselineInstructions}</p>
    <button type="button" className="mt-3 rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={onUseBaseline}>Copy baseline into editor</button>
    <p className="my-3 text-xs leading-5 text-slate-600 dark:text-slate-300">Each report is sent with the system message and your editor instructions, plus a structured-output schema. Your instructions guide clinical extraction; the app handles the output format. Field-level clinical definitions are not added automatically.</p>
    <details className={disclosure}>
      <summary className={toggle}>View system message</summary>
      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Generated from this contest’s current fields and allowed values using the same builder as submissions.</p>
      <pre className={code} tabIndex={0} aria-label="System message">{educationInstruction(mode)}</pre>
    </details>
    <details className={disclosure}>
      <summary className={toggle}>Output format · explanation and example</summary>
      <h3 className="mt-3 text-sm font-semibold">How your instructions become structured results</h3>
      <p className="mt-2 text-xs leading-5">Your instructions guide the model’s clinical interpretation. The application supplies a fixed output format so responses can be consistently validated and scored.</p>
      <p className="mt-2 text-xs leading-5">You don’t need to write JSON-formatting instructions, and this format isn’t participant-editable. It’s shown here for transparency.</p>
      <p className="mt-2 text-xs leading-5">Each response must include all {mode.fields.length} fields. For each field, the model returns either:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
        <li><strong>Decision:</strong> one of that field’s allowed values.</li>
        <li><strong>No decision:</strong> no value could be assigned.</li>
      </ul>
      <p className="mt-3 text-xs leading-5"><strong>The format controls structure rather than clinical interpretation.</strong> It does not choose the correct label, add clinical reasoning, or correct an incorrect answer. Those decisions depend on your instructions and the report.</p>
      <p className="mt-2 text-xs leading-5">“Not mentioned,” where allowed, is a clinical classification, not the same as “no decision.”</p>
      <details className="mt-3">
        <summary className={toggle}>View JSON example</summary>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Illustrative one-field excerpt, not a prediction or reference answer:</p>
        <pre className={code} tabIndex={0} aria-label="Output format example">{example}</pre>
        <p className="mt-2 text-xs leading-5">For no decision, the model returns <code>status: &quot;no_decision&quot;</code> and <code>value: null</code>. Extra fields and unsupported values are rejected.</p>
      </details>
    </details>
    <details className={disclosure} open={phase === "ended" || undefined}>
      <summary className={toggle}>{phase === "ended" ? "Results and clinical debrief" : "Scoring and baseline comparison"}</summary>
      {result?.simulated ? <p className="mt-2 text-xs font-semibold">SIMULATION — workflow rehearsal only. Scores do not measure clinical performance.</p> : null}
      <p className="mt-2 text-xs leading-5">Correct fields earn their configured weight; incorrect answers and no decision earn zero. The overall score averages report scores.</p>
      <p className="mt-2 text-xs leading-5">{result?.baseline ? `Shared baseline: ${Math.round(result.baseline.accuracy)}%. Latest practice: ${latestScore === null ? "not evaluated" : `${Math.round(latestScore)}%`}.` : result?.message || "Loading baseline comparison…"}</p>
      {phase === "ended" ? <div className="mt-3 text-xs leading-5"><h3 className="font-semibold">Clinical debrief</h3><p>Hidden score: {finalScore === null ? "not evaluated" : `${Math.round(finalScore)}%`}. Hidden baseline: {result?.hiddenBaseline ? `${Math.round(result.hiddenBaseline.accuracy)}%` : "unavailable"}.</p><p>Which assumptions helped on practice cases, and which failed to generalize?</p></div> : null}
    </details>
  </section>;
}
