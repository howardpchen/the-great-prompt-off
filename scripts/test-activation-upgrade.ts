/** Owner-only disposable pre-031 upgrade fixture. Never connects to a nonempty DB. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {getPool} from '../app/lib/db/pool';
async function main(){
 if(process.env.PGDATABASE!=='gpo_freeze_upgrade_test'||process.env.DATABASE_URL)throw new Error('Empty disposable upgrade DB required');
 const c=await getPool().connect();
 try{
  assert.equal((await c.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'")).rows[0].n,0);
  for(const name of (await readdir('db/migrations')).sort().filter(n=>n.endsWith('.sql')&&!n.startsWith('031'))){await c.query('BEGIN');await c.query(await readFile(`db/migrations/${name}`,'utf8'));await c.query('COMMIT');}
  const [p]=(await c.query("INSERT INTO participants(participant_code,access_code) VALUES('UPGRADE','GPO-TEST-0001') RETURNING id")).rows;
  for(const [slug,active,locked] of [['active',true,false],['historical',false,true],['run-only',false,false],['sandbox-only',false,false],['draft',false,false]]){
   const [row]=(await c.query("INSERT INTO challenges(slug,title,output_schema,locked_model,is_active,schema_locked) VALUES($1,$1,'{}','model',$2,$3) RETURNING id",[slug,active,locked])).rows;
   if(slug==='run-only')await c.query("INSERT INTO prompt_runs(challenge_id,participant_id,run_type,prompt_text,model) VALUES($1,$2,'sample','Synthetic','model')",[row.id,p.id]);
   if(slug==='sandbox-only')await c.query("INSERT INTO sandbox_jobs(challenge_id,participant_id,schema_version,idempotency_key,input_hash,prompt,reports,status,simulation,completed_at) VALUES($1,$2,1,'synthetic','hash','Synthetic','[{},{},{}]','completed',true,now())",[row.id,p.id]);
  }
  await c.query('BEGIN');await c.query(await readFile('db/migrations/031_activation_freeze.sql','utf8'));await c.query('COMMIT');
  const rows=(await c.query('SELECT slug,configuration_frozen_at IS NOT NULL frozen,schema_locked FROM challenges ORDER BY slug')).rows;
  assert.deepEqual(rows,['active','draft','historical','run-only','sandbox-only'].map(slug=>({slug,frozen:slug!=='draft',schema_locked:slug!=='draft'})));
  console.log('PASS upgrade backfills active, locked historical, inactive legacy run-only and sandbox-only contests; untouched draft stays editable.');
 }finally{c.release();}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
