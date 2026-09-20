import Link from 'next/link';
import {hasAdminSession} from '../../lib/supabase/admin-auth';
import {readAdminPageSnapshot} from '../../lib/db/admin-page-snapshot';
import {getAdminDashboardData} from '../../lib/supabase/admin-dashboard';
import {ScopedAdminPageFrame} from '../../components/ScopedAdminPageFrame';
import {AdminHeader,AdminSectionNav} from '../../components/AdminLayout';
import {AdminLoginForm} from '../../components/AdminLoginForm';
import {AdminResetPanel} from '../../components/AdminActions';
export default async function MaintenancePage(){
 if(!await hasAdminSession())return <main className="p-8"><AdminLoginForm/></main>;
 const {data,contestContext}=await readAdminPageSnapshot(getAdminDashboardData);
 return <ScopedAdminPageFrame contestContext={contestContext}><AdminHeader title="Advanced maintenance" subtitle="Destructive operations are separate from running an event. Prefer a new draft rehearsal to clearing history."/><AdminSectionNav currentHref="/admin/maintenance"/><section className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-5"><h2 className="font-semibold">Active contest: {data.overview.challengeSchema.title}</h2><p className="mt-2 text-sm">Clearing runs does not unlock frozen definitions, reference data, or evaluation settings. Duplicate the contest to make changes.</p><Link href="/admin/contests" className="mt-2 inline-flex font-semibold underline">Open Contest Library</Link></section><AdminResetPanel/></ScopedAdminPageFrame>;
}
