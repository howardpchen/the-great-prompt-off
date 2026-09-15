import {ScopedAdminPageFrame as AdminPageFrame} from "@/app/components/ScopedAdminPageFrame";
import { AdminLoginForm } from "../../components/AdminLoginForm";
import { AdminAutoRefresh } from "../../components/AdminAutoRefresh";
import {
  AdminHeader,
  AdminSectionNav,
  AdminTable,
  formatDate,
  MetricCard,
  score,
} from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";
import { getAdminDashboardData } from "../../lib/supabase/admin-dashboard";

export default async function AdminResultsPage() {
  const authed = await hasAdminSession();

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-10 text-slate-950">
        <AdminLoginForm />
      </main>
    );
  }

  const data = await getAdminDashboardData();

  return (
    <AdminPageFrame>
      <AdminHeader
        backHref="/admin"
        title="Results"
        subtitle="Review test attempt performance, final scores, and exportable result summaries."
        actions={
          <a
            href="/api/admin/export/results"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
          >
            Export results CSV
          </a>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionNav currentHref="/admin/results" />
        <AdminAutoRefresh intervalSeconds={15} />
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Test submissions"
          value={data.overview.testSubmissionsCount}
        />
        <MetricCard
          label="Final submissions"
          value={data.overview.finalSubmissionsCount}
        />
        <MetricCard
          label="Completed final"
          value={data.overview.participantsCompletedFinal}
        />
        <MetricCard
          label="Latest run"
          value={formatDate(data.overview.latestRunTimestamp) || "-"}
        />
      </section>

      <AdminTable
        title="Results / leaderboard"
        columns={[
          "Participant",
          "Display name",
          "Email",
          "Best test",
          "Latest test",
          "Final score",
          "Final submitted",
          "Final model",
        ]}
        rows={data.leaderboard.map((participant) => [
          participant.participantCode,
          participant.displayName || "",
          participant.email || "",
          score(participant.bestTestScore),
          score(participant.latestTestScore),
          score(participant.finalScore),
          formatDate(participant.finalSubmittedAt),
          participant.finalModelName || "",
        ])}
      />
    </AdminPageFrame>
  );
}
