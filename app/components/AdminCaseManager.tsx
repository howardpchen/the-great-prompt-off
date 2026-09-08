"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminAnswerKey,
  AdminCaseManagerData,
  AdminCaseRow,
  AdminCaseSplit,
  AdminFindingValue,
} from "../lib/supabase/admin-cases";

type CaseDraft = {
  answerKey: AdminAnswerKey;
  filename: string;
  reportId: string | null;
  reportText: string;
  split: AdminCaseSplit;
};

export function AdminCaseManager({ data }: { data: AdminCaseManagerData }) {
  const router = useRouter();
  const findingFields = data.fields.map(f=>f.key);
  const emptyAnswerKey: AdminAnswerKey = Object.fromEntries(data.fields.map(f=>[f.key,f.type === "number" ? null : f.allowedValues[0]]));
  const [draft, setDraft] = useState<CaseDraft>(newCaseDraft(emptyAnswerKey));
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isPending, setIsPending] = useState(false);
  const isEditing = Boolean(draft.reportId);
  const sortedCases = useMemo(
    () =>
      [...data.cases].sort((a, b) =>
        a.filename.localeCompare(b.filename, undefined, { numeric: true }),
      ),
    [data.cases],
  );

  function editCase(item: AdminCaseRow) {
    setDraft({
      reportId: item.id,
      filename: item.filename,
      split: item.split,
      reportText: item.reportText,
      answerKey: item.answerKey || emptyAnswerKey,
    });
    setMessage("");
  }

  function resetDraft() {
    setDraft(newCaseDraft(emptyAnswerKey));
    setMessage("");
  }

  async function saveCase() {
    setIsPending(true);
    setMessage("");

    const response = await fetch(
      isEditing ? "/api/admin/cases/update" : "/api/admin/cases/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draft),
      },
    );
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Case save failed.");
      setIsPending(false);
      return;
    }

    setMessage(isEditing ? "Case updated." : "Case created.");
    setDraft(newCaseDraft(emptyAnswerKey));
    router.refresh();
    setIsPending(false);
  }

  async function deleteCase(item: AdminCaseRow) {
    const confirmation = window.prompt(
      `Delete ${item.filename}? Type the exact filename to confirm. Reports with run history are blocked.`,
    );

    if (confirmation === null) {
      return;
    }

    setIsPending(true);
    setMessage("");

    const response = await fetch("/api/admin/cases/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reportId: item.id,
        confirmationFilename: confirmation,
      }),
    });
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setMessage(body?.error || "Case deletion failed.");
      setIsPending(false);
      return;
    }

    setMessage(`${item.filename} deleted.`);
    router.refresh();
    setIsPending(false);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Case manager
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">
            Live case library
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Admin-only live editing for seeded synthetic reports and answer keys.
            File-based import remains safer for bulk changes.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-5">
        <CaseMetric label="Total reports" value={data.summary.totalReports} />
        <CaseMetric label="Public" value={data.summary.publicReports} />
        <CaseMetric label="Private" value={data.summary.privateReports} />
        <CaseMetric label="With keys" value={data.summary.reportsWithAnswerKeys} />
        <CaseMetric label="Missing keys" value={data.summary.reportsMissingAnswerKeys} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Filename</th>
                <th className="px-3 py-3 font-semibold">ID/order</th>
                <th className="px-3 py-3 font-semibold">Split</th>
                <th className="px-3 py-3 font-semibold">Answer key</th>
                {findingFields.map((field) => (
                  <th key={field} className="px-3 py-3 font-semibold">
                    {field}
                  </th>
                ))}
                <th className="px-3 py-3 font-semibold">Run items</th>
                <th className="px-3 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedCases.map((item) => (
                <tr key={item.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-3 font-semibold text-slate-900">
                    {item.filename}
                    {expandedReportId === item.id ? (
                      <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs font-normal leading-5 text-slate-700">
                        {item.reportText}
                      </pre>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 font-mono text-slate-600">
                    {item.externalId}
                  </td>
                  <td className="px-3 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-700">
                      {item.split}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {item.hasAnswerKey ? "Yes" : "Missing"}
                  </td>
                  {findingFields.map((field) => (
                    <td key={field} className="px-3 py-3">
                      {item.answerKey?.[field] || "-"}
                    </td>
                  ))}
                  <td className="px-3 py-3">{item.promptRunItemCount}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReportId((current) =>
                            current === item.id ? null : item.id,
                          )
                        }
                        className="h-8 rounded-md border border-slate-300 px-2 font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => editCase(item)}
                        disabled={isPending}
                        className="h-8 rounded-md border border-slate-300 px-2 font-semibold text-slate-700 hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCase(item)}
                        disabled={isPending}
                        className="h-8 rounded-md border border-slate-300 px-2 font-semibold text-slate-700 hover:border-rose-600 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-950">
            {isEditing ? "Edit case" : "Create case"}
          </h3>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Filename
              <input
                value={draft.filename}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    filename: event.target.value,
                  }))
                }
                placeholder="synthetic_report_051.txt"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Split
              <select
                value={draft.split}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    split: event.target.value as AdminCaseSplit,
                  }))
                }
                className="h-10 rounded-md border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              >
                <option value="public">public</option>
                <option value="private">private</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Report text
              <textarea
                value={draft.reportText}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    reportText: event.target.value,
                  }))
                }
                className="h-56 resize-y rounded-md border border-slate-300 bg-white p-3 font-mono text-xs font-normal leading-5 text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <div className="grid gap-2">
              <p className="text-xs font-semibold text-slate-600">Answer key</p>
              {findingFields.map((field) => (
                <label
                  key={field}
                  className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-2 text-xs text-slate-600"
                >
                  <span className="font-mono">{field}</span>
                  {data.fields.find(f=>f.key===field)?.type === 'number' ? <input type="number" step="any" aria-label={field} value={draft.answerKey[field] ?? ''} onChange={e=>setDraft({...draft,answerKey:{...draft.answerKey,[field]:e.target.value === '' ? null : Number(e.target.value)}})}/> : <select
                    value={draft.answerKey[field] === null ? "__null__" : draft.answerKey[field]}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        answerKey: {
                          ...current.answerKey,
                          [field]: event.target.value === "__null__" ? null : event.target.value as AdminFindingValue,
                        },
                      }))
                    }
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  >
                    {data.fields.find(f=>f.key===field)?.nullable && <option value="__null__">Missing / uncertain (null)</option>}
                    {(data.fields.find(f=>f.key===field)?.allowedValues || []).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveCase}
                disabled={isPending}
                className="h-10 rounded-md bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isPending ? "Saving..." : isEditing ? "Save case" : "Create case"}
              </button>
              {isEditing ? (
                <button
                  type="button"
                  onClick={resetDraft}
                  disabled={isPending}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
            {message ? (
              <p className="rounded-md bg-white p-3 text-sm leading-6 text-slate-700">
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function CaseMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function newCaseDraft(emptyAnswerKey: AdminAnswerKey): CaseDraft {
  return {
    reportId: null,
    filename: "",
    split: "private",
    reportText: "",
    answerKey: emptyAnswerKey,
  };
}
