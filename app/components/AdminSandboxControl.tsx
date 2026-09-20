'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export function AdminSandboxControl({contestId,version,revision,enabled}:{contestId:string;version:number;revision:number;enabled:boolean}){
 const router=useRouter(),writing=useRef(false);const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function toggle(){if(writing.current)return;writing.current=true;setBusy(true);setMessage('');
  try{const r=await fetch('/api/admin/contests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'sandbox',contestId,expectedVersion:version,expectedRevision:revision,sandboxEnabled:!enabled})});const b=await r.json();if(!r.ok)throw new Error(b.error||'Could not change Sandbox availability.');router.refresh();setMessage('Saved. Sample selection and evaluation rules are unchanged.');}catch(e){setMessage(e instanceof Error?e.message:'Request failed.');}finally{writing.current=false;setBusy(false);}}
 return <section className="space-y-3 rounded-lg border bg-white dark:bg-slate-900 p-5 shadow-sm"><h2 className="text-xl font-semibold">Sandbox availability</h2><p className="text-sm">{enabled?'Enabled during open practice':'Paused'} · Sample selection and cooldown rules remain frozen.</p><button disabled={busy} onClick={()=>void toggle()} className="rounded border px-3 py-2 text-sm font-semibold text-teal-800 dark:text-teal-300 disabled:opacity-50">{busy?'Saving…':enabled?'Pause Sandbox':'Enable Sandbox'}</button><p role="status" className="text-sm">{message}</p></section>;
}
