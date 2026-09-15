"use client";
import {
  twelveBinaryTemplate,
  mixedTemplate,
} from "../lib/contest-schema-fixtures";
import { evaluationModelOptions } from "../lib/model-options";
import { useEffect, useState } from "react";
import type {
  ChallengeModeDefinition,
  ChallengeFieldDefinition,
} from "../lib/challenge-modes";
type State = {
  contestId: string;
  schema: ChallengeModeDefinition;
  locked: boolean;
  ready: boolean;
  history?: {participant_code:string;submission_type:string;attempt_number:number;score:number;submitted_at:string}[];
  reports: { id: string; filename: string; split: string }[];
};
export function ContestSchemaEditor() {
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState("");
  const [contests, setContests] = useState<{id:string;title:string;is_active:boolean;schema_ready:boolean;schema_locked:boolean;schema_version:number;report_count:number;submission_count:number;archived_at:string|null}[]>([]);
  const [reportImport, setReportImport] = useState("");
  const [title, setTitle] = useState("");
  const [model, setModel] = useState<string>(evaluationModelOptions[0].id);
  const [budget, setBudget] = useState(5);
  async function refreshList() {
    const r = await fetch("/api/admin/contests"); const b = await r.json();
    if (r.ok) setContests(b.contests); else throw new Error(b.error);
  }
  async function library(action: string) {
    if (!state) return;
    setBusy(true);
    try {
      const r=await fetch("/api/admin/contests",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,contestId:state.contestId,expectedVersion:state.schema.version,title,schema:state.schema,evaluationModel:model,practiceBudget:budget})});
      const b=await r.json(); if(!r.ok) throw new Error(b.error);
      await refreshList(); setSelected(b.contestId);
      setMessage(action==='activate'?"Contest selected. Open practice separately in the active-contest controls.":"Saved. Existing contest data preserved.");
    } catch(e) { setMessage(e instanceof Error?e.message:"Request failed."); }
    finally { setBusy(false); }
  }
  const [answers, setAnswers] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch(`/api/admin/contest-schema${selected ? `?contestId=${encodeURIComponent(selected)}` : ""}`);
    const b = await r.json();
    if (r.ok) setState(b);
    else setMessage(b.error);
  }
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/contests").then(r=>r.json()).then(b=>{if(!cancelled && b.contests) setContests(b.contests);}).catch(e=>{if(!cancelled) setMessage(String(e));});
    fetch(`/api/admin/contest-schema${selected ? `?contestId=${encodeURIComponent(selected)}` : ""}`)
      .then(async (r) => {
        const b = await r.json();
        if (!cancelled) {
          if (r.ok) setState(b);
          else setMessage(b.error);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Could not load schema.");
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);
  async function save(action: string) {
    if (!state) return;
    setBusy(true);
    try {
      const payload = {
        action,
        contestId: state.contestId,
        expectedVersion: state.schema.version,
        schema: state.schema,
        ...(action === "answers" ? { answers: JSON.parse(answers) } : {}),
        ...(action === "reports" ? { reports: JSON.parse(reportImport) } : {}),
      };
      const r = await fetch("/api/admin/contest-schema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setMessage(
        "Saved. Reload the participant page to see the active contract.",
      );
      await refreshList();
      if (b.contestId && b.contestId!==state.contestId) setSelected(b.contestId);
      else await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  function field(index: number, patch: Partial<ChallengeFieldDefinition>) {
    if (!state) return;
    setState({
      ...state,
      schema: {
        ...state.schema,
        fields: state.schema.fields.map((f, i) =>
          i === index ? { ...f, ...patch } : f,
        ),
      },
    });
  }
  if (!state) return <p>{message || "Loading contest schema…"}</p>;
  return (
    <section className="space-y-4 rounded border bg-white p-5 text-slate-900">
      <h2 className="text-xl font-bold">Contest Library</h2>
      <label className="grid gap-2">Selected contest (does not change the active contest)
        <select aria-label="Selected contest" value={selected || state.contestId} onChange={e=>setSelected(e.target.value)} className="border p-2">
          {contests.map(c=><option key={c.id} value={c.id}>{c.title} — {c.is_active?'ACTIVE':c.archived_at?'archived':'inactive'} · {c.report_count} reports · {c.submission_count} submissions</option>)}
        </select>
      </label>
      <p>Other organizer controls apply to the active contest only. This library edits the explicitly selected contest. Import readiness is structural, not clinical reference approval.</p>
      <button disabled={busy || !state.ready} onClick={()=>{if(window.confirm("Switch to this contest and pause submissions? Confirm reference review is complete. In-flight work blocks switching.")) void library('activate');}}>Activate selected contest (paused)</button>{' '}
      <button disabled={busy} onClick={()=>{if(window.confirm("Archive selection without deleting its reports, results or team history?")) void library('archive');}}>Archive selected contest</button>
      <details><summary>Create empty inactive contest from this configuration</summary>
        <label>New title<input aria-label="New contest title" value={title} onChange={e=>setTitle(e.target.value)} className="border p-2" /></label>
        <label>Fixed model<select aria-label="New contest model" value={model} onChange={e=>setModel(e.target.value)}>{evaluationModelOptions.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
        <label>Practice budget<input aria-label="New contest budget" type="number" min={1} max={100} value={budget} onChange={e=>setBudget(Number(e.target.value))} /></label>
        <button disabled={busy} onClick={()=>void library('create')}>Create inactive draft</button>
      </details>
      <h3>Selected contest fields and answer keys</h3>
      <p>
        Version {state.schema.version} · {state.schema.fields.length} fields ·{" "}
        {state.locked
          ? "Locked after first attempt"
          : state.ready
            ? "Structurally ready"
            : "Draft — import validated answers before opening submissions"}
      </p>
      <p>
        Classification uses exact labels. Measurements use inclusive absolute
        tolerance in the stated unit. Each field earns zero or its weight;
        scores are normalized to 100. Every key is required; enable null
        explicitly for missing or uncertain evidence. Null is never zero.
      </p>
      <p>
        Answer import verifies structure, not clinical correctness.
        Independently review reference answers and dataset permissions.
      </p>
      <fieldset disabled={state.locked || busy} className="space-y-3">
        <label className="grid gap-2">Bulk reports for empty draft (JSON array: external_id, filename, split public/private, report_text)
          <textarea aria-label="Report import" value={reportImport} onChange={e=>setReportImport(e.target.value)} className="border p-2" />
        </label><button onClick={()=>void save('reports')}>Import reports into selected empty draft</button>
      </fieldset>
      <fieldset disabled={state.locked || busy} className="space-y-3">
        <label className="block"><input type="checkbox" checked={Boolean(state.schema.education)} onChange={e => setState({ ...state, schema: { ...state.schema, education: e.target.checked ? { version: 1, pipeline: "structured-v1", baselineInstructions: "Use the organizer definitions. Base each finding on explicit report evidence; distinguish negation and uncertainty. If a decision cannot be made, abstain." } : undefined } })} /> Enable Team Challenge mode</label>
        {state.schema.education ? <label className="grid gap-2">Shared baseline instructions<textarea aria-label="Shared baseline instructions" className="border p-2" value={state.schema.education.baselineInstructions} onChange={e => setState({ ...state, schema: { ...state.schema, education: { ...state.schema.education!, baselineInstructions: e.target.value } } })} /><span>One team code shares one budget. One fixed extraction model; automatic formatting. Select an explicit evaluation model in the organizer controls before opening practice. Ending the event reveals final results. Baseline scores must be evaluated on the same cases; simulated scores are not clinical accuracy.</span></label> : null}
        <p>Start from a template, then edit any field:</p>
        <button
          type="button"
          onClick={() =>
            setState({
              ...state,
              schema: {
                ...twelveBinaryTemplate,
                id: state.schema.id,
                version: state.schema.version,
              },
            })
          }
        >
          Load 12 binary findings template
        </button>
        <button
          type="button"
          onClick={() =>
            setState({
              ...state,
              schema: {
                ...mixedTemplate,
                id: state.schema.id,
                version: state.schema.version,
              },
            })
          }
        >
          Load mixed 5 binary / 5 multiclass / 2 measurement template
        </button>
        <label>
          Contest title{" "}
          <input
            className="border p-1"
            value={state.schema.title}
            onChange={(e) =>
              setState({
                ...state,
                schema: { ...state.schema, title: e.target.value },
              })
            }
          />
        </label>
        {state.schema.fields.map((f, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-3">
            <label>
              Key{" "}
              <input
                className="border p-1"
                value={f.key}
                onChange={(e) => field(i, { key: e.target.value, aliases: [] })}
              />
            </label>
            <label>
              Label{" "}
              <input
                className="border p-1"
                value={f.label}
                onChange={(e) => field(i, { label: e.target.value })}
              />
            </label>
            <label>
              Type{" "}
              <select
                className="border p-1"
                value={f.type || "multiclass"}
                onChange={(e) =>
                  field(i, {
                    type: e.target.value as ChallengeFieldDefinition["type"],
                    allowedValues:
                      e.target.value === "number"
                        ? []
                        : e.target.value === "binary"
                          ? ["present", "absent"]
                          : ["low", "medium", "high"],
                    ...(e.target.value === "number"
                      ? { unit: "mm", tolerance: 0 }
                      : {}),
                  })
                }
              >
                <option value="binary">Binary</option>
                <option value="multiclass">Multiclass</option>
                <option value="number">Measurement</option>
              </select>
            </label>
            <label>
              Instructions{" "}
              <textarea
                className="border p-1"
                value={f.description || ""}
                onChange={(e) =>
                  field(i, { description: e.target.value || undefined })
                }
              />
            </label>
            {f.type === "number" ? (
              <>
                <label>
                  Unit{" "}
                  <input
                    className="border p-1"
                    value={f.unit || ""}
                    onChange={(e) => field(i, { unit: e.target.value })}
                  />
                </label>
                <label>
                  Absolute tolerance{" "}
                  <input
                    className="border p-1"
                    type="number"
                    min="0"
                    step="any"
                    value={f.tolerance ?? 0}
                    onChange={(e) =>
                      field(i, { tolerance: Number(e.target.value) })
                    }
                  />
                </label>
                {(["minimum", "maximum"] as const).map((k) => (
                  <label key={k}>
                    {k}
                    <input
                      className="border p-1"
                      type="number"
                      step="any"
                      value={f[k] ?? ""}
                      onChange={(e) =>
                        field(i, {
                          [k]:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                ))}
              </>
            ) : (
              <label>
                Labels (comma-separated)
                <input
                  className="border p-1"
                  value={f.allowedValues.join(",")}
                  onChange={(e) =>
                    field(i, { allowedValues: e.target.value.split(",") })
                  }
                />
              </label>
            )}
            <label>
              Weight{" "}
              <input
                className="border p-1"
                type="number"
                min="0.001"
                max="100"
                step="any"
                value={f.weight ?? 1}
                onChange={(e) => field(i, { weight: Number(e.target.value) })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={f.nullable || false}
                onChange={(e) => field(i, { nullable: e.target.checked })}
              />{" "}
              Allow null for missing/uncertain
            </label>
            <button
              type="button"
              onClick={() =>
                setState({
                  ...state,
                  schema: {
                    ...state.schema,
                    fields: state.schema.fields.filter((_, n) => n !== i),
                  },
                })
              }
            >
              Remove field
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={state.schema.fields.length >= 64}
          onClick={() =>
            setState({
              ...state,
              schema: {
                ...state.schema,
                fields: [
                  ...state.schema.fields,
                  {
                    key: `field_${state.schema.fields.length + 1}`,
                    label: "New field",
                    type: "binary",
                    allowedValues: ["present", "absent"],
                    weight: 1,
                  },
                ],
              },
            })
          }
        >
          Add field (maximum 64)
        </button>
        <button
          type="button"
          className="ml-4 rounded bg-teal-800 p-2 text-white"
          onClick={() => void save("schema")}
        >
          Save schema as new draft version
        </button>
        <p>
          Saving schema invalidates readiness; reimport answer keys for the new
          version. Prior keys are preserved.
        </p>
        <details>
          <summary>Report identifiers for answer import</summary>
          <pre>{JSON.stringify(state.reports, null, 2)}</pre>
        </details>
        <label className="block">
          Answer keys JSON: array of{" "}
          {`{ "report_id_or_filename": "…", "answer_values": { … } }`}
          <textarea
            className="block w-full border p-2 font-mono"
            rows={8}
            value={answers}
            onChange={(e) => setAnswers(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="rounded bg-teal-800 p-2 text-white"
          onClick={() => void save("answers")}
        >
          Validate and import all answers
        </button>
      </fieldset>
      <button
        disabled={busy}
        type="button"
        onClick={() => {
          if (
            window.confirm(
              "Duplicate as an inactive draft contest? Existing scores remain in the previous contest. Reports are copied; answers must be imported again.",
            )
          )
            void save("fork");
        }}
      >
        Duplicate configuration and reports (inactive; no answers)
      </button>
      <details><summary>Selected contest results (organizer only; latest 200)</summary>
        {state.history?.length ? <table><thead><tr><th>Team</th><th>Type</th><th>Attempt</th><th>Score</th></tr></thead><tbody>{state.history.map((h,i)=><tr key={i}><td>{h.participant_code}</td><td>{h.submission_type}</td><td>{h.attempt_number}</td><td>{h.score}</td></tr>)}</tbody></table> : <p>No recorded submissions for this contest.</p>}
      </details>
      <p role="status">{message}</p>
    </section>
  );
}
