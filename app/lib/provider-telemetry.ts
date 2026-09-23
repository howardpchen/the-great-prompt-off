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
const shared = globalThis as typeof globalThis & { __promptOffTiming?: { active: number; batches: Map<string, {active:number;peak:number}> } };
function state() { return shared.__promptOffTiming ??= {active:0,batches:new Map()}; }
export function beginBatch(batchId: string, kind: string, reports: number, fanout: number) {
  const start=performance.now();state().batches.set(batchId,{active:0,peak:0});
  providerMetric("batch_start",{batchId,kind,reports,fanout});
  return (outcome: string) => { const b=state().batches.get(batchId); providerMetric("batch_end",{batchId,kind,reports,fanout,outcome,elapsedMs:elapsedMs(start),peakHttp:b?.peak ?? 0});state().batches.delete(batchId); };
}
export function beginHttp(batchId?: string) {
  const s=state();s.active++;const b=batchId?s.batches.get(batchId):undefined;
  if(b){b.active++;b.peak=Math.max(b.peak,b.active);}
  return { activeHttp:s.active, batchActiveHttp:b?.active, done:()=>{s.active--;if(b)b.active--;} };
}
