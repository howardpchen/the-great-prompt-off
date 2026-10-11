"use client";
import {useEffect,useState} from "react";

export function ParticipantDisplayName({token,participantCode,onSaved}:{token:string;participantCode:string;onSaved:()=>void}) {
  const [name,setName]=useState("");
  const [draft,setDraft]=useState("");
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/participants/profile',{headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
      .then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error);return data;})
      .then(data=>{if(!controller.signal.aborted){setName(data.displayName||"");setDraft(data.displayName||"");}})
      .catch(()=>{if(!controller.signal.aborted)setMessage("Could not load your display name. You can try saving a new name.");});
    return ()=>controller.abort();
  },[token]);
  async function save(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setBusy(true);setMessage("");
    try {
      const r=await fetch('/api/participants/profile',{method:'PATCH',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({displayName:draft})});
      const data=await r.json();if(!r.ok)throw Error(data.error||"Could not save your display name.");
      setName(data.displayName);setDraft(data.displayName);setEditing(false);setMessage("Display name saved.");onSaved();
    } catch(error){setMessage(error instanceof Error?error.message:"Could not save your display name. Please try again.");}
    finally{setBusy(false);}
  }
  return <section aria-label="Your display name" className="min-w-0 max-w-sm rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
    <p className="text-xs text-slate-500 dark:text-slate-400">Current participant · {participantCode}</p>
    {editing?<form onSubmit={save} className="mt-2 space-y-2">
      <label className="block text-sm font-semibold" htmlFor="participant-display-name">Display Name</label>
      <input id="participant-display-name" value={draft} onChange={e=>setDraft(e.target.value)} maxLength={80} required disabled={busy} autoFocus className="w-full min-w-0 rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-950" aria-describedby="display-name-help"/>
      <p id="display-name-help" className="text-xs text-slate-500 dark:text-slate-400">Shown to others on the leaderboard. Use a name or nickname, up to 80 characters.</p>
      <div className="flex gap-3"><button disabled={busy||!draft.trim()} className="rounded bg-teal-700 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50" type="submit">{busy?"Saving…":"Save name"}</button><button disabled={busy} type="button" onClick={()=>{setDraft(name);setEditing(false);setMessage("");}} className="text-sm underline">Cancel</button></div>
    </form>:<div className="mt-1 flex flex-wrap items-center gap-3"><p className="min-w-0 break-all text-sm font-semibold">{name||participantCode}</p><button type="button" onClick={()=>{setDraft(name);setEditing(true);setMessage("");}} className="text-sm font-semibold text-teal-700 underline dark:text-teal-300">Change display name</button></div>}
    <p role="status" className="mt-1 text-xs">{message}</p>
  </section>;
}
