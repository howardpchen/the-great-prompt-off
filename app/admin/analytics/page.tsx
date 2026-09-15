import {ScopedAdminPageFrame as AdminPageFrame} from "@/app/components/ScopedAdminPageFrame";
import type { ReactNode } from "react";

import { AdminLoginForm } from "../../components/AdminLoginForm";
import { AdminAutoRefresh } from "../../components/AdminAutoRefresh";
import { AdminCalibrationPanel } from "../../components/AdminCalibrationPanel";
import {
  AdminHeader,
  AdminSectionNav,
  AdminTable,
  MetricCard,
  score,
} from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";
import {
  getAdminAnalyticsData,
  type ScoreBucket,
} from "../../lib/supabase/admin-analytics";

export default async function AdminAnalyticsPage() {
  const authed = await hasAdminSession();

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-10 text-slate-950">
        <AdminLoginForm />
      </main>
    );
  }

  const data = await getAdminAnalyticsData();

  return (
    <AdminPageFrame>
      <AdminHeader
        backHref="/admin"
        title="Analytics"
        subtitle="Read-only workshop insights from stored attempts, final submissions, and safe format diagnostics."
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionNav currentHref="/admin/analytics" />
        <AdminAutoRefresh intervalSeconds={15} />
      </div>

      <AdminCalibrationPanel />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Participants" value={data.summary.totalParticipants} />
        <MetricCard
          label="With test attempt"
          value={data.summary.participantsWithTestAttempt}
        />
        <MetricCard
          label="With final"
          value={data.summary.participantsWithFinalSubmission}
        />
        <MetricCard
          label="Average best test"
          value={score(data.summary.averageBestTestScore) || "-"}
        />
        <MetricCard
          label="Average final"
          value={score(data.summary.averageFinalScore) || "-"}
        />
        <MetricCard
          label="Highest test"
          value={score(data.summary.highestTestScore) || "-"}
        />
        <MetricCard
          label="Highest final"
          value={score(data.summary.highestFinalScore) || "-"}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <InsightCard title="Practice improvement">
          <div className="grid gap-3 sm:grid-cols-3">
            <SmallMetric
              label="Average improvement"
              value={signedScore(data.practiceImprovement.averageImprovement)}
            />
            <SmallMetric
              label="Improved"
              value={data.practiceImprovement.participantsImproved}
            />
            <SmallMetric
              label="No improvement"
              value={data.practiceImprovement.participantsWithNoImprovement}
            />
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Improvement compares each participant&apos;s first Test Attempt score
            with their best Test Attempt score.
          </p>
        </InsightCard>

        <InsightCard title="Attempt behavior">
          <SmallMetric
            label="Average attempts used"
            value={
              data.attemptBehavior.averageAttemptsUsed === null
                ? "-"
                : data.attemptBehavior.averageAttemptsUsed.toFixed(1)
            }
          />
          <BarList
            rows={data.attemptBehavior.distribution.map((row) => ({
              label: `${row.attempts} attempt${row.attempts === 1 ? "" : "s"}`,
              value: row.participants,
            }))}
          />
        </InsightCard>

        <InsightCard title="Format diagnostics">
          <div className="grid gap-3 sm:grid-cols-3">
            <SmallMetric
              label="JSON validity"
              value={score(data.diagnostics.validJsonRate) || "-"}
            />
            <SmallMetric
              label="Invalid values"
              value={data.diagnostics.invalidValuesCount}
            />
            <SmallMetric
              label="Missing fields"
              value={data.diagnostics.missingFieldsCount}
            />
          </div>
          {data.diagnostics.commonInvalidFields.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Common invalid fields
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.diagnostics.commonInvalidFields.map((field) => (
                  <span
                    key={field.field}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    {field.field}: {field.count}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              No invalid field diagnostics have been stored yet.
            </p>
          )}
        </InsightCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ScoreDistribution
          title="Test score distribution"
          buckets={data.scoreDistributions.test}
        />
        <ScoreDistribution
          title="Final score distribution"
          buckets={data.scoreDistributions.final}
        />
      </section>

      <AdminTable
        title="Attempts by participant"
        columns={[
          "Participant",
          "Display name",
          "Test attempts",
          "Best test",
          "Latest test",
        ]}
        rows={data.attemptsByParticipant.map((row) => [
          row.participantCode,
          row.displayName || "",
          row.attemptsUsed,
          score(row.bestTestScore),
          score(row.latestTestScore),
        ])}
      />

      <AdminTable
        title="Practice vs final comparison"
        columns={["Participant", "Display name", "Best test", "Final", "Change"]}
        rows={data.practiceVsFinal.map((row) => [
          row.participantCode,
          row.displayName || "",
          score(row.bestTestScore),
          score(row.finalScore),
          signedScore(row.difference),
        ])}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600 shadow-sm">
        Analytics are computed from participants, submissions, and aggregate
        prompt-run item diagnostics. This page does not load answer keys, report
        text, raw model outputs, access codes, or secrets.
      </section>
    </AdminPageFrame>
  );
}

function InsightCard({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SmallMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ScoreDistribution({
  buckets,
  title,
}: {
  buckets: ScoreBucket[];
  title: string;
}) {
  return (
    <InsightCard title={title}>
      <BarList
        rows={buckets.map((bucket) => ({
          label: bucket.label,
          value: bucket.count,
        }))}
      />
    </InsightCard>
  );
}

function BarList({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="mt-3 grid gap-2">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[90px_minmax(0,1fr)_40px] items-center gap-3"
        >
          <span className="text-sm font-medium text-slate-600">{row.label}</span>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-teal-600"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </div>
          <span className="text-right text-sm font-semibold text-slate-900">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function signedScore(value: number | null) {
  if (value === null) {
    return "-";
  }

  const rounded = Math.round(value);

  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}
