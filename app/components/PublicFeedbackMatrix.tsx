"use client";
import { useState } from "react";
import type { ChallengeFieldDefinition } from "../lib/challenge-modes";
import { comparisonForReport, type ClinicalComparison } from "../lib/public-feedback";

export function PublicFeedbackMatrix({ reports, fields, comparisons, selected, onSelect }: {
  reports: Array<{ id: string; filename?: string }>;
  fields: readonly ChallengeFieldDefinition[];
  comparisons: ClinicalComparison[];
  selected: {report: string; field: string} | null;
  onSelect: (reportId: string, field: string) => void;
}) {
  const [description, setDescription] = useState("Focus or hover over a square for details. Select it to review the report and finding.");
  return <section aria-label="Results by report and finding" className="my-4 min-w-0 rounded-xl border border-slate-300 p-3 dark:border-slate-600">
    <h3 className="font-semibold">Results by report and finding</h3>
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">✓ Match · × Miss (including scored no decision) · — Unavailable. Colors show matches, not weighted point totals.</p>
    <div className="mt-3 max-h-[32rem] overflow-auto rounded border border-slate-200 dark:border-slate-700" tabIndex={0} role="region" aria-label="Scrollable results matrix">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <caption className="sr-only">Public report results. Rows follow the report viewer order; columns are findings.</caption>
        <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-950"><tr><th scope="col" className="sticky left-0 z-30 bg-slate-100 p-2 dark:bg-slate-950">Report</th>{fields.map(field => <th key={field.key} scope="col" className="min-w-14 max-w-24 px-1 py-2 font-medium"><span className="block break-words">{field.label}</span></th>)}</tr></thead>
        <tbody>{reports.map((report, index) => {
          const comparison = comparisonForReport(comparisons, report);
          const label = `Report ${String(index + 1).padStart(3, "0")}`;
          return <tr key={report.id}><th scope="row" className="sticky left-0 z-10 whitespace-nowrap border-t border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">{label}</th>{fields.map(field => {
            const result = comparison?.fields.find(item => item.field === field.key);
            const state = !result ? "Unavailable" : result.correct ? "Match" : "Miss";
            const detail = `${label}, ${field.label}: ${state}. ${result ? `Prediction: ${result.noDecision ? "No decision" : String(result.actual)}. Reference: ${String(result.expected)}.` : "No scored comparison is available."}`;
            const isSelected = selected?.report === report.id && selected.field === field.key;
            return <td key={field.key} className="border-t border-slate-200 p-1 text-center dark:border-slate-700"><button type="button" title={detail} aria-label={detail} aria-pressed={isSelected} onFocus={() => setDescription(detail)} onMouseEnter={() => setDescription(detail)} onClick={() => { setDescription(detail); onSelect(report.id, field.key); }} className={`h-9 w-9 rounded border text-base font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${isSelected ? "ring-2 ring-sky-400 ring-offset-2 dark:ring-offset-slate-900" : ""} ${!result ? "border-slate-400 bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : result.correct ? "border-emerald-600 bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-red-500 bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-300"}`}><span aria-hidden="true">{!result ? "—" : result.correct ? "✓" : "×"}</span></button></td>;
          })}</tr>;
        })}</tbody>
      </table>
    </div>
    <p className="mt-2 min-h-10 text-xs text-slate-700 dark:text-slate-200" aria-live="polite">{description}</p>
  </section>;
}
