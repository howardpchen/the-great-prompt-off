import { AdminLoginForm } from "../../components/AdminLoginForm";
import {
  AdminHeader,
  AdminPageFrame,
  AdminSectionNav,
} from "../../components/AdminLayout";
import { hasAdminSession } from "../../lib/supabase/admin-auth";

const helpSections = [
  {
    title: "Event-day workflow",
    items: [
      "Use DEMO_CHECKLIST.md for rehearsal and live event steps.",
      "Confirm the Health Check is ready before participants arrive.",
      "Reset workshop run data before the real event starts.",
      "Export results after the event for scoring and archive.",
    ],
  },
  {
    title: "Access codes",
    items: [
      "Participants enter unique access codes on the home page.",
      "The participant-facing UI shows friendly labels like P001, not secret codes.",
      "Use Participants to edit names/emails, regenerate one code, or deactivate/reactivate a participant.",
    ],
  },
  {
    title: "Admin Health Check expected values",
    items: [
      "Database connected: Yes.",
      "USE_REAL_LLM: true for production events.",
      "Report split: 5 public / 45 private.",
      "Participants: 50 unless the workshop roster changed.",
      "Test and Final submissions should be 0 before the real event.",
    ],
  },
  {
    title: "Participant management",
    items: [
      "Participant edits preserve access codes, run history, reports, answer keys, and challenges.",
      "Clear one participant only when intentionally resetting that participant's attempts and final submission.",
      "Deactivated participants cannot log in or submit, but their existing data remains stored.",
    ],
  },
  {
    title: "Results/export workflow",
    items: [
      "Results ranks prefer final score when available.",
      "Exports are admin-only and do not expose answer keys or private report text.",
      "Use the results CSV after the event for scoring and archival review.",
    ],
  },
  {
    title: "Case Manager usage",
    items: [
      "Use Cases for small live report or answer-key fixes.",
      "Report text and answer-key labels are admin-only.",
      "Deleting cases with run history is blocked to protect existing results.",
    ],
  },
  {
    title: "File-based report import",
    items: [
      "Use REPORT_IMPORT_GUIDE.md for bulk additions or larger dataset revisions.",
      "File-based import remains safer than live editing for coordinated report set changes.",
      "Changing public/private counts may require participant-facing text and documentation updates.",
    ],
  },
  {
    title: "Resetting workshop data",
    items: [
      "The full reset deletes prompt run items, submissions, prompt runs, and extra Test Attempt grants.",
      "The reset preserves participants, access codes, reports, answer keys, and challenges.",
      "The ordered PostgreSQL migrations must be applied before using reset tools; see deploy/README.md.",
    ],
  },
  {
    title: "OpenRouter / real LLM notes",
    items: [
      "Real evaluation uses server-side OpenRouter calls; keys are never exposed to the frontend.",
      "Test Attempts evaluate 5 public reports.",
      "Final Submission evaluates 45 hidden private reports and may take longer.",
      "OPENROUTER_CONCURRENCY controls how many report evaluations run at once.",
      "OPENROUTER_MODEL is the fallback. The Evaluation model panel can set a challenge override for new submissions and calibration.",
      "Challenge overrides are limited to five approved models based on live calibration; custom model IDs are not accepted.",
      "Gemini 2.5 Flash is currently recommended because blank/nonsense baselines were low while basic clinical prompts scored well.",
      "Gemma, Llama 3.2 3B, Qwen3 4B, and Phi-4 Mini were removed because they were unreliable or unavailable in this setup.",
      "The model selector changes future evaluations only; previous runs keep their recorded model.",
      "Use the Analytics baseline calibration on public reports to compare model/dataset difficulty before an event.",
    ],
  },
  {
    title: "No-assumption scoring",
    items: [
      "not_reported means the report is silent or does not provide enough information.",
      "absent requires explicit negative evidence; uncertain is for ambiguous evidence.",
      "The hidden formatting instruction enforces this contract without exposing answers or medical mapping hints.",
    ],
  },
  {
    title: "Troubleshooting",
    items: [
      "Server configuration changes require recreating the application container using the deployment runbook.",
      "If Health Check counts look wrong, review the active database and report split. Do not reseed an existing event to troubleshoot counts.",
      "If reset fails, ask the operator to verify the ordered PostgreSQL migrations against the active database; see deploy/README.md.",
      "If real LLM runs fail, check OpenRouter key, model, quota, and concurrency.",
    ],
  },
];

export default async function AdminHelpPage() {
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
        title="Organizer Help"
        subtitle="Quick admin reference for running and troubleshooting a workshop."
      />

      <AdminSectionNav currentHref="/admin/help" />

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Documentation
        </p>
        <h2 className="mt-2 text-xl font-semibold text-slate-950">
          Project docs
        </h2>
        <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
          <p>
            <span className="font-semibold text-slate-800">
              PROJECT_ARCHITECTURE.md
            </span>{" "}
            explains how reports, prompts, model outputs, scores, submissions,
            and admin controls fit together.
          </p>
          <p>
            <span className="font-semibold text-slate-800">
              DEMO_CHECKLIST.md
            </span>{" "}
            is the rehearsal and live run-of-show checklist.
          </p>
          <p>
            <span className="font-semibold text-slate-800">
              deploy/README.md
            </span>{" "}
            explains PostgreSQL migrations, verification, deployment, and recovery.
          </p>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Use <span className="font-semibold text-slate-800">README.md</span>{" "}
          as the short setup index and{" "}
          <span className="font-semibold text-slate-800">
            REPORT_IMPORT_GUIDE.md
          </span>{" "}
          for report import details.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {helpSections.map((section) => (
          <article
            key={section.title}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-lg font-semibold text-slate-950">
              {section.title}
            </h2>
            <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-600">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </AdminPageFrame>
  );
}
