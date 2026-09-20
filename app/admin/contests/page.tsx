import {hasAdminSession} from '../../lib/supabase/admin-auth';
import {createDatabase} from '../../lib/db/database';
import {listContests} from '../../lib/db/contest-library';
import {AdminPageFrame,AdminHeader,AdminSectionNav} from '../../components/AdminLayout';
import {AdminLoginForm} from '../../components/AdminLoginForm';
import {ContestLibrary,type ContestLibraryRow} from '../../components/ContestLibrary';
export default async function ContestsPage(){
  if(!await hasAdminSession())return <main className="p-8"><AdminLoginForm/></main>;
  const contests=await listContests(createDatabase()) as ContestLibraryRow[];
  return <AdminPageFrame><AdminHeader title="Contest Library" subtitle="Prepare drafts, inspect frozen contests, and preserve every event’s history."/><AdminSectionNav currentHref="/admin/contests"/><ContestLibrary initialContests={contests}/></AdminPageFrame>;
}
