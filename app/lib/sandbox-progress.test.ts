import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const mocks=vi.hoisted(()=>({extract:vi.fn(),append:vi.fn(),finish:vi.fn()}));
vi.mock('./db/database',()=>({createDatabase:()=>({})}));
vi.mock('./supabase/participant-session-token',()=>({verifyParticipantSessionToken:()=>({participantCode:'P001'})}));
vi.mock('./supabase/participant-validation',()=>({validateParticipantSession:async()=>({valid:true,participantId:'synthetic-participant'})}));
vi.mock('./request-security',()=>({isAllowedWrite:()=>true}));
vi.mock('./openrouter',()=>({extractReportWithOpenRouter:mocks.extract,shouldUseRealLlm:()=>true,resolveOpenRouterModel:()=> 'openai/gpt-oss-20b',ProviderOutputError:class extends Error{}}));
vi.mock('./db/sandbox',async()=>{
 const actual=await vi.importActual<typeof import('./db/sandbox')>('./db/sandbox');
 const {twelveBinaryTemplate}=await import('./contest-schema-fixtures');
 const mode={...twelveBinaryTemplate,education:{version:1,pipeline:'structured-v1',baselineInstructions:'Synthetic',evaluationMode:'real'}};
 return {...actual,appendSandboxResult:mocks.append,finishSandbox:mocks.finish,admitSandbox:async()=>({reused:false,contest:{mode_id:mode.id,schema_version:1,contest_schema:mode,evaluation_model:'openai/gpt-oss-20b'},job:{id:'synthetic-job',prompt:'Synthetic rules',simulation:false,reports:[{id:'one',text:'Fictional sample'}]}})};
});
import {POST} from '../api/sandbox/route';
import {twelveBinaryTemplate} from './contest-schema-fixtures';
import {ProviderOutputError} from './openrouter';
beforeEach(()=>{vi.clearAllMocks();});
it('streams retry/processing notifications and saves only completed report results',async()=>{
 mocks.extract.mockImplementation(async(_input,scheduling)=>{
  scheduling.onQueued();scheduling.onRetry();scheduling.onAdmission();
  return JSON.stringify(Object.fromEntries(twelveBinaryTemplate.fields.map(f=>[f.key,{status:'decision',value:'0'}])));
 });
 const response=await POST(new Request('http://localhost/api/sandbox',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
 const events=(await response.text()).trim().split('\n').map(line=>JSON.parse(line));
 expect(events.some(e=>e.status==='retrying')).toBe(true);expect(events.some(e=>e.status==='processing')).toBe(true);
 expect(mocks.append).toHaveBeenCalledTimes(1);expect(mocks.append.mock.calls[0][2].status).toBe('completed');
 expect(events.at(-1).status).toBe('completed');expect(mocks.finish.mock.calls[0][2]).toBe('completed');
});
it('distinguishes invalid output from a provider outage without exposing raw output',async()=>{
 mocks.extract.mockRejectedValue(new ProviderOutputError('PRIVATE_RESPONSE_SENTINEL'));
 const response=await POST(new Request('http://localhost/api/sandbox',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}));
 const text=await response.text();expect(text).toContain('required JSON format');expect(text).not.toContain('PRIVATE_RESPONSE_SENTINEL');expect(mocks.finish.mock.calls[0][2]).toBe('failed');
});
