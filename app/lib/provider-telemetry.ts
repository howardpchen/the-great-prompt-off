/** Content-free operational telemetry. Never pass prompts, reports, outputs, headers or errors. */
export type ProviderTrace = { batchId?: string; reportIndex?: number };
type Fields = Record<string, string | number | boolean | null | undefined>;
export function providerMetric(event: string, fields: Fields) {
  try { console.info(JSON.stringify({ metric: "prompt_off_provider", version: 1, timestamp: new Date().toISOString(), event, ...fields })); } catch { /* Logging must never fail an evaluation. */ }
}
export function safeMetricName(value: unknown): string | undefined {
  return typeof value === "string" && /^[\w ./:\-]{1,100}$/.test(value) ? value : undefined;
}
export function metricNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}
export function elapsedMs(start: number) { return Math.max(0, Math.round(performance.now() - start)); }
type LiveBatch = { active:number; peak:number; contestId:string; kind:string; total:number; processed:number; failed:number; finished:Set<number> };
type LiveState = { active:number; batches:Map<string,LiveBatch>; totals:Map<string,{processed:number;failed:number}> };
const shared = globalThis as typeof globalThis & { __promptOffTiming?: LiveState };
function state() { return shared.__promptOffTiming ??= {active:0,batches:new Map(),totals:new Map()}; }
export function beginBatch(batchId: string, kind: string, reports: number, fanout: number, contestId = "") {
  const start=performance.now();state().batches.set(batchId,{active:0,peak:0,contestId,kind,total:reports,processed:0,failed:0,finished:new Set()});
  providerMetric("batch_start",{batchId,kind,reports,fanout});
  return (outcome: string) => { const b=state().batches.get(batchId); providerMetric("batch_end",{batchId,kind,reports,fanout,outcome,elapsedMs:elapsedMs(start),peakHttp:b?.peak ?? 0});state().batches.delete(batchId); };
}
/** Count unique report outcomes, not provider attempts/retries. */
export function finishReport(batchId:string, reportIndex:number, outcome:"processed"|"failed") {
  const s=state(), batch=s.batches.get(batchId);
  if (!batch || !Number.isInteger(reportIndex) || reportIndex<0 || reportIndex>=batch.total || batch.finished.has(reportIndex)) return;
  batch.finished.add(reportIndex);
  batch[outcome]++;
  const total=s.totals.get(batch.contestId) ?? {processed:0,failed:0};
  total[outcome]++;
  s.totals.set(batch.contestId,total);
}
export function liveReportSnapshot(contestId:string) {
  const s=state();
  const batches=[...s.batches.values()].filter(batch=>batch.contestId===contestId).map(({kind,total,processed,failed})=>({kind,total,processed,failed}));
  return {batches,processedSinceStart:s.totals.get(contestId)?.processed ?? 0,failedSinceStart:s.totals.get(contestId)?.failed ?? 0};
}
export function beginHttp(batchId?: string) {
  const s=state();s.active++;const b=batchId?s.batches.get(batchId):undefined;
  if(b){b.active++;b.peak=Math.max(b.peak,b.active);}
  return { activeHttp:s.active, batchActiveHttp:b?.active, done:()=>{s.active--;if(b)b.active--;} };
}
