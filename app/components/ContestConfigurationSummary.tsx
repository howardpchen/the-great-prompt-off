import Link from 'next/link';
import type { ChallengeModeDefinition } from '../lib/challenge-modes';

export type ContestAdminState = {
  reportDetails?:{id:string;filename:string;split:string;report_text:string;answer_values?:Record<string,unknown>|null;provenance?:string|null}[];
  contestId: string; revision: number; schema: ChallengeModeDefinition;
  evaluationModel: string | null; practiceBudget: number; finalBudget?: number;
  locked: boolean; frozen?: boolean; configurationFrozenAt?: string | null;
  isActive?: boolean; eventPhase?: string; archivedAt?: string | null; ready: boolean;
  sandboxEnabled?: boolean; sandboxSamples?: {id:string;filename:string}[];
  reports: {id:string;filename:string;split:string}[];
  history?: {participant_code:string;submission_type:string;attempt_number:number;score:number;submitted_at:string}[];
};
export function isFrozenContest(state: ContestAdminState) {
  return Boolean(state.frozen || state.locked || state.configurationFrozenAt || state.isActive);
}
export function ContestConfigurationSummary({ state, compact = false }: {state: ContestAdminState; compact?: boolean}) {
  const publicCount=state.reports.filter(r=>r.split==='public').length;
  const hiddenCount=state.reports.filter(r=>r.split==='private').length;
  return <section aria-label="Contest configuration" className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-300">{isFrozenContest(state)?'Frozen configuration':'Draft configuration'} · Version {state.schema.version}</p>
        <h2 className="mt-1 break-words text-xl font-semibold">{state.schema.title}</h2></div>
      <span className="rounded bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm">{state.isActive?'Active':'Inactive'} · {state.eventPhase?.replaceAll('_',' ') || 'Not started'}</span>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-700 dark:text-slate-200">{state.schema.fields.length} findings · {state.sandboxSamples?.length||0} Sandbox / {publicCount} public / {hiddenCount} hidden reports · {state.practiceBudget} public attempts · {state.finalBudget??1} final · {state.evaluationModel||'Model not configured'}</p>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{isFrozenContest(state)?'Evaluation settings are read-only. Duplicate this contest as a new draft to change them.':'Prepare and validate this draft before activation. First activation freezes evaluation settings.'}</p>
    {compact ? <Link className="mt-3 inline-flex font-semibold text-teal-800 dark:text-teal-300 underline" href={`/admin/contests/${state.contestId}`}>Inspect configuration and history</Link> : <div className="mt-4 space-y-3">
      <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Findings, definitions, and scoring</summary>
        <p className="my-3 text-sm">Classification values are matched exactly. Measurement values use their defined tolerance. Weights normalize the score to 100; no-decision responses earn no credit.</p>
        {state.schema.fields.map(f=><article key={f.key} className="mt-3 border-t pt-3"><h3 className="font-semibold">{f.label}</h3><p className="text-sm text-slate-500 dark:text-slate-400">{f.key} · Weight {f.weight??1}</p><p className="mt-1 whitespace-pre-wrap text-sm">{f.description||'No organizer definition supplied.'}</p><p className="mt-1 text-sm">{f.type==='number'?`Unit: ${f.unit}; tolerance: ${f.tolerance}; minimum: ${f.minimum??'unspecified'}; maximum: ${f.maximum??'unspecified'}`:`Allowed values: ${f.allowedValues.join(' · ')}`}{f.nullable?' · Clinical null allowed':''}</p></article>)}
      </details>
      <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Baseline, system contract, and model</summary>
        <dl className="mt-3 space-y-2 text-sm"><div><dt className="font-semibold">Fixed model</dt><dd>{state.evaluationModel||'Not set'}</dd></div>
        <div><dt className="font-semibold">Evaluation mode</dt><dd>{state.schema.education?.evaluationMode||'Legacy runtime policy'}</dd></div>
        <div><dt className="font-semibold">System contract</dt><dd>{state.schema.education?.systemPromptVersion||'Historical contract (unchanged)'}</dd></div>
        <div><dt className="font-semibold">Default participant instructions</dt><dd className="whitespace-pre-wrap">{state.schema.education?.baselineInstructions||'No Team Challenge baseline'}</dd></div></dl>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Organizer definitions are reference material, not automatically appended clinical instructions. Formatting remains application-controlled.</p>
      </details>
      <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Report inventory and readiness</summary>
        <p className="my-2 text-sm">{state.ready?'Structurally ready':'Not structurally ready'}. Import validation does not establish clinical reference acceptance.</p>
        <ul className="max-h-64 overflow-auto text-sm">{[...(state.sandboxSamples||[]).map(r=>({...r,split:'sample'})),...state.reports].map(r=><li key={r.id} className="break-words border-t py-1">{r.filename} · {r.split}</li>)}</ul>
      </details>
    </div>}
  </section>;
}
