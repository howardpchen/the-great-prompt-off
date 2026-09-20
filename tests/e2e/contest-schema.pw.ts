import {readFileSync} from 'node:fs';
import {test,expect,request} from '@playwright/test';
test('administrator configures mixed fields in a draft; activation freezes typed contract',async({page,context})=>{
 if(process.env.E2E_ALLOW_MUTATIONS!=='true')throw new Error('Disposable only.');
 await page.goto('/admin');await page.getByLabel('Admin secret').fill(readFileSync(process.env.ADMIN_SECRET_FILE!,'utf8').trim());await page.getByRole('button',{name:'Enter admin',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Run contest',exact:true})).toBeVisible();
 await page.goto('/admin/contests');await page.getByRole('button',{name:'Create new contest',exact:true}).click();await page.getByLabel('Contest title',{exact:true}).fill('Synthetic mixed workflow');await page.getByLabel('Start from a template').selectOption('mixed');await page.getByRole('button',{name:'Create inactive draft',exact:true}).click();
 await expect(page).toHaveURL(/\/admin\/contests\/[a-f0-9-]+$/);
 const id=page.url().split('/').pop()!;await page.getByRole('button',{name:'2. Findings',exact:true}).click();
 await expect(page.getByLabel('Field key',{exact:true})).toHaveCount(12);await page.getByRole('button',{name:'Add finding',exact:true}).click();await expect(page.getByLabel('Field key',{exact:true})).toHaveCount(13);await page.getByRole('button',{name:'Remove finding 13',exact:true}).click();
 await page.getByLabel('Absolute tolerance',{exact:true}).first().fill('1.25');await page.getByRole('button',{name:'Save draft configuration',exact:true}).click();await expect(page.getByRole('status').last()).toContainText('Saved');
 const headers={Origin:process.env.E2E_BASE_URL||'http://localhost:3000'};const api=await request.newContext({baseURL:headers.Origin,extraHTTPHeaders:{...headers,Cookie:(await context.cookies()).map(c=>`${c.name}=${c.value}`).join('; ')}});
 const state=()=>api.get(`/api/admin/contest-schema?contestId=${id}`).then(r=>r.json());let s=await state();expect(s.schema.fields[10].tolerance).toBe(1.25);
 const post=async(action:string,extra:object)=>{s=await state();const r=await api.post('/api/admin/contest-schema',{headers,data:{action,contestId:id,expectedVersion:s.schema.version,expectedRevision:s.revision,...extra}});expect(r.ok(),await r.text()).toBe(true);};
 await post('reports',{reports:[{external_id:'a',filename:'a.txt',split:'public',report_text:'Synthetic A'},{external_id:'b',filename:'b.txt',split:'private',report_text:'Synthetic B'}]});s=await state();await post('answers',{answers:s.reports.map((r:{id:string})=>({report_id_or_filename:r.id,answer_values:Object.fromEntries(s.schema.fields.map((f:{key:string;type:string;allowedValues:string[]})=>[f.key,f.type==='number'?10:f.allowedValues[0]]))}))});
 await page.reload();await page.getByRole('button',{name:'5. Review & activate',exact:true}).click();await page.getByLabel('I have reviewed the clinical references',{exact:false}).check();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Activate contest (paused)',exact:true}).click();await expect(page).toHaveURL(/\/admin$/);
 const pub=await(await api.get('/api/challenge-data')).json();expect(pub.mode.fields).toHaveLength(12);expect(JSON.stringify(pub)).not.toContain('answer_values');expect(JSON.stringify(pub)).not.toContain('report_text');
 await page.goto('/admin/cases');await expect(page.getByRole('heading',{name:'Reference cases',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:/save case|create case/i})).toHaveCount(0);
});
