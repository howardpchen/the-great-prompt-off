"use client";
/** Snapshot is rendered with the active organizer console, not fetched at mutation time. */
export function adminFetch(input: RequestInfo | URL, init?: RequestInit) {
 const headers=new Headers(init?.headers);
 if(init?.method && !['GET','HEAD','OPTIONS'].includes(init.method.toUpperCase())) {
   const scope=document.querySelector<HTMLElement>('[data-active-contest]');
   if(scope) {headers.set('X-Contest-Id',scope.dataset.activeContest||'');headers.set('X-Contest-Version',scope.dataset.contestVersion||'');}
 }
 return globalThis.fetch(input,{...init,headers});
}
