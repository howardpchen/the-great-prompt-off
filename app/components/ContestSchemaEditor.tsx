'use client';
import Link from 'next/link';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ChallengeFieldDefinition,ChallengeModeDefinition} from '../lib/challenge-modes';
import {evaluationModelOptions} from '../lib/model-options';
import {ContestConfigurationSummary,isFrozenContest,type ContestAdminState} from './ContestConfigurationSummary';

const button='rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950 disabled:opacity-50';
const input='min-w-0 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm';
const steps=['Basics','Findings','Dataset','Exercise rules','Review & activate'];
export function ContestSchemaEditor({initialState}:{initialState:ContestAdminState}) {
  const router=useRouter();const writing=useRef(false);
  const [state,setState]=useState(initialState),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[step,setStep]=useState(0),[dirty,setDirty]=useState(false),[settingsDirty,setSettingsDirty]=useState(false),[sandboxDirty,setSandboxDirty]=useState(false);
  const [reports,setReports]=useState(''),[answers,setAnswers]=useState(''),[sampleIds,setSampleIds]=useState<string[]>([]),[referenceAccepted,setReferenceAccepted]=useState(false);
  const [reportEdit,setReportEdit]=useState<{id:string;filename:string;split:string;report_text:string}|null>(null);
  const unsaved=dirty||settingsDirty||sandboxDirty||!!reportEdit;
  const editable=!isFrozenContest(state)&&!state.archivedAt;
  function schema(patch:Partial<ChallengeModeDefinition>){setState({...state,schema:{...state.schema,...patch}});setDirty(true);setReferenceAccepted(false);}
  function field(index:number,patch:Partial<ChallengeFieldDefinition>){schema({fields:state.schema.fields.map((f,i)=>i===index?{...f,...patch}:f)});}
  async function reload(){
    const r=await fetch(`/api/admin/contest-schema?contestId=${encodeURIComponent(state.contestId)}&includeReports=true`);const b=await r.json();
    if(!r.ok||b.contestId!==state.contestId)throw new Error(b.error||'Contest response mismatch. Reload this page.');
    setState(b);setDirty(false);setSettingsDirty(false);setSandboxDirty(false);setSampleIds([]);setReportEdit(null);setReferenceAccepted(false);
  }
  async function reloadFromButton(){
    if(writing.current)return;
    if(unsaved&&!window.confirm('Discard unsaved edits and reload this contest?'))return;
    writing.current=true;setBusy(true);setMessage('');
    try{await reload();}catch(e){setMessage(e instanceof Error?e.message:'Reload failed.');}finally{writing.current=false;setBusy(false);}
  }
  async function act(action:string,library=false,extra:Record<string,unknown>={}){
    if(writing.current)return;
    writing.current=true;setBusy(true);setMessage('');
    try{
      const payload={action,contestId:state.contestId,expectedVersion:state.schema.version,expectedRevision:state.revision,...extra};
      const r=await fetch(library?'/api/admin/contests':'/api/admin/contest-schema',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const b=await r.json();if(!r.ok)throw new Error(b.error||'Operation failed.');
      if(action==='fork'){router.push(`/admin/contests/${b.contestId}`);return;}
      if(action==='activate'){router.push('/admin');router.refresh();return;}
      await reload();setMessage('Saved. The current event and its history are preserved.');
    }catch(e){setMessage(e instanceof Error?e.message:'Operation failed.');}
    finally{writing.current=false;setBusy(false);}
  }
  function importJson(action:'reports'|'answers',raw:string){
    try{const data:unknown=JSON.parse(raw);if(!Array.isArray(data))throw new Error('Import must be a JSON array.');void act(action,false,{[action]:data});}catch(e){setMessage(e instanceof Error?e.message:'Invalid JSON.');}
  }
  const sampleCount=sampleIds.length||state.sandboxSamples?.length||0;
  const canActivate=state.ready&&!unsaved&&!state.isActive&&!state.archivedAt&&(!state.sandboxEnabled||sampleCount===3)&&referenceAccepted;
  return <div className="space-y-5">
    <ContestConfigurationSummary state={state}/>
    <div className="flex flex-wrap gap-3 rounded-xl border bg-white dark:bg-slate-900 p-4">
      <button disabled={busy||unsaved} className={button} onClick={()=>{if(window.confirm('Copy configuration, reports and current reference answers into an inactive editable draft? Scores, grants, and run history will not be copied.'))void act('fork');}}>Duplicate as new draft</button>
      {state.isActive&&<Link href="/admin" className={button}>Open Run dashboard</Link>}
      {!state.isActive&&!state.archivedAt&&<button disabled={busy||unsaved} className={button} onClick={()=>{if(window.confirm('Archive this inactive contest without deleting any reports, references or history?'))void act('archive',true);}}>Archive contest</button>}
      <Link className={button} href="/admin/contests">Back to Contest Library</Link><button className={button} disabled={busy} onClick={()=>void reloadFromButton()}>Reload contest</button>
    </div>
    {editable&&<section aria-label="Contest Builder" className="space-y-5 rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div><h2 className="text-2xl font-semibold">Contest Builder</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Draft only. Prepare the evaluation contract here; run the event from the Run dashboard after activation.</p></div>
      <nav aria-label="Setup steps" className="flex flex-wrap gap-2">{steps.map((label,i)=><button key={label} disabled={busy||(unsaved&&step!==i)} className={`${button} ${step===i?'!bg-teal-800 !text-white':''}`} aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}>{i+1}. {label}</button>)}</nav>
      {unsaved&&<p role="status" className="rounded bg-amber-50 dark:bg-amber-950 p-3 text-sm">Unsaved configuration changes. Save them before imports, changing settings, or activation.</p>}
      <fieldset disabled={busy} className="min-w-0 space-y-4">
      {step===0&&<div className="space-y-4">
        <label className="grid gap-1 font-semibold">Contest title<input className={input} value={state.schema.title} onChange={e=>schema({title:e.target.value})}/></label>
        <label className="grid gap-1 font-semibold">Organizer description<textarea aria-label="Organizer description" className={input} rows={3} value={state.schema.description||''} onChange={e=>schema({description:e.target.value})}/></label>
        <label className="flex gap-2"><input type="checkbox" checked={!!state.schema.education} onChange={e=>schema({education:e.target.checked?{version:1,pipeline:'structured-v1',evaluationMode:'simulation',systemPromptVersion:'clinical-extraction-v1',baselineInstructions:'Read the report and extract the requested findings.'}:undefined})}/>Challenge mode</label>
        <p className="text-sm text-slate-600 dark:text-slate-300">Attempts, results, and final submission limits belong to each participant account. Team membership and collaborative editing are not supported in this version.</p>
        {state.schema.education&&<>
          <label className="grid gap-1 font-semibold">Default participant instructions<textarea aria-label="Default participant instructions" rows={5} className={input} value={state.schema.education.baselineInstructions} onChange={e=>schema({education:{...state.schema.education!,baselineInstructions:e.target.value}})}/></label>
          <label className="grid gap-1 font-semibold">System contract<select className={input} value={state.schema.education.systemPromptVersion||'historical'} onChange={e=>schema({education:{...state.schema.education!,systemPromptVersion:e.target.value==='historical'?undefined:'clinical-extraction-v1'}})}><option value="historical">Historical extraction contract</option><option value="clinical-extraction-v1">Clinical extraction v1</option></select></label>
          <label className="grid gap-1 font-semibold">Evaluation mode<select className={input} value={state.schema.education.evaluationMode||'simulation'} onChange={e=>schema({education:{...state.schema.education!,evaluationMode:e.target.value as 'simulation'|'real'}})}><option value="simulation">Simulation — workflow rehearsal</option><option value="real">Real model — participant runs may incur charges</option></select></label>
        </>}
      </div>}
      {step===1&&<div className="space-y-4"><p className="text-sm">Define the extraction fields and their scoring vocabulary. Clinical definitions are organizer reference material, not automatically included in the system prompt.</p>
        {state.schema.fields.map((f,i)=><fieldset key={i} className="grid min-w-0 gap-3 rounded-lg border p-4 sm:grid-cols-2"><legend className="px-2 font-semibold">Finding {i+1}</legend>
          <label className="grid gap-1 text-sm">Field key<input className={input} value={f.key} onChange={e=>field(i,{key:e.target.value,aliases:[]})}/></label>
          <label className="grid gap-1 text-sm">Display name<input className={input} value={f.label} onChange={e=>field(i,{label:e.target.value})}/></label>
          <label className="grid gap-1 text-sm">Type<select className={input} value={f.type||'multiclass'} onChange={e=>field(i,{type:e.target.value as ChallengeFieldDefinition['type'],allowedValues:e.target.value==='number'?[]:['present','absent'],...(e.target.value==='number'?{unit:'mm',tolerance:0}:{})})}><option value="binary">Binary</option><option value="multiclass">Multiclass</option><option value="number">Measurement</option></select></label>
          <label className="grid gap-1 text-sm">Scoring weight<input className={input} type="number" min={0.001} max={100} step="any" value={f.weight??1} onChange={e=>field(i,{weight:Number(e.target.value)})}/></label>
          <label className="grid gap-1 text-sm sm:col-span-2">Clinical definition<textarea aria-label="Clinical definition" className={input} value={f.description||''} onChange={e=>field(i,{description:e.target.value})}/></label>
          {f.type==='number'?<><label className="grid gap-1 text-sm">Unit<input className={input} value={f.unit||''} onChange={e=>field(i,{unit:e.target.value})}/></label><label className="grid gap-1 text-sm">Absolute tolerance<input className={input} type="number" min={0} step="any" value={f.tolerance??0} onChange={e=>field(i,{tolerance:Number(e.target.value)})}/></label>{(['minimum','maximum'] as const).map(k=><label key={k} className="grid gap-1 text-sm">{k}<input className={input} type="number" step="any" value={f[k]??''} onChange={e=>field(i,{[k]:e.target.value===''?undefined:Number(e.target.value)})}/></label>)}</>:<label className="grid gap-1 text-sm sm:col-span-2">Allowed values (comma-separated)<input className={input} value={f.allowedValues.join(',')} onChange={e=>field(i,{allowedValues:e.target.value.split(',').map(v=>v.trim())})}/></label>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={!!f.nullable} onChange={e=>field(i,{nullable:e.target.checked})}/>Allow clinical null (not a no-decision result)</label>
          <button className={button} onClick={()=>schema({fields:state.schema.fields.filter((_,n)=>n!==i)})}>Remove finding {i+1}</button>
        </fieldset>)}
        <button className={button} disabled={state.schema.fields.length>=64} onClick={()=>schema({fields:[...state.schema.fields,{key:`field_${state.schema.fields.length+1}`,label:'New finding',type:'binary',allowedValues:['present','absent'],weight:1}]})}>Add finding</button>
      </div>}
      {(step===0||step===1)&&<div className="border-t pt-4"><button className={button} disabled={!dirty||settingsDirty||sandboxDirty} onClick={()=>void act('schema',false,{schema:state.schema})}>Save draft configuration</button><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Saving creates a schema revision and requires reference-answer revalidation. Prior answers remain preserved.</p></div>}
      {step===2&&<div className="space-y-5">
        {!state.reports.length&&!state.sandboxSamples?.length?<div className="space-y-2"><label className="grid gap-1 font-semibold">Reports JSON<textarea rows={6} className={`${input} font-mono`} value={reports} onChange={e=>setReports(e.target.value)}/></label><p className="text-sm">Array of external_id, filename, split (public/private), and report_text. Select Sandbox samples later from the held-out set.</p><button className={button} disabled={unsaved||!reports.trim()} onClick={()=>importJson('reports',reports)}>Import reports</button></div>:<p className="rounded bg-slate-50 dark:bg-slate-950 p-3 text-sm">Reports are already loaded. Bulk import is only available for an empty draft. Inspect their inventory above.</p>}
        {!!state.reportDetails?.length&&<div className="space-y-3 rounded border p-4"><h3 className="font-semibold">Edit a draft report</h3><p className="text-sm">Editing clears readiness. Review and reimport references before activation; clinician-adjudicated keys require a new schema revision before replacement.</p><label className="grid gap-1 text-sm">Select draft report<select className={input} value={reportEdit?.id||''} disabled={unsaved&&!reportEdit} onChange={e=>{const selected=state.reportDetails?.find(r=>r.id===e.target.value);if(selected)setReportEdit({...selected});}}><option value="">Choose report</option>{state.reportDetails.map(r=><option key={r.id} value={r.id}>{r.filename} ({r.split})</option>)}</select></label>
          {reportEdit&&<><label className="grid gap-1 text-sm">Report filename<input className={input} value={reportEdit.filename} onChange={e=>setReportEdit({...reportEdit,filename:e.target.value})}/></label><label className="grid gap-1 text-sm">Report partition<select className={input} value={reportEdit.split} onChange={e=>setReportEdit({...reportEdit,split:e.target.value})}><option value="public">Public</option><option value="private">Hidden</option><option value="sample">Sandbox</option></select></label><label className="grid gap-1 text-sm">Report text<textarea aria-label="Report text" rows={8} className={input} value={reportEdit.report_text} onChange={e=>setReportEdit({...reportEdit,report_text:e.target.value})}/></label><div className="flex gap-2"><button className={button} onClick={()=>void act('report',false,{report:reportEdit})}>Save draft report</button><button className={button} onClick={()=>setReportEdit(null)}>Cancel report edit</button></div></>}
        </div>}
        <div className="space-y-2"><label className="grid gap-1 font-semibold">Reference answers JSON<textarea rows={6} className={`${input} font-mono`} value={answers} onChange={e=>setAnswers(e.target.value)}/></label><p className="text-sm">Array of report_id_or_filename and answer_values. Supply every scored report; validation checks vocabulary and coverage, not clinical correctness.</p><button className={button} disabled={unsaved||!answers.trim()} onClick={()=>importJson('answers',answers)}>Validate and import answers</button></div>
      </div>}
      {step===3&&<div className="space-y-6">
        <div className="space-y-3"><label className="grid gap-1 font-semibold">Fixed evaluation model<select className={input} value={state.evaluationModel||''} onChange={e=>{setState({...state,evaluationModel:e.target.value});setSettingsDirty(true);setReferenceAccepted(false);}}><option value="" disabled>Select model</option>{evaluationModelOptions.map(m=><option key={m.id} value={m.id}>{m.id}</option>)}</select></label>
        <label className="grid gap-1 font-semibold">Public attempt budget<input className={input} type="number" min={1} max={100} value={state.practiceBudget} onChange={e=>{setState({...state,practiceBudget:Number(e.target.value)});setSettingsDirty(true);setReferenceAccepted(false);}}/></label>
        <p className="text-sm">Final evaluation: {state.finalBudget??1} locked submission per participant.</p><button className={button} disabled={dirty||sandboxDirty} onClick={()=>void act('settings',true,{evaluationModel:state.evaluationModel,practiceBudget:state.practiceBudget})}>Save model and budget</button></div>
        {state.schema.education&&<div className="space-y-3 border-t pt-4"><h3 className="font-semibold">Sandbox</h3><p className="text-sm">Three editable samples. One run at a time per participant; 60-second cooldown after completion. Samples must be selected before any runs.</p>
          <label className="flex gap-2"><input type="checkbox" checked={!!state.sandboxEnabled} onChange={e=>{setState({...state,sandboxEnabled:e.target.checked});setSandboxDirty(true);setReferenceAccepted(false);}}/>Enable Sandbox during open practice</label>
          <p className="text-sm">Current samples: {state.sandboxSamples?.map(r=>r.filename).join(', ')||'None'}</p>
          <details className="rounded border p-3"><summary>Choose three held-out samples</summary><div className="mt-3 max-h-60 space-y-2 overflow-auto">{[...(state.sandboxSamples||[]),...state.reports.filter(r=>r.split==='private')].map(r=><label key={r.id} className="flex gap-2 text-sm"><input type="checkbox" checked={sampleIds.includes(r.id)} onChange={e=>{setSampleIds(e.target.checked?[...sampleIds,r.id]:sampleIds.filter(id=>id!==r.id));setSandboxDirty(true);setReferenceAccepted(false);}}/><span className="break-words">{r.filename}</span></label>)}</div><p className="mt-2 text-sm">{sampleIds.length} selected</p></details>
          <button className={button} disabled={dirty||settingsDirty||(sampleIds.length>0&&sampleIds.length!==3)} onClick={()=>void act('sandbox',true,{sandboxEnabled:!!state.sandboxEnabled,...(sampleIds.length?{sampleIds}:{})})}>Save Sandbox setup</button>
        </div>}
      </div>}
      </fieldset>
      {step===4&&<p className="text-sm text-slate-600 dark:text-slate-300">Inspect the configuration summary above, then complete the activation checklist below.</p>}
    </section>}
    {!state.isActive&&!state.archivedAt&&(!editable||step===4)&&<section aria-label="Activation review" className="space-y-4 rounded-xl border bg-white dark:bg-slate-900 p-5"><h2 className="text-xl font-semibold">{isFrozenContest(state)?'Reactivate frozen contest':'Review and activate'}</h2>
      <ul className="list-inside list-disc space-y-1 text-sm"><li>{state.ready?'Report and reference structure validated':'Reference coverage is not ready'}</li><li>{state.reports.filter(r=>r.split==='public').length} public / {state.reports.filter(r=>r.split==='private').length} hidden reports</li><li>Fixed model: {state.evaluationModel||'Not set'}</li><li>First activation permanently freezes evaluation settings. Submissions start paused.</li></ul>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={referenceAccepted} onChange={e=>setReferenceAccepted(e.target.checked)}/>I have reviewed the clinical references, report split, model, baseline, and scoring settings for this version.</label>
      <button className={button} disabled={busy||!canActivate} onClick={()=>{if(window.confirm('Activate this contest and freeze evaluation settings? The previous contest and scores remain stored. Submissions will be paused.'))void act('activate',true);}}>Activate contest (paused)</button>
    </section>}
    <details className="rounded-xl border bg-white dark:bg-slate-900 p-5"><summary className="cursor-pointer font-semibold">Inspect reports and current references</summary><p className="my-3 text-sm">Read-only data for this selected contest, not necessarily the active event. Reference validation checks structure, not clinical correctness.</p><div className="max-h-[36rem] space-y-3 overflow-auto">{state.reportDetails?.map(r=><details key={r.id} className="rounded border p-3"><summary className="cursor-pointer break-words font-semibold">{r.filename} · {r.split}</summary><p className="my-3 whitespace-pre-wrap break-words text-sm">{r.report_text}</p><p className="text-xs text-slate-600 dark:text-slate-300">Reference provenance: {r.provenance||'No current reference'}</p>{r.answer_values&&<dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(r.answer_values).map(([k,v])=><div key={k} className="min-w-0"><dt className="break-words font-semibold">{state.schema.fields.find(f=>f.key===k)?.label||k}</dt><dd className="break-words">{v===null?'null':String(v)}</dd></div>)}</dl>}</details>)}</div></details>
    <details className="rounded-xl border bg-white dark:bg-slate-900 p-5"><summary className="cursor-pointer font-semibold">Contest submission history</summary>{state.history?.length?<div className="mt-3 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Participant</th><th>Type</th><th>Attempt</th><th>Score</th></tr></thead><tbody>{state.history.map((h,i)=><tr key={i}><td>{h.participant_code}</td><td>{h.submission_type}</td><td>{h.attempt_number}</td><td>{h.score}</td></tr>)}</tbody></table></div>:<p className="mt-3 text-sm">No submissions for this contest.</p>}</details>
    <p role="status" className="whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{message}</p>
  </div>;
}
