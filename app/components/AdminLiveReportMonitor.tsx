"use client";

import { useEffect, useState } from "react";

type Snapshot = {
  queue:{active:number;waiting:number;effective:number};
  reports:{batches:{kind:string;total:number;processed:number;failed:number}[];processedSinceStart:number;failedSinceStart:number};
  updatedAt:string;
};

export function AdminLiveReportMonitor({contestId,schemaVersion}:{contestId:string;schemaVersion:number}) {
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let disposed=false;
    let controller:AbortController|null=null;
    async function refresh(){
      if(document.hidden || controller)return;
      controller=new AbortController();
      try {
        const response=await fetch("/api/admin/live-reports",{cache:"no-store",signal:controller.signal,headers:{"X-Contest-Id":contestId,"X-Contest-Version":String(schemaVersion)}});
        if(!response.ok)throw new Error(response.status===409?"Contest changed; reload this page.":"Live report counts are unavailable.");
        const next=await response.json() as Snapshot;
        if(!disposed){setSnapshot(next);setError("");}
      }catch(cause){if(!disposed && !(cause instanceof DOMException && cause.name==="AbortError"))setError(cause instanceof Error?cause.message:"Live report counts are unavailable.");}
      finally{controller=null;}
    }
    void refresh();
    const timer=window.setInterval(()=>void refresh(),2000);
    document.addEventListener("visibilitychange",refresh);
    return()=>{disposed=true;controller?.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[contestId,schemaVersion]);
  const batches=snapshot?.reports.batches ?? [];
  const outstanding=batches.reduce((sum,batch)=>sum+Math.max(0,batch.total-batch.processed-batch.failed),0);
  return <section aria-labelledby="live-report-heading" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 id="live-report-heading" className="text-lg font-semibold">Live report processing</h2><p className="text-sm text-slate-600 dark:text-slate-300">Updates about every 2 seconds while this tab is visible.</p></div><span className="text-xs text-slate-500 dark:text-slate-400">{snapshot?`Updated ${new Date(snapshot.updatedAt).toLocaleTimeString()}`:"Waiting for first update"}</span></div>
    {error?<p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">{error} Last known counts are shown below.</p>:null}
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Count label="Reports not yet processed" value={snapshot?outstanding:null}/><Count label="Waiting for LLM slot" value={snapshot?.queue.waiting ?? null}/><Count label="At LLM" value={snapshot?.queue.active ?? null}/><Count label="Reports processed" value={snapshot?.reports.processedSinceStart ?? null}/>
    </div>
    {batches.length?<div className="mt-4 space-y-2">{batches.map((batch,index)=><div key={`${batch.kind}-${index}`} className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-semibold capitalize">{batch.kind} run</span><span>{batch.processed} / {batch.total} processed{batch.failed?` · ${batch.failed} failed`:""}</span></div><progress className="mt-2 w-full accent-teal-700" value={batch.processed+batch.failed} max={Math.max(1,batch.total)} aria-label={`${batch.kind} run reports finished`} /></div>)}</div>:<p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{snapshot?"No report batches are active on this server process.":"Loading live report counts…"}</p>}
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Counts are for this server process and current contest. “Reports processed” is cumulative since the process started; retries can create more than one LLM request for a report. Saved final submissions waiting for the worker are not yet in the LLM queue.</p>
  </section>;
}

function Count({label,value}:{label:string;value:number|null}){return <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3"><div className="text-xs text-slate-600 dark:text-slate-300">{label}</div><div className="mt-1 text-2xl font-semibold tabular-nums">{value ?? "—"}</div></div>;}
