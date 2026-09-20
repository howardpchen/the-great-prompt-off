import {notFound} from 'next/navigation';
import {hasAdminSession} from '../../../lib/supabase/admin-auth';
import {createDatabase} from '../../../lib/db/database';
import {contestSchemaState} from '../../../lib/db/contest-schema';
import {AdminPageFrame,AdminHeader,AdminSectionNav} from '../../../components/AdminLayout';
import {AdminLoginForm} from '../../../components/AdminLoginForm';
import {ContestSchemaEditor} from '../../../components/ContestSchemaEditor';
export default async function ContestPage({params}:{params:Promise<{contestId:string}>}){
  if(!await hasAdminSession())return <main className="p-8"><AdminLoginForm/></main>;
  const {contestId}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contestId))notFound();
  const db=createDatabase();if(!(await db.sql('SELECT id FROM challenges WHERE id=$1',[contestId])).length)notFound();
  const state=await contestSchemaState(db,contestId,true);
  return <AdminPageFrame><AdminHeader title={state.locked?'Inspect contest':'Contest Builder'} subtitle="This page targets the contest in its address. Viewing it does not switch the active event."/><AdminSectionNav currentHref="/admin/contests"/><ContestSchemaEditor key={state.contestId} initialState={state}/></AdminPageFrame>;
}
