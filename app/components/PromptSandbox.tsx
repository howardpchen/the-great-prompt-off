"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import type {ChallengeFieldDefinition} from '../lib/challenge-modes';
type Report={id:string;text:string};
type Result={reportId:string;status:string;error?:string;decisions?:Record<string,{status:string;value:string|number|null}>};
type State={enabled:boolean;reports:Report[];inFlight:boolean;cooldownUntil:string|null;serverTime:string;job:{id:string;schema_version:number;reports:Report[];prompt:string;results:Result[];status:string;simulation:boolean}|null};
export function PromptSandbox({token,participantId,contestId,version,prompt,fields}:{participantId:string;token:string;contestId:string;version:number;prompt:string;fields:readonly ChallengeFieldDefinition[]}){
 const [state,setState]=useState<State|null>(null),[reports,setReports]=useState<Report[]>([]),[selected,setSelected]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[now,setNow]=useState(0),[previous,setPrevious]=useState<Result[]>([]);
 const abort=useRef<AbortController|null>(null),submission=useRef<{hash:string;key:string}|null>(null),dirty=useRef(false),mounted=useRef(true);
 const [clockOffset,setClockOffset]=useState(0);
 const draftKey=`gpo-sandbox:${contestId}:${version}:${participantId}`;
 const refresh=useCallback(async()=>{
  if(!token)return;
  const response=await fetch(`/api/sandbox?contestId=${encodeURIComponent(contestId)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!response.ok)throw new Error('Sandbox unavailable; refresh your participant session if needed.');
  const data:State=await response.json();if(!mounted.current)return;
  setClockOffset(Date.parse(data.serverTime)-Date.now());setNow(Date.now());setState(data);
  if(!dirty.current){let saved:Report[]|null=null;try{saved=JSON.parse(localStorage.getItem(draftKey)||'null');}catch{}
   if(Array.isArray(saved) && saved.length===3 && saved.every(r=>typeof r.text==='string' && data.reports.some(s=>s.id===r.id)) && new Set(saved.map(r=>r.id)).size===3){setReports(saved);dirty.current=true;}else setReports(data.reports);
  }
 },[token,contestId,draftKey]);
 useEffect(()=>{mounted.current=true;void refresh().catch(()=>{});const tick=setInterval(()=>{setNow(Date.now());},1000);const poll=setInterval(()=>{void refresh().catch(()=>{});},3000);return()=>{mounted.current=false;clearInterval(tick);clearInterval(poll);abort.current?.abort();};},[refresh]);
 const remaining=Math.max(0,Math.ceil(((state?.cooldownUntil?Date.parse(state.cooldownUntil):0)-now-clockOffset)/1000));
 function edit(text:string){dirty.current=true;const next=reports.map((r,i)=>i===selected?{...r,text}:r);setReports(next);try{localStorage.setItem(draftKey,JSON.stringify(next));}catch{setMessage('Browser storage unavailable; keep this page open to retain report edits.');}}
 async function run(){
  if(busy)return;
  setBusy(true);setMessage('Queued. Results appear as each report finishes.');setPrevious(state?.job?.results||[]);
  const hash=JSON.stringify({prompt,reports,contestId,version});if(submission.current?.hash!==hash)submission.current={hash,key:crypto.randomUUID()};
  const controller=new AbortController();abort.current=controller;
  try{
   const response=await fetch('/api/sandbox',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({contestId,schemaVersion:version,prompt,reports,idempotencyKey:submission.current.key})});
   if(!response.ok){const b=await response.json();throw new Error(b.error||'Sandbox run failed.');}
   if(response.headers.get('content-type')?.includes('application/x-ndjson')){
    const reader=response.body!.getReader(),decoder=new TextDecoder();let pending='';
    while(true){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});const lines=pending.split('\n');pending=lines.pop()||'';for(const line of lines){if(!line)continue;const event=JSON.parse(line);if(event.reportId || event.jobId)await refresh();}}
   }
   await refresh();submission.current=null;setMessage('Run finished. Wait 60 seconds before the next run.');
  }catch(e){setMessage(e instanceof Error?e.message:'Run interrupted.');await refresh().catch(()=>{});}
  finally{setBusy(false);abort.current=null;}
 }
 if(!state)return null;
 const current=reports[selected];const result=state.job?.results.find(r=>r.reportId===current?.id);const old=previous.find(r=>r.reportId===current?.id);
 return <section className="min-w-0 rounded-xl border border-teal-200 bg-white p-4 sm:p-6" aria-label="Prompt Sandbox">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold text-slate-950">Sandbox</h2><p className="mt-1 text-sm text-slate-600">Debug your prompt on three editable samples. Unlimited total runs; no leaderboard or attempt budget impact.</p></div><span className="rounded bg-teal-50 px-3 py-1 text-sm text-teal-800">Unscored</span></header>
  {!state.enabled?<p className="mt-3 text-sm">Sandbox is paused or not configured. Your organizer can enable it during practice.</p>:<>
   <p className="my-3 text-sm text-slate-600">Uses the prompt editor above and the same fixed model. Only your sandbox copies change; original reports stay intact. Feedback is model predictions, not an answer-key score.</p>
   <div className="mb-3 flex flex-wrap gap-2">{reports.map((r,i)=><button key={r.id} aria-pressed={i===selected} className={`rounded border px-3 py-2 ${i===selected?'bg-teal-800 text-white':'text-slate-800'}`} onClick={()=>setSelected(i)}>Sample {i+1}</button>)}</div>
   {current && <div className="grid min-w-0 gap-4 lg:grid-cols-2"><div><label htmlFor="sandbox-report" className="font-medium text-slate-900">Editable sample {selected+1}</label><textarea id="sandbox-report" value={current.text} maxLength={30000} disabled={busy||state.inFlight} onChange={e=>edit(e.target.value)} className="mt-2 min-h-64 w-full rounded border border-slate-300 p-3 text-sm text-slate-900"/><button disabled={busy||state.inFlight} className="text-sm underline" onClick={()=>edit(state.reports.find(r=>r.id===current.id)?.text||'')}>Reset this sample</button></div>
   <div className="min-w-0"><h3 className="font-medium text-slate-900">Latest predictions</h3>{state.job?.simulation && <p className="text-sm text-amber-800">Simulation: synthetic “no decision” outputs; no model called.</p>}
    {state.job && (state.job.schema_version!==version || state.job.prompt!==prompt || JSON.stringify(state.job.reports.slice().sort((a,b)=>a.id.localeCompare(b.id)))!==JSON.stringify(reports.slice().sort((a,b)=>a.id.localeCompare(b.id)))) && <p className="text-sm text-amber-800">Results belong to an earlier schema, prompt or sample draft.</p>}
    {!result?<p className="mt-2 text-sm text-slate-600">{state.inFlight?'Queued or running…':'Run the sandbox to see predictions.'}</p>:result.error?<p role="alert">{result.error}</p>:<dl className="mt-2 divide-y divide-slate-100">{fields.map(f=>{const d=result.decisions?.[f.key],prior=old?.decisions?.[f.key];return <div key={f.key} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><dt>{f.label}</dt><dd className="break-words font-medium">{d?.status==='decision'?String(d.value):'No decision'}{prior&&JSON.stringify(prior)!==JSON.stringify(d)&&<span className="ml-2 text-xs text-teal-700">changed</span>}</dd></div>;})}</dl>}
   </div></div>}
   <div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={()=>void run()} disabled={busy||state.inFlight||remaining>0||!prompt.trim()||prompt.length>12000||reports.length!==3||reports.some(r=>!r.text.trim())} className="rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy||state.inFlight?'Sandbox running…':remaining?`Ready in ${remaining}s`:'Run sandbox · 3 reports'}</button><span className="text-sm text-slate-600">60-second cooldown after completion. Scored submissions remain separate.</span></div>
  </>}
  <p role="status" aria-live="polite" className="mt-3 text-sm text-slate-700">{message}</p>
 </section>;
}
