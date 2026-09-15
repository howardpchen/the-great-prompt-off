/** Build only the pre-library schema in an explicitly disposable database. */
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {getPool} from '../app/lib/db/pool';
async function main(){
 if(process.env.PGDATABASE!=='gpo_library_upgrade') throw new Error('Disposable upgrade fixture only.');
 const db=await getPool().connect();
 try {
  const exists=await db.query("SELECT to_regclass('public.challenges') existing");
  if(exists.rows[0].existing) throw new Error('Requires empty fixture.');
  await db.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of (await readdir('db/migrations')).filter(n=>/^\d+.*\.sql$/.test(n)&&Number(n.slice(0,3))<=25).sort()) {
   const sql=await readFile(`db/migrations/${name}`,'utf8');await db.query('BEGIN');
   try {await db.query(sql);await db.query('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[name,createHash('sha256').update(sql).digest('hex')]);await db.query('COMMIT');}
   catch(e){await db.query('ROLLBACK');throw e;}
  }
  console.log('Pre-library migrations 001–025 prepared.');
 } finally {db.release();}
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>getPool().end());
