/** Explicit operator action; never schedule this as a blind timeout retry. */
import {createDatabase} from '../app/lib/db/database';
import {getPool} from '../app/lib/db/pool';
import {recoverAbandonedReservation} from '../app/lib/db/attempts';
async function main(){
 const [id,confirmation]=process.argv.slice(2);
 if(!/^[0-9a-f-]{36}$/i.test(id || '') || confirmation !== '--worker-confirmed-stopped')
  throw new Error('Usage: recover-education-attempt.ts UUID --worker-confirmed-stopped; inspect and stop original evaluator first.');
 const changed=await recoverAbandonedReservation(createDatabase(),id,true);
 console.log(changed ? 'Reservation released. No evaluation restarted; team may explicitly retry locked instructions.' : 'No eligible pending reservation changed (must be at least 30 minutes old).');
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>getPool().end());
