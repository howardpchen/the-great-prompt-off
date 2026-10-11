import { submissionProgressMessage, type PublicSubmissionReceipt } from "./submission-progress-types";

type PendingPublicSubmission = {requestId:string;storageKey:string;createdAt:number};
type Options = {
  participantCode:string;participantToken:string;contestId:string;
  signal?:AbortSignal;onProgress:(message:string)=>void;
};

function pendingKey(contestId:string,participantCode:string) {return `gpo-pending-public:${contestId}:${participantCode}`;}
function read(key:string) {try{return window.localStorage.getItem(key);}catch{return null;}}
function write(key:string,value:string) {try{window.localStorage.setItem(key,value);}catch{/* Private browsing may disable storage. */}}
function remove(key:string) {try{window.localStorage.removeItem(key);}catch{/* Keep evaluation independent of browser storage. */}}

export function pendingPublicSubmission(contestId:string,participantCode:string):PendingPublicSubmission|null {
  try {
    const value=JSON.parse(read(pendingKey(contestId,participantCode)) ?? "null");
    return value && typeof value.requestId==="string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value.requestId)
      && typeof value.storageKey==="string" && Number.isFinite(value.createdAt) ? value : null;
  } catch{return null;}
}

function clearPending(options:Options,pending:PendingPublicSubmission) {
  // Another tab may already have started a newer request.
  if(pendingPublicSubmission(options.contestId,options.participantCode)?.requestId===pending.requestId) {
    remove(pendingKey(options.contestId,options.participantCode));
  }
  remove(pending.storageKey);
}

async function pause(ms:number,signal?:AbortSignal) {
  signal?.throwIfAborted();
  await new Promise<void>((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(new DOMException("Cancelled","AbortError"));};
    const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},ms);
    signal?.addEventListener("abort",abort,{once:true});
  });
}

export async function waitForPublicSubmission<T>(pending:PendingPublicSubmission,options:Options):Promise<{score:T;instructions?:string}> {
  let missingSince:number|null=null;
  for(;;) {
    options.signal?.throwIfAborted();
    if(Date.now()-pending.createdAt>30*60*1000) throw new Error("We could not confirm completion. Ask the organizer to check this submission before trying again.");
    let receipt:PublicSubmissionReceipt<T>;
    let response:Response;
    try {
      response=await fetch(`/api/submissions/public/progress?contestId=${encodeURIComponent(options.contestId)}&requestId=${encodeURIComponent(pending.requestId)}`,{
        cache:"no-store",headers:{Authorization:`Bearer ${options.participantToken}`},signal:options.signal,
      });
      if(response.status===401 || response.status===403) throw new SessionExpired();
      if(response.status===404) {
        missingSince ??= Date.now();
        if(Date.now()-missingSince>30000) throw new NotReceived();
        options.onProgress("Confirming receipt of your submission. Please wait; do not submit again.");
        await pause(2000,options.signal);continue;
      }
      if(!response.ok) throw new Error("Connection unavailable");
      receipt=await response.json();
    } catch(error) {
      if(error instanceof SessionExpired) throw new Error("Sign in again to reconnect to your submission. Do not submit a new attempt.");
      if(error instanceof NotReceived) throw new Error("The submission receipt could not be found. Ask the organizer to check before submitting again.");
      options.signal?.throwIfAborted();
      options.onProgress("Connection interrupted. Reconnecting to your saved submission automatically; please wait and do not submit again.");
      await pause(5000,options.signal);continue;
    }
    if(receipt.state==="completed" && receipt.result) {
      clearPending(options,pending);
      return {score:receipt.result,instructions:receipt.instructions};
    }
    if(receipt.state==="failed") {
      clearPending(options,pending);
      throw new Error(receipt.error || "Evaluation could not finish. No test attempt was used. Please try again later.");
    }
    if(receipt.state==="stalled") throw new Error(receipt.error || "Ask the organizer to check this submission before trying again.");
    options.onProgress(submissionProgressMessage(receipt));
    await pause(2000,options.signal);
  }
}
class SessionExpired extends Error {}
class NotReceived extends Error {}

export async function submitPublicWithProgress<T>(options:Options & {prompt:string;schemaVersion:number}):Promise<{score:T;instructions?:string}> {
  const existing=pendingPublicSubmission(options.contestId,options.participantCode);
  if(existing) return waitForPublicSubmission<T>(existing,options);
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(options.prompt)))).map(x=>x.toString(16).padStart(2,"0")).join("");
  const storageKey=`gpo-request:${options.contestId}:${options.participantCode}:/api/submissions/public:${digest}`;
  const pending={requestId:read(storageKey) || crypto.randomUUID(),storageKey,createdAt:Date.now()};
  write(storageKey,pending.requestId);
  write(pendingKey(options.contestId,options.participantCode),JSON.stringify(pending));
  let response:Response;
  try {
    response=await fetch("/api/submissions/public",{method:"POST",signal:options.signal,
      headers:{"Content-Type":"application/json","Idempotency-Key":pending.requestId,Prefer:"respond-async"},
      body:JSON.stringify({participantCode:options.participantCode,participantToken:options.participantToken,prompt:options.prompt,contestId:options.contestId,schemaVersion:options.schemaVersion}),
    });
  } catch {
    options.signal?.throwIfAborted();
    // The response may have been lost AFTER admission. Poll the same key, never
    // create another attempt or automatically replay the entire report batch.
    options.onProgress("Confirming your saved submission. Please wait; do not submit again.");
    return waitForPublicSubmission<T>(pending,options);
  }
  const body=await response.json().catch(()=>null);
  if(!response.ok) {
    if(response.status<500 && response.status!==429) {clearPending(options,pending);throw new Error(body?.error || "Submission was not accepted.");}
    return waitForPublicSubmission<T>(pending,options);
  }
  if(body?.state==="completed" && body.result) {clearPending(options,pending);return {score:body.result,instructions:options.prompt};}
  // Compatibility with older servers/local synthetic fixtures.
  if(body?.source && response.status!==202) {clearPending(options,pending);return {score:body as T,instructions:options.prompt};}
  options.onProgress(submissionProgressMessage({state:"queued"}));
  return waitForPublicSubmission<T>(pending,options);
}
