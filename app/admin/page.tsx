import Link from 'next/link';
import {readAdminPageSnapshot} from '../lib/db/admin-page-snapshot';
import {createDatabase} from '../lib/db/database';
import {contestSchemaState} from '../lib/db/contest-schema';
import {ScopedAdminPageFrame} from '../components/ScopedAdminPageFrame';
import {AdminLoginForm} from '../components/AdminLoginForm';
import {AdminAutoRefresh} from '../components/AdminAutoRefresh';
import {AdminEventAnnouncementControls,AdminEventControls,AdminEventTimerControls,AdminLeaderboardVisibilityControls,AdminLogoutButton} from '../components/AdminActions';
import {AdminHeader,AdminNavigationCards,AdminSectionNav,HealthItem,MetricCard,formatDate} from '../components/AdminLayout';
import {ContestConfigurationSummary} from '../components/ContestConfigurationSummary';
import {AdminSandboxControl} from '../components/AdminSandboxControl';
import {hasAdminSession} from '../lib/supabase/admin-auth';
import {getAdminDashboardData} from '../lib/supabase/admin-dashboard';
export default async function AdminPage(){
 if(!await hasAdminSession())return <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 p-8"><AdminLoginForm/></main>;
 const {data: snapshot,contestContext}=await readAdminPageSnapshot(async active=>{
   const data=active?await getAdminDashboardData():null;
   const contest=active?await contestSchemaState(createDatabase(),active.id):null;
   const [jobs]=active?await createDatabase().sql<{pending:number;failed:number}>(`SELECT
     (SELECT count(*)::int FROM attempt_reservations WHERE challenge_id=$1 AND status='pending') +
     (SELECT count(*)::int FROM sandbox_jobs WHERE challenge_id=$1 AND status='running') AS pending,
     (SELECT count(*)::int FROM sandbox_jobs WHERE challenge_id=$1 AND status='failed') AS failed`,[active.id]):[{pending:0,failed:0}];
   return {data,contest,jobs};
 });
 const {data,contest,jobs}=snapshot;
 return <ScopedAdminPageFrame contestContext={contestContext}>
  <AdminHeader title="Run contest" subtitle="Operate the active event. Build and revise contests separately in the Contest Library." actions={<><Link href="/admin/contests" className="rounded border bg-white dark:bg-slate-900 px-3 py-2 font-semibold text-teal-800 dark:text-teal-300">Contest Library</Link><AdminLogoutButton/></>}/>
  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]"><AdminSectionNav currentHref="/admin"/><AdminAutoRefresh intervalSeconds={15}/></div>
  {contest&&data?<>
    <ContestConfigurationSummary state={contest} compact/>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Participants" value={data.overview.totalParticipants}/><MetricCard label="Public submissions" value={data.overview.testSubmissionsCount}/><MetricCard label="Final submissions" value={data.overview.finalSubmissionsCount}/><MetricCard label="Evaluations in progress" value={jobs.pending}/></div>
    <section aria-label="Live event controls" className="grid items-start gap-5 xl:grid-cols-2"><div className="space-y-5"><AdminEventControls currentPhase={data.overview.eventPhase}/>{contest.schema.education&&<AdminSandboxControl contestId={contest.contestId} version={contest.schema.version} revision={contest.revision} enabled={!!contest.sandboxEnabled}/>}<AdminLeaderboardVisibilityControls currentVisibility={data.overview.leaderboardVisibility}/><Link href="/display/leaderboard" target="_blank" rel="noreferrer" className="block rounded-lg border bg-white dark:bg-slate-900 p-4 font-semibold text-teal-800 dark:text-teal-300">Open projector leaderboard ↗</Link></div><div className="space-y-5"><AdminEventAnnouncementControls currentAnnouncement={data.overview.eventAnnouncement}/><AdminEventTimerControls currentEndsAt={data.overview.eventTimerEndsAt} currentLabel={data.overview.eventTimerLabel}/><div className="rounded-lg border bg-white dark:bg-slate-900 p-5"><h2 className="text-lg font-semibold">Monitor participants and results</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Latest scored activity: {formatDate(data.overview.latestRunTimestamp)||'None yet'}. Failed Sandbox runs: {jobs.failed}. Review individual budgets and explicit accommodations from Participants.</p><div className="mt-3 flex flex-wrap gap-3"><Link href="/admin/participants" className="font-semibold text-teal-800 dark:text-teal-300 underline">Participants and budgets</Link><Link href="/admin/results" className="font-semibold text-teal-800 dark:text-teal-300 underline">Results and exports</Link></div></div></div></section>
    <details className="rounded-xl border bg-white dark:bg-slate-900 p-5"><summary className="cursor-pointer font-semibold">Technical health and diagnostics</summary><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><HealthItem label="Database connected" value={data.health.supabaseConnected?'Yes':'No'}/><HealthItem label="Provider requests" value={data.health.useRealLlm?'Live provider enabled':'Simulation runtime'}/><HealthItem label="Resolved model" value={data.health.openRouterModel}/><HealthItem label="Reference readiness" value={contest.ready?'Structurally ready':'Not ready'}/></div><p className="mt-3 text-sm">Model and evaluation settings are fixed for this contest version. Use the Builder on a new draft for configuration changes.</p><Link href="/admin/analytics" className="mt-2 inline-flex font-semibold text-teal-800 dark:text-teal-300 underline">Open analytics</Link></details>
  </>:<section className="rounded border bg-white dark:bg-slate-900 p-6"><h2 className="text-xl font-semibold">No active contest</h2><Link href="/admin/contests" className="text-teal-800 dark:text-teal-300 underline">Prepare or activate a contest from the library.</Link></section>}
  <AdminNavigationCards/>
  <footer className="text-sm text-slate-600 dark:text-slate-300">Need another rehearsal? Duplicate the contest to preserve its history. <Link className="underline" href="/admin/maintenance">Advanced maintenance</Link></footer>
 </ScopedAdminPageFrame>;
}
