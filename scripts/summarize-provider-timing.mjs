import fs from 'node:fs';
const input=fs.readFileSync(process.argv[2]||0,'utf8');
const events=input.split('\n').flatMap(line=>{try{const at=line.indexOf('{');const e=JSON.parse(line.slice(at));return e.metric==='prompt_off_provider'?[e]:[];}catch{return [];}});
const quantile=(values,q)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*q)-1)]:null;
const batches=[...new Set(events.map(e=>e.batchId).filter(Boolean))].map(batchId=>{
 const rows=events.filter(e=>e.batchId===batchId),start=rows.find(e=>e.event==='batch_start'),end=rows.find(e=>e.event==='batch_end');
 const http=rows.filter(e=>e.event==='http_end'),reports=rows.filter(e=>e.event==='report_end');
 const durations=http.map(e=>e.httpMs).filter(Number.isFinite);
 return {batchId,kind:start?.kind,expectedReports:start?.reports,finishedReports:reports.length,outcome:end?.outcome||'incomplete',batchMs:end?.elapsedMs,peakHttp:end?.peakHttp,submissionMs:rows.find(e=>e.event==='submission_end')?.totalMs,httpAttempts:http.length,httpFailures:http.filter(e=>e.outcome!=='success').length,throttles:http.filter(e=>e.status===429||e.status===503).length,retries:rows.filter(e=>e.event==='retry').length,queueMsTotal:reports.reduce((s,e)=>s+(e.queueMs||0),0),backoffMsTotal:reports.reduce((s,e)=>s+(e.backoffMs||0),0),httpP50:quantile(durations,0.5),httpP95:quantile(durations,0.95),providers:[...new Set(http.map(e=>e.provider).filter(Boolean))],reportedCostUsd:http.reduce((s,e)=>s+(e.costUsd||0),0),missingCostCount:http.filter(e=>!Number.isFinite(e.costUsd)).length};
});
console.log(JSON.stringify({batches},null,2));
