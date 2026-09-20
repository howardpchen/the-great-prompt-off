import Link from 'next/link';
import {readAdminPageSnapshot} from '../../lib/db/admin-page-snapshot';
import {ScopedAdminPageFrame} from '../../components/ScopedAdminPageFrame';
import {AdminLoginForm} from '../../components/AdminLoginForm';
import {AdminHeader,AdminSectionNav} from '../../components/AdminLayout';
import {hasAdminSession} from '../../lib/supabase/admin-auth';
import {getAdminCaseManagerData} from '../../lib/supabase/admin-cases';
export default async function AdminCasesPage(){
 if(!await hasAdminSession())return <main className="p-8"><AdminLoginForm/></main>;
 const {data,contestContext}=await readAdminPageSnapshot(getAdminCaseManagerData);
 return <ScopedAdminPageFrame contestContext={contestContext}><AdminHeader title="Reference cases" subtitle="Read-only inspection of the active contest’s scored reports and reference answers. To revise them, duplicate the contest in the Library."/><AdminSectionNav currentHref="/admin/cases"/>
 <p className="rounded border bg-white dark:bg-slate-900 p-4 text-sm">{data.summary.publicReports} public / {data.summary.privateReports} hidden reports · {data.summary.reportsWithAnswerKeys} with reference answers. <Link href="/admin/contests" className="font-semibold text-teal-800 dark:text-teal-300 underline">Open Contest Library</Link></p>
 <div className="space-y-3">{data.cases.map(c=><details key={c.id} className="min-w-0 rounded-lg border bg-white dark:bg-slate-900 p-4"><summary className="cursor-pointer break-words font-semibold">{c.filename} · {c.split}</summary><div className="mt-4 grid gap-5 lg:grid-cols-2"><pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 dark:bg-slate-950 p-3 font-sans text-sm leading-6">{c.reportText}</pre><dl className="space-y-2 text-sm">{data.fields.map(f=><div key={f.key} className="grid grid-cols-2 gap-3 border-b py-2"><dt className="font-semibold">{f.label}</dt><dd className="break-words">{c.answerKey&&f.key in c.answerKey?String(c.answerKey[f.key]):'Missing reference'}</dd></div>)}</dl></div></details>)}</div>
 </ScopedAdminPageFrame>;
}
