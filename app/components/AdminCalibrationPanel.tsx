"use client";
import {adminFetch as fetch} from "../lib/admin-fetch";

import { useState } from "react";

import { getFriendlyModelName } from "../lib/model-display";
import { formatFieldScore } from "../lib/score-display";

type CalibrationResponse = {
  model: string;
  modelSource: "challenge_override" | "environment_fallback";
  environmentModel: string;
  challengeModel: string | null;
  reportCount: number;
  fieldCount: number;
  baselines: Array<{
    id: string;
    label: string;
    score: number;
    correctFields: number;
    totalFields: number;
    reportScores: number[];
  }>;
};

export function AdminCalibrationPanel() {
  const [result, setResult] = useState<CalibrationResponse | null>(null);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function runCalibration() {
    setIsPending(true);
    setError("");

    try {
      const response = await fetch("/api/admin/calibration", {
        method: "POST",
      });
      const payload = (await response.json()) as CalibrationResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Baseline calibration failed.");
      }

      setResult(payload);
    } catch (caught) {
      setResult(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Baseline calibration failed. Please try again.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Difficulty calibration
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Baseline prompt check
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Runs four fixed prompts against public reports using the current
            configured evaluation model. Results are temporary diagnostics only.
          </p>
        </div>
        <button
          type="button"
          onClick={runCalibration}
          disabled={isPending}
          className="h-10 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isPending ? "Running calibration..." : "Run baseline check"}
        </button>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        {result
          ? `This runs 4 baseline prompts across ${result.reportCount} public reports, for up to ${result.reportCount * 4} model calls.`
          : "This runs 4 baseline prompts across the public reports, for up to 4 model calls per public report."} It does not create submissions, consume attempts, or use private reports.
      </p>

      {error ? (
        <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm leading-6 text-rose-800">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 overflow-x-auto">
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold">
              Model: {result.model}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold">
              Friendly name: {getFriendlyModelName(result.model)}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold">
              Source: {result.modelSource === "challenge_override" ? "Challenge override" : "Environment fallback"}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold">
              Environment fallback: {result.environmentModel}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold">
              Challenge override: {result.challengeModel || "Not set"}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold">
              Public reports: {result.reportCount}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-semibold">
              Fields per report: {result.fieldCount}
            </span>
          </div>
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Baseline</th>
                <th className="px-3 py-3 font-semibold">Score</th>
                <th className="px-3 py-3 font-semibold">Fields correct</th>
                <th className="px-3 py-3 font-semibold">Per-report scores</th>
              </tr>
            </thead>
            <tbody>
              {result.baselines.map((baseline) => (
                <tr key={baseline.id} className="border-t border-slate-100">
                  <td className="px-3 py-3 font-semibold text-slate-800">
                    {baseline.label}
                  </td>
                  <td className="px-3 py-3 font-semibold text-slate-950">
                    {Math.round(baseline.score)}%
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {baseline.correctFields}/{baseline.totalFields}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">
                    {baseline.reportScores
                      .map((score) => formatFieldScore(score, result.fieldCount))
                      .join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Interpretation: if blank or nonsense prompts score very high, the
            current model/report set may be too easy. Strong participant prompts
            should show a meaningful gap above these baselines.
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Blank and nonsense should score low. Partial ACL-only should usually
            score somewhere in the middle because it only gives a usable
            strategy for one field. Basic all-findings should score higher when
            the challenge is calibrated well.
          </p>
        </div>
      ) : null}
    </section>
  );
}
