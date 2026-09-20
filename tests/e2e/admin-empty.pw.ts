import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {test,expect} from '@playwright/test';
test('Run supports no active contest and leaves Library available',async({page})=>{
 test.skip(process.env.E2E_EMPTY_FIXTURE!=='true','Explicit local synthetic fixture only.');
 if(process.env.E2E_ALLOW_MUTATIONS!=='true'||process.env.USE_REAL_LLM!=='false')throw new Error('Synthetic simulation fixture only.');
 const db=new Pool({password:readFileSync(process.env.PGPASSWORD_FILE!,'utf8').trim()});
 const active=(await db.query('SELECT id FROM challenges WHERE is_active')).rows;
 try{
  await db.query('UPDATE challenges SET is_active=false WHERE is_active');
  await page.goto('/admin');await page.getByLabel('Admin secret').fill(readFileSync(process.env.ADMIN_SECRET_FILE!,'utf8').trim());await page.getByRole('button',{name:'Enter admin',exact:true}).click();
  await expect(page.getByRole('heading',{name:'No active contest',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Prepare or activate a contest from the library.',exact:true}).click();await expect(page.getByRole('heading',{name:'Contest Library',exact:true})).toBeVisible();
 }finally{if(active.length)await db.query('UPDATE challenges SET is_active=true WHERE id=$1',[active[0].id]);await db.end();}
});
