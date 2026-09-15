import {ScopedAdminPageFrame as AdminPageFrame} from "@/app/components/ScopedAdminPageFrame";
import { AdminCaseManager } from "../../components/AdminCaseManager";
import { AdminAutoRefresh } from "../../components/AdminAutoRefresh";
import { AdminLoginForm } from "../../components/AdminLoginForm";
import {
  AdminHeader,
  AdminSectionNav,
} from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";
import { getAdminCaseManagerData } from "../../lib/supabase/admin-cases";

export default async function AdminCasesPage() {
  const authed = await hasAdminSession();

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-10 text-slate-950">
        <AdminLoginForm />
      </main>
    );
  }

  const caseData = await getAdminCaseManagerData();

  return (
    <AdminPageFrame>
      <AdminHeader
        backHref="/admin"
        title="Case Manager"
        subtitle="Admin-only live editing for synthetic reports and answer keys."
      />
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AdminSectionNav currentHref="/admin/cases" />
        <AdminAutoRefresh />
      </div>
      <AdminCaseManager data={caseData} />
    </AdminPageFrame>
  );
}
