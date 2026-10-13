import {test,expect} from '@playwright/test';
const fields=Array.from({length:12},(_,i)=>({key:`finding_${i+1}`,label:`Finding ${i+1}`,type:'binary',allowedValues:['absent','present'],weight:1}));
const reports=Array.from({length:20},(_,i)=>({id:`synthetic-report-${i+1}`,filename:`synthetic-${i+1}.txt`,split:'public',text:`Fictional report ${i+1}.`}));
const comparisons=reports.map((r,i)=>({report:r.filename,fields:fields.map((f,j)=>({field:f.key,expected:'present',actual:(i+j)%4?'present':'absent',correct:!!((i+j)%4),noDecision:false}))}));
const feedback={kind:'public',score:75,correctFields:180,totalFields:240,reportCount:20,clinicalComparisons:comparisons};
const contestId='11111111-1111-4111-8111-111111111111';

for(const [startPhase,retryCase] of [['practice_open',false],['sandbox_open',false],['not_started',false],['sandbox_open',true]] as const) test(`full feedback after ${startPhase} transition; retry=${retryCase}`,async({page,context})=>{
   let phase=startPhase,used=0,reportFetches=0,posts=0,completed=false;
   let failReports=retryCase;
   const status=()=>({source:'supabase',publicSubmissionLimit:5,publicSubmissionsUsed:used,remainingPublicSubmissions:5-used,latestPublicScore:used?75:null,finalSubmissionUsed:false,finalScore:null});
   await context.addInitScript(()=>{localStorage.setItem('great-prompt-off-participant-id','DEMO01');sessionStorage.setItem('great-prompt-off-participant-session-token','synthetic-only');});
   await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());let data;
    switch(url.pathname){
     case '/api/participants/validate':data={valid:true,participantCode:'DEMO01',source:'supabase'};break;
     case '/api/participants/profile':data={displayName:'Synthetic participant'};break;
     case '/api/challenge-data':data={source:'supabase',challenge:{id:contestId,title:'Synthetic diagnosis',eventPhase:phase,leaderboardVisibility:'practice',eventAnnouncement:'',eventTimerEndsAt:null,eventTimerLabel:'',publicSubmissionLimit:5,finalSubmissionLimit:1},mode:{id:'synthetic',version:1,title:'Synthetic',fields,education:{version:1,pipeline:'structured-v1',systemPromptVersion:'clinical-extraction-v1',baselineInstructions:'Use explicit findings.',evaluationMode:'simulation'}},reportCounts:{sample:3,public:20,private:177}};break;
     case '/api/challenge-reports':reportFetches++;if(failReports){await route.fulfill({status:503,json:{error:'synthetic failure'}});return;}data={reports:phase==='practice_open'?reports:[]};break;
     case '/api/submissions/status':data=status();break;
     case '/api/leaderboard':data={source:'supabase',visible:true,rows:[]};break;
     case '/api/sandbox':data={enabled:false,reports:[],job:null,inFlight:false,cooldownUntil:null,serverTime:new Date().toISOString()};break;
     case '/api/education-summary':data={simulated:true,baseline:null,hiddenBaseline:null};break;
     case '/api/team-history':data=url.searchParams.has('submission')?{attemptNumber:1,instructions:'Use explicit findings.',feedback}:{practice:used?[{id:'22222222-2222-4222-8222-222222222222',attemptNumber:1,instructions:'Use explicit findings.',score:75,reportCount:20,submittedAt:'2026-01-01T00:00:00Z'}]:[],final:null};break;
     case '/api/submissions/public':posts++;await route.fulfill({status:202,json:{state:'queued'}});return;
     case '/api/submissions/public/progress':
      if(completed){used=1;data={state:'completed',result:{...status(),kind:'public',score:75,correctFields:180,totalFields:240,reportCount:20,feedback},instructions:'Use explicit findings.'};}
      else data={state:'processing',progress:{phase:'processing',completedReports:19,totalReports:20,retries:0}};
      break;
     default:throw Error(`Unexpected local API ${url.pathname}`);
    }
    await route.fulfill({json:data});
   });
   await page.goto('/challenge');
   const submit=page.getByRole('button',{name:'Use test attempt',exact:true});
   await expect(submit).toBeVisible();
   phase='practice_open';
   if(retryCase){await expect(page.getByRole('button',{name:'Retry loading reports'})).toBeVisible({timeout:12000});await expect(submit).toBeDisabled();failReports=false;await page.getByRole('button',{name:'Retry loading reports'}).click();}
   await expect(submit).toBeEnabled({timeout:12000});
   page.on('dialog',dialog=>dialog.accept());
   await submit.click();
   await expect(page.getByText(/19 of 20 reports complete/).first()).toBeVisible({timeout:6000});
   await expect(page.getByRole('region',{name:'Results by report and finding',exact:true})).toHaveCount(0);
   completed=true;
   await expect(page.getByText(/Test attempt saved: 75\.0%/).first()).toBeVisible({timeout:6000});
   const matrix=page.getByRole('region',{name:'Results by report and finding',exact:true});
   await expect(matrix).toBeVisible();
   await expect(matrix.getByRole('button')).toHaveCount(240);
   await expect(matrix.getByRole('button').filter({hasText:'✓'})).toHaveCount(180);
   await expect(matrix.getByRole('button').filter({hasText:'×'})).toHaveCount(60);
   await expect(page.locator('option').filter({hasText:'Unmatched report'})).toHaveCount(0);
   await matrix.getByRole('button',{name:/^Report 020, Finding 12:/}).click();
   await expect(page.getByText('Fictional report 20.',{exact:true})).toBeVisible();
   await expect(page.locator('[id="public-feedback-synthetic-20.txt-finding_12"]')).toBeFocused();
   for(const width of [375,768,1440]){await page.setViewportSize({width,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
   await page.reload();
   await expect(matrix.getByRole('button')).toHaveCount(240);
   expect(posts).toBe(1);
   expect(reportFetches).toBe(retryCase?3:2);
});
