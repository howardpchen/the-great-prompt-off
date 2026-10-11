import {beforeEach,expect,it,vi} from "vitest";
const {sql,verify}=vi.hoisted(()=>({sql:vi.fn(),verify:vi.fn()}));
vi.mock("@/app/lib/db/database",()=>({createDatabase:()=>({sql})}));
vi.mock("@/app/lib/supabase/participant-session-token",()=>({verifyParticipantSessionToken:verify}));
import {GET,PATCH} from './route';
function request(body?:unknown,origin='http://localhost') {return new Request('http://localhost/api/participants/profile',{method:body===undefined?'GET':'PATCH',headers:{Authorization:'Bearer signed',Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('APP_ORIGIN','http://localhost');verify.mockReturnValue({participantCode:'P001'});sql.mockResolvedValue([{participant_code:'P001',display_name:'Knee Team'}]);});
it('reads the authenticated identity only with no cache',async()=>{const r=await GET(request());expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(sql.mock.calls[0][1]).toEqual(['P001']);expect(await r.json()).toEqual({participantCode:'P001',displayName:'Knee Team'});});
it('updates only display_name for the active signed participant',async()=>{const r=await PATCH(request({displayName:'  Knee Team  '}));expect(r.status).toBe(200);expect(sql).toHaveBeenCalledWith('UPDATE participants SET display_name=$2 WHERE participant_code=$1 AND is_active RETURNING participant_code,display_name',['P001','Knee Team']);});
it.each([{displayName:'Other',participantCode:'P002'},{displayName:'Other',email:'other@example.test'},{displayName:''},{displayName:'   '},{displayName:'x'.repeat(81)},{displayName:'bad\nname'},{displayName:12}])('rejects invalid or extra fields: %j',async body=>{expect((await PATCH(request(body))).status).toBe(400);expect(sql).not.toHaveBeenCalled();});
it('rejects foreign-origin writes',async()=>{expect((await PATCH(request({displayName:'Name'},'https://foreign.test'))).status).toBe(403);expect(sql).not.toHaveBeenCalled();});
it('rejects invalid signatures before reading or writing',async()=>{verify.mockReturnValue(null);expect((await GET(request())).status).toBe(401);expect((await PATCH(request({displayName:'Name'}))).status).toBe(401);expect(sql).not.toHaveBeenCalled();});
it('refuses inactive/deleted participants',async()=>{sql.mockResolvedValue([]);expect((await PATCH(request({displayName:'Name'}))).status).toBe(401);});
it('does not leak database diagnostics',async()=>{sql.mockRejectedValue(Error('private SQL details'));const r=await PATCH(request({displayName:'Name'}));expect(r.status).toBe(503);expect(await r.text()).not.toContain('private SQL');});
