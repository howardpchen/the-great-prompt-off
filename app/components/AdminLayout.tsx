import Link from "next/link";
import type { ReactNode } from "react";

export const adminBuildMarker = "admin-health-v1";

export function AdminPageFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f7f9f8] px-6 py-6 text-slate-950">
      <div className="mx-auto grid w-full max-w-[1500px] gap-5">{children}</div>
    </main>
  );
}

export function AdminHeader({
  actions,
  backHref,
  subtitle,
  title,
}: {
  actions?: ReactNode;
  backHref?: string;
  subtitle?: string;
  title: string;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <Link
          href={backHref || "/"}
          className={
            backHref
              ? "inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
              : "text-sm font-semibold text-teal-700"
          }
        >
          {backHref ? "Back to admin dashboard" : "The Great Prompt-Off"}
        </Link>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">{title}</h1>
        {subtitle ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            {subtitle}
          </p>
        ) : null}
        <p className="mt-2 w-fit rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
          Build: {adminBuildMarker}
        </p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminNavigationCards() {
  const items = [
    {
      href: "/admin/participants",
      label: "Participants",
      text: "Manage identities, access codes, status, and participant-specific clears.",
    },
    {
      href: "/admin/results",
      label: "Results",
      text: "Review leaderboard scores, final submissions, and result exports.",
    },
    {
      href: "/admin/analytics",
      label: "Analytics",
      text: "Explore read-only workshop trends, score distributions, and format diagnostics.",
    },
    {
      href: "/admin/simulations",
      label: "Simulations",
      text: "Run deterministic schema rehearsals isolated from live workshop results.",
    },
    {
      href: "/admin/cases",
      label: "Cases",
      text: "Create, view, edit, and safely delete reports and answer keys.",
    },
    {
      href: "/admin/help",
      label: "Help",
      text: "Organizer workflow notes, docs links, readiness checks, and troubleshooting.",
    },
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm hover:border-teal-500 hover:shadow-md"
        >
          <h2 className="text-lg font-semibold text-slate-950">{item.label}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
        </Link>
      ))}
    </section>
  );
}

export function AdminSectionNav({ currentHref }: { currentHref: string }) {
  const items = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/participants", label: "Participants" },
    { href: "/admin/results", label: "Results" },
    { href: "/admin/analytics", label: "Analytics" },
    { href: "/admin/simulations", label: "Simulations" },
    { href: "/admin/cases", label: "Cases" },
    { href: "/admin/help", label: "Help" },
  ];

  return (
    <nav
      aria-label="Admin pages"
      className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm"
    >
      {items.map((item) => {
        const isCurrent = item.href === currentHref;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold ${
              isCurrent
                ? "bg-teal-700 text-white"
                : "text-slate-700 hover:bg-slate-100 hover:text-teal-700"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

export function HealthItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-words font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function AdminTable({
  columns,
  rows,
  title,
}: {
  columns: string[];
  rows: ReactNode[][];
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
      </div>
      <div className="overflow-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="px-3 py-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-slate-100">
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-3">
                    {cell || "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function score(value: number | null) {
  return value === null ? "" : `${Math.round(value)}%`;
}

export function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
