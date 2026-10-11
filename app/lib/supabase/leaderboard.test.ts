import {expect,it,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const {execute}=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('./admin',()=>({createDatabase:()=>({execute})}));
import {getSupabaseLeaderboard} from './submission-workflow';
it('preserves fractional scores and stable IDs while using current display names',async()=>{
 execute.mockResolvedValueOnce({data:{id:'challenge',event_phase:'practice_open',leaderboard_visibility:'practice'},error:null})
 .mockResolvedValueOnce({data:[{participant_id:'id1',score:87.46,submitted_at:'2026-01-01'},{participant_id:'id2',score:87.44,submitted_at:'2026-01-02'},{participant_id:'id1',score:80,submitted_at:'2026-01-03'}],error:null})
 .mockResolvedValueOnce({data:[{id:'id1',participant_code:'P001',display_name:'Same Name'},{id:'id2',participant_code:'P002',display_name:'Same Name'}],error:null});
 const result=await getSupabaseLeaderboard();
 expect(result.rows.map(r=>[r.rank,r.participant,r.displayName,r.score])).toEqual([[1,'P001','Same Name',87.46],[2,'P002','Same Name',87.44]]);
});
