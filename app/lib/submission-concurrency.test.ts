import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const fixtures=vi.hoisted(()=>({create:vi.fn(),reserve:vi.fn(),fail:vi.fn()}));
vi.mock('./supabase/admin',()=>({createDatabase:fixtures.create}));
vi.mock('./db/attempts',()=>({reserveAttempt:fixtures.reserve,failReservation:fixtures.fail,AttemptAdmissionError:class extends Error{}}));
import {submitToSupabase} from './supabase/submission-workflow';
import {twelveBinaryTemplate} from './contest-schema-fixtures';
const mode={...twelveBinaryTemplate,education:{version:1 as const,pipeline:'structured-v1' as const,baselineInstructions:'Synthetic baseline',evaluationMode:'real' as const}};
const answer=Object.fromEntries(mode.fields.map(f=>[f.key,'0']));
const raw=JSON.stringify(Object.fromEntries(mode.fields.map(f=>[f.key,{status:'decision',value:'0'}])));
beforeEach(()=>{vi.useFakeTimers({toFake:["setTimeout","clearTimeout","Date","performance"]});vi.stubGlobal('__promptOffProviderScheduler',undefined);vi.stubGlobal('__promptOffTiming',undefined);vi.stubEnv('OPENROUTER_API_KEY','SECRET_SENTINEL');vi.stubEnv('OPENROUTER_CONCURRENCY','10');vi.stubEnv('USE_REAL_LLM','true');fixtures.fail.mockReset();fixtures.reserve.mockResolvedValue({id:'batch-synthetic',status:'pending',attempt_number:1});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each([1,2])('public Submit (%s concurrent submissions) paces actual starts and shares the10-call ceiling',async(submissions)=>{
 let nextReservation=0;fixtures.reserve.mockImplementation(async()=>({id:`batch-synthetic-${++nextReservation}`,status:"pending",attempt_number:1}));
 const logs:string[]=[];vi.spyOn(console,'info').mockImplementation((s:string)=>{logs.push(s);});
 const inserts:Record<string,unknown>={};
 const db={
  execute:async(q:{table:string;operation:string;values?:unknown})=>{
   if(q.operation==='insert'){inserts[q.table]=q.values;return {data:q.table==='prompt_runs'?{id:'run-synthetic'}:[],error:null};}
   const rows:Record<string,unknown>={
    challenges:{id:'contest-synthetic',locked_model:'openai/gpt-oss-20b',evaluation_model:'openai/gpt-oss-20b',mode_id:mode.id,schema_version:mode.version,contest_schema:mode,public_submission_limit:5,final_submission_limit:1,event_phase:'practice_open',leaderboard_visibility:'practice'},
    participants:{id:'participant-synthetic',participant_code:'P001',is_active:true},
    reports:Array.from({length:20},(_,i)=>({id:`report-${i}`,external_id:`id-${i}`,filename:`filename-${i}`,split:'public',report_text:'REPORT_SENTINEL'})),
    answer_keys:Array.from({length:20},(_,i)=>({report_id:`report-${i}`,mode_id:mode.id,schema_version:mode.version,answer_values:answer})),
    submissions:[],
   };if(!(q.table in rows))throw Error('Unexpected table');return {data:rows[q.table],error:null};
  },
  sql:async(q:string)=>q.includes('FOR UPDATE')?[{status:'pending'}]:q.includes('public_pending')?[{public_pending:0,final_pending:0}]:[],

 };
 fixtures.create.mockReturnValue({...db,transaction:async<T>(fn:(tx:typeof db)=>Promise<T>):Promise<T>=>fn(db)});
 const starts:number[]=[]; let active=0,peak=0,arrived=0;let release!:()=>void;
 const barrier=new Promise<void>(r=>{release=r;});
 vi.stubGlobal('fetch',vi.fn(async()=>{starts.push(performance.now());active++;peak=Math.max(peak,active);if(++arrived===10)release();await barrier;active--;return new Response(JSON.stringify({provider:'Groq',choices:[{finish_reason:'stop',message:{content:raw}}],usage:{prompt_tokens:100,completion_tokens:80,completion_tokens_details:{reasoning_tokens:20},cost:0.00001}}));}));
 const pending=Promise.all(Array.from({length:submissions},(_,i)=>submitToSupabase({kind:'public',participantCode:'P001',prompt:'PROMPT_SENTINEL',idempotencyKey:`synthetic-${i}`})));
 await vi.runAllTimersAsync();
 const results=await pending;
 const result=results[0];
 for(let i=1;i<starts.length;i++)expect(starts[i]-starts[i-1]).toBeGreaterThanOrEqual(250);
 expect(peak).toBe(10);expect(arrived).toBe(20*submissions);expect(result.reportCount).toBe(20);expect(result.correctFields).toBe(240);expect(inserts.prompt_run_items).toHaveLength(20);expect(fixtures.fail).not.toHaveBeenCalled();
 const events=logs.map(s=>JSON.parse(s));expect(events.filter(e=>e.event==='http_end')).toHaveLength(20*submissions);expect(events.filter(e=>e.event==='batch_end')).toHaveLength(submissions);expect(events.find(e=>e.event==='batch_end')).toMatchObject({batchId:'batch-synthetic-1',peakHttp:10,outcome:'completed'});expect(events.find(e=>e.event==='submission_end')).toMatchObject({outcome:'completed'});
 expect(logs.join('')).not.toMatch(/SECRET_SENTINEL|PROMPT_SENTINEL|REPORT_SENTINEL|filename-|participant-synthetic/);
},10000);
