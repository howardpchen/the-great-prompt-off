import { AdminLoginForm } from "../components/AdminLoginForm";
import { AdminAutoRefresh } from "../components/AdminAutoRefresh";
import { AdminModeReadiness } from "../components/AdminModeReadiness";
import {
  AdminEventAnnouncementControls,
  AdminEventControls,
  AdminEventTimerControls,
  AdminChallengeSchemaPanel,
  AdminEvaluationModelControls,
  AdminLeaderboardVisibilityControls,
  AdminLogoutButton,
  AdminResetPanel,
} from "../components/AdminActions";
import {
  AdminHeader,
  AdminNavigationCards,
  AdminPageFrame,
  AdminSectionNav,
  formatDate,
  HealthItem,
  MetricCard,
} from "../components/AdminLayout";
import { hasAdminSession } from "../lib/supabase/admin-auth";
import { getAdminDashboardData } from "../lib/supabase/admin-dashboard";

export default async function AdminPage() {
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
        title="Organizer dashboard"
        subtitle="Command center for event readiness, exports, and admin tools."
        actions={
          <>
            <a
              href="/api/admin/export/access-codes"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
            >
              Export access codes CSV
            </a>
            <a
              href="/api/admin/export/results"
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
            >
              Export results CSV
            </a>
            <AdminLogoutButton />
          </>
        }
      />

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionNav currentHref="/admin" />
        <AdminAutoRefresh intervalSeconds={15} />
      </div>

      <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Participants" value={data.overview.totalParticipants} />
        <MetricCard
          label="With access codes"
          value={data.overview.participantsWithAccessCodes}
        />
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
          value={formatDate(data.overview.latestRunTimestamp)}
        />
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Live event control
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Run the workshop
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Live controls for phases, participant messaging, visibility, and readiness.
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Health check
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Admin readiness
          </h2>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <HealthItem
              label="Database connected"
              value={data.health.supabaseConnected ? "Yes" : "No"}
            />
            <HealthItem
              label="USE_REAL_LLM"
              value={data.health.useRealLlm ? "true" : "false"}
            />
            <HealthItem label="OpenRouter model" value={data.health.openRouterModel} />
            <HealthItem
              label="Environment model fallback"
              value={data.health.openRouterEnvironmentModel}
            />
            <HealthItem
              label="Challenge model override"
              value={data.health.challengeEvaluationModel || "Not set"}
            />
            <HealthItem
              label="Model source"
              value={
                data.health.evaluationModelSource === "challenge_override"
                  ? "Challenge override"
                  : "Environment fallback"
              }
            />
            <HealthItem
              label="Report split"
              value={`${data.health.reportCounts.public} public / ${data.health.reportCounts.private} private`}
            />
            <HealthItem
              label="Participants"
              value={String(data.health.participantCount)}
            />
            <HealthItem
              label="Test submissions"
              value={String(data.health.testSubmissionsCount)}
            />
            <HealthItem
              label="Final submissions"
              value={String(data.health.finalSubmissionsCount)}
            />
            <HealthItem
              label="Latest run"
              value={formatDate(data.health.latestRunTimestamp) || "-"}
            />
          </div>
        </div>
        <div className="grid gap-5">
          <AdminEventControls currentPhase={data.overview.eventPhase} />
          <AdminLeaderboardVisibilityControls
            currentVisibility={data.overview.leaderboardVisibility}
          />
          <AdminEventAnnouncementControls
            currentAnnouncement={data.overview.eventAnnouncement}
          />
          <AdminEventTimerControls
            currentEndsAt={data.overview.eventTimerEndsAt}
            currentLabel={data.overview.eventTimerLabel}
          />
          <a
            href="/display/leaderboard"
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-500 hover:shadow-md"
          >
            <h2 className="text-lg font-semibold text-slate-950">
              Open projector leaderboard
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Open the big-screen display in a new tab. It follows the current
              participant leaderboard visibility setting.
            </p>
          </a>
        </div>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Difficulty & calibration
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Set the evaluation difficulty
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Model choice changes how much participant prompt strategy matters. Run calibration after changing models.
        </p>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <AdminEvaluationModelControls
          currentModel={data.health.challengeEvaluationModel}
          resolvedModel={data.health.openRouterModel}
          fallbackModel={data.health.openRouterEnvironmentModel}
        />
        <a
          href="/admin/analytics"
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-teal-500 hover:shadow-md"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Baseline calibration
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Compare model difficulty
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Run four fixed baseline prompts against public reports without
            creating submissions or consuming participant attempts.
          </p>
          <span className="mt-4 inline-flex text-sm font-semibold text-teal-700">
            Open Analytics
          </span>
        </a>
      </section>

      <AdminChallengeSchemaPanel challengeSchema={data.overview.challengeSchema} />

      <AdminModeReadiness
        modes={data.overview.modeReadiness}
        configurationLocked={data.overview.challengeSchema.configurationLocked}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Recommended run order
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">
          Live workflow
        </h2>
        <ol className="mt-3 grid gap-2 text-sm leading-6 text-slate-600 md:grid-cols-2 xl:grid-cols-4">
          <li><span className="font-semibold text-slate-900">1.</span> Check health and model.</li>
          <li><span className="font-semibold text-slate-900">2.</span> Open practice and monitor participants.</li>
          <li><span className="font-semibold text-slate-900">3.</span> Switch to final when ready.</li>
          <li><span className="font-semibold text-slate-900">4.</span> Review results and export.</li>
        </ol>
      </section>

      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Admin areas
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Monitor and manage
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Open a focused workspace for participants, results, analytics, cases, or help.
        </p>
      </section>

      <AdminNavigationCards />

      <section>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
          Maintenance
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">
          Dangerous actions
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use only when intentionally clearing workshop run data before or after an event.
        </p>
      </section>

      <AdminResetPanel />
    </AdminPageFrame>
  );
}
