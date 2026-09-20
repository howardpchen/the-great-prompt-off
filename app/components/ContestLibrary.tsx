'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {twelveBinaryTemplate,mixedTemplate} from '../lib/contest-schema-fixtures';
import {evaluationModelOptions} from '../lib/model-options';
export type ContestLibraryRow={id:string;title:string;is_active:boolean;event_phase:string;schema_ready:boolean;schema_locked:boolean;configuration_frozen_at?:string|null;archived_at:string|null;schema_version:number;report_count:number;submission_count:number};
export function ContestLibrary({initialContests}:{initialContests:ContestLibraryRow[]}) {
  const router=useRouter();const writing=useRef(false);
  const [creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [title,setTitle]=useState(''),[template,setTemplate]=useState('binary'),[model,setModel]=useState<string>(evaluationModelOptions[0].id),[budget,setBudget]=useState(5);
  async function create() {
    if(writing.current)return;writing.current=true;setBusy(true);setMessage('');
    try {
      const source=template==='mixed'?mixedTemplate:twelveBinaryTemplate;
      const schema={...source,education:{version:1,pipeline:'structured-v1',evaluationMode:'simulation',systemPromptVersion:'clinical-extraction-v1',baselineInstructions:'Read the report and extract the requested findings.'}};
      const r=await fetch('/api/admin/contests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',title,schema,evaluationModel:model,practiceBudget:budget})});
      const b=await r.json();if(!r.ok)throw new Error(b.error||'Could not create draft.');
      router.push(`/admin/contests/${b.contestId}`);
    }catch(e){setMessage(e instanceof Error?e.message:'Could not create draft.');}finally{writing.current=false;setBusy(false);}
  }
  return <div className="space-y-5">
    <section className="rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Build or choose a contest</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Inspecting a contest never changes the active event. Duplicate a frozen contest to revise it.</p></div><button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white" onClick={()=>setCreating(!creating)} aria-expanded={creating}>{creating?'Close creation form':'Create new contest'}</button></div>
    {creating&&<form onSubmit={e=>{e.preventDefault();void create();}} className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-2"><label className="grid gap-1">Contest title<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} className="rounded border p-2"/></label>
      <label className="grid gap-1">Start from a template<select value={template} onChange={e=>setTemplate(e.target.value)} className="rounded border p-2"><option value="binary">Binary classification fields</option><option value="mixed">Mixed classification and measurement fields</option></select></label>
      <label className="grid gap-1">Fixed model<select value={model} onChange={e=>setModel(e.target.value)} className="min-w-0 rounded border p-2">{evaluationModelOptions.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
      <label className="grid gap-1">Public attempt budget<input type="number" min={1} max={100} required value={budget} onChange={e=>setBudget(Number(e.target.value))} className="rounded border p-2"/></label>
      <p className="text-sm text-slate-600 dark:text-slate-300 sm:col-span-2">New drafts are inactive and start in simulation. Choose their clinical fields, dataset, and evaluation settings in the Builder.</p><button disabled={busy} className="rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy?'Creating…':'Create inactive draft'}</button></form>}
      <p role="status" className="mt-3 text-sm">{message}</p>
    </section>
    <section aria-label="Stored contests" className="grid gap-4 lg:grid-cols-2">{initialContests.map(c=>{const frozen=Boolean(c.configuration_frozen_at||c.schema_locked||c.is_active);return <article key={c.id} className="min-w-0 rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex flex-wrap gap-2 text-xs font-semibold"><span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1">{frozen?'Frozen':'Draft'}</span><span className={`rounded px-2 py-1 ${c.is_active?'bg-teal-100 text-teal-900 dark:text-teal-300':'bg-slate-100 dark:bg-slate-800'}`}>{c.is_active?'Active':'Inactive'}</span>{c.archived_at&&<span>Archived</span>}</div>
      <h2 className="mt-3 break-words text-lg font-semibold">{c.title}</h2><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Version {c.schema_version} · {c.report_count} reports · {c.submission_count} submissions · {c.event_phase.replaceAll('_',' ')}</p>
      <div className="mt-4 flex flex-wrap gap-3"><Link className="rounded border px-3 py-2 font-semibold text-teal-800 dark:text-teal-300" href={`/admin/contests/${c.id}`}>{frozen||c.archived_at?'Inspect contest':'Continue setup'}</Link>{c.is_active&&<Link href="/admin" className="rounded bg-teal-800 px-3 py-2 font-semibold text-white">Run contest</Link>}</div>
    </article>;})}{!initialContests.length&&<p>No contests yet. Create an inactive draft to begin.</p>}</section>
  </div>;
}
