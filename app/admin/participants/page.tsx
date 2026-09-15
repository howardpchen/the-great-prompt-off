import {ScopedAdminPageFrame as AdminPageFrame} from "@/app/components/ScopedAdminPageFrame";
import { AdminLoginForm } from "../../components/AdminLoginForm";
import { AdminAutoRefresh } from "../../components/AdminAutoRefresh";
import { AdminParticipantActions } from "../../components/AdminActions";
import { AdminProgressMonitor } from "../../components/AdminProgressMonitor";
import {
  AdminHeader,
  AdminSectionNav,
  AdminTable,
  MetricCard,
  score,
} from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";
import { getAdminDashboardData } from "../../lib/supabase/admin-dashboard";

export default async function AdminParticipantsPage() {
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
        title="Participants"
        subtitle="Manage participant identity, access code status, activation, and participant-specific run clears."
        actions={
          <a
            href="/api/admin/export/access-codes"
            className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
          >
            Export access codes CSV
          </a>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionNav currentHref="/admin/participants" />
        <AdminAutoRefresh />
      </div>

      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Live participant monitoring
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Progress at a glance
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Track activity, attempts, and final submissions while the workshop is running.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Active participants" value={data.progressSummary.activeParticipants} />
        <MetricCard label="With test attempt" value={data.progressSummary.participantsWithTestAttempt} />
        <MetricCard label="Final submitted" value={data.progressSummary.participantsWithFinalSubmitted} />
        <MetricCard label="No activity" value={data.progressSummary.participantsWithNoActivity} />
        <MetricCard
          label="Average final"
          value={score(data.progressSummary.averageFinalScore) || "-"}
        />
        <MetricCard
          label="Best final"
          value={score(data.progressSummary.bestFinalScore) || "-"}
        />
      </section>

      {data.progressSummary.participantsWithTestAttempt === 0 &&
      data.progressSummary.participantsWithFinalSubmitted === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600 shadow-sm">
          No participant run activity yet. This monitor will update as participants submit Test Attempts and Final Submissions.
        </p>
      ) : null}

      <AdminProgressMonitor participants={data.participants} />

      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Participant operations
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Manage participant accounts
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Edit organizer-facing identity details, access status, and participant-specific data.
        </p>
      </section>

      <AdminTable
        title="Participant management"
        columns={[
          "Participant",
          "Display name",
          "Email",
          "Access code",
          "Status",
          "Tests",
          "Extra tests",
          "Final",
          "Latest test",
          "Best test",
          "Final score",
          "Actions",
        ]}
        rows={data.participants.map((participant) => [
          participant.participantCode,
          participant.displayName || "",
          participant.email || "",
          participant.accessCode,
          participant.isActive ? "Active" : "Inactive",
          String(participant.testAttemptsUsed),
          participant.extraPublicAttempts > 0
            ? `+${participant.extraPublicAttempts}`
            : "",
          participant.finalSubmitted ? "Yes" : "No",
          score(participant.latestTestScore),
          score(participant.bestTestScore),
          score(participant.finalScore),
          <AdminParticipantActions
            key={participant.participantCode}
            displayName={participant.displayName}
            email={participant.email}
            extraPublicAttempts={participant.extraPublicAttempts}
            isActive={participant.isActive}
            participantCode={participant.participantCode}
          />,
        ])}
      />
    </AdminPageFrame>
  );
}
