import {beginBatch} from '../../lib/provider-telemetry';
import {createDatabase} from '../../lib/db/database';
import {admitSandbox,appendSandboxResult,finishSandbox,sandboxStatus,SandboxError,type SandboxInput} from '../../lib/db/sandbox';
import {verifyParticipantSessionToken} from '../../lib/supabase/participant-session-token';
import {validateParticipantSession} from '../../lib/supabase/participant-validation';
import {isAllowedWrite} from '../../lib/request-security';
import {extractReportWithOpenRouter,shouldUseRealLlm,resolveOpenRouterModel} from '../../lib/openrouter';
import {resolveChallengeMode} from '../../lib/schema-storage';
import {parseEducationOutput} from '../../lib/education-contract';
export const runtime='nodejs';
export const maxDuration=1200;
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
async function participant(request:Request){
 const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]||'';
 const session=verifyParticipantSessionToken(token);if(!session)throw new SandboxError('Participant session required.',401);
 const user=await validateParticipantSession(session.participantCode,token);
 if(!user.valid || !user.participantId)throw new SandboxError('Participant session required.',401);
 return user.participantId;
}
function failure(error:unknown){return Response.json({error:error instanceof SandboxError?error.message:'Sandbox temporarily unavailable.'},{status:error instanceof SandboxError?error.status:500,headers:{...headers,...(error instanceof SandboxError && error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});}
export async function GET(request:Request){try{
 const id=await participant(request);const contestId=new URL(request.url).searchParams.get('contestId')||'';
 return Response.json(await sandboxStatus(createDatabase(),id,contestId),{headers});
}catch(e){return failure(e);}}
export async function POST(request:Request){
 if(!isAllowedWrite(request))return Response.json({error:'Same-origin request required.'},{status:403,headers});
 try{
  const id=await participant(request);
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new SandboxError('JSON required.',400);
  const reader=request.body?.getReader();if(!reader)throw new SandboxError('Request body required.',400);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>400000){await reader.cancel();throw new SandboxError('Request too large.',413);}chunks.push(value);}
  let input:SandboxInput;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new SandboxError('Invalid JSON.',400);}
  const db=createDatabase();const admitted=await admitSandbox(db,id,input,!shouldUseRealLlm());
  if(admitted.reused)return Response.json({job:admitted.job,reused:true},{headers});
  const {job,contest}=admitted;const mode=resolveChallengeMode(contest.mode_id,contest.schema_version,contest.contest_schema);
  const abort=new AbortController();if(request.signal.aborted)abort.abort();const onAbort=()=>abort.abort();request.signal.addEventListener('abort',onAbort,{once:true});
  const deadline=setTimeout(()=>abort.abort(),19*60*1000);
  const encoder=new TextEncoder();let closed=false;
  const stream=new ReadableStream({
   async start(controller){
    const send=(data:unknown)=>{if(!closed)try{controller.enqueue(encoder.encode(JSON.stringify(data)+'\n'));}catch{closed=true;abort.abort();}};
    send({jobId:job.id,status:'running',simulation:job.simulation});
    const finishMetrics=beginBatch(job.id,'sandbox',job.reports.length,job.reports.length);
    let failed=false;
    try{const settled=await Promise.allSettled(job.reports.map(async (r,reportIndex)=>{
     let result:unknown;
     try{
      const raw=job.simulation?JSON.stringify(Object.fromEntries(mode.fields.map(f=>[f.key,{status:'no_decision',value:null}]))):await extractReportWithOpenRouter({prompt:job.prompt,reportText:r.text,mode,model:resolveOpenRouterModel(contest.evaluation_model),signal:abort.signal},{priority:'sandbox',group:id,trace:{batchId:job.id,reportIndex}});
      result={reportId:r.id,status:'completed',decisions:parseEducationOutput(raw,mode).decisions};
     }catch{failed=true;result={reportId:r.id,status:'failed',error:abort.signal.aborted?'Run interrupted.':'Provider unavailable or output invalid; this report was not scored.'};}
     await appendSandboxResult(db,job.id,result);send(result);
    }));if(settled.some(r=>r.status==='rejected'))failed=true;}catch{failed=true;}
    finally{
     clearTimeout(deadline);request.signal.removeEventListener('abort',onAbort);
     const status=abort.signal.aborted?'cancelled':failed?'failed':'completed';
     finishMetrics(status);
     try{await finishSandbox(db,job.id,status);send({status,cooldownSeconds:60});}finally{if(!closed){closed=true;controller.close();}}
    }
   },cancel(){closed=true;abort.abort();}
  });
  return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson','X-Accel-Buffering':'no'}});
 }catch(e){return failure(e);}
}
