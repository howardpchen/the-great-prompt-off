import {ScopedAdminPageFrame as AdminPageFrame} from "@/app/components/ScopedAdminPageFrame";
import { AdminLoginForm } from "@/app/components/AdminLoginForm";
import {
  AdminHeader,
  AdminSectionNav,
} from "@/app/components/AdminLayout";
import { AdminSimulationDashboard } from "@/app/components/AdminSimulationDashboard";
import { hasAdminSession } from "@/app/lib/supabase/admin-auth";

export default async function AdminSimulationsPage() {
  const authed = await hasAdminSession();

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-10 text-slate-950">
        <AdminLoginForm />
      </main>
    );
  }

  return (
    <AdminPageFrame>
      <AdminHeader
        backHref="/admin"
        title="Simulation Lab"
        subtitle="Run and review deterministic schema rehearsals in storage isolated from live workshop activity."
      />
      <AdminSectionNav currentHref="/admin/simulations" />
      <AdminSimulationDashboard />
    </AdminPageFrame>
  );
}
