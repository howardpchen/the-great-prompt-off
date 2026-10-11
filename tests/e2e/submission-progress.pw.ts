import {test,expect} from '@playwright/test';
import {evaluationFailureMessage} from '../../app/lib/evaluation-errors';
const contestId='11111111-1111-4111-8111-111111111111';
const fields=Array.from({length:12},(_,i)=>({key:`finding_${i+1}`,label:`Finding ${i+1}`,type:'binary',allowedValues:['absent','present'],weight:1}));
for(const outcome of ['completed','failed'])test(`queued/retrying notification, refresh recovery, mobile layout and ${outcome} result`,async({page})=>{
 let state='queued',posts=0,used=0;
 const status=()=>({source:'supabase',publicSubmissionLimit:5,publicSubmissionsUsed:used,remainingPublicSubmissions:5-used,latestPublicScore:used?75:null,finalSubmissionUsed:false,finalScore:null});
 await page.addInitScript(()=>{localStorage.setItem('great-prompt-off-participant-id','DEMO01');sessionStorage.setItem('great-prompt-off-participant-session-token','synthetic-ui-session');});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let data:unknown;
  switch(url.pathname){
   case '/api/participants/validate':data={valid:true,participantCode:'DEMO01',participantToken:'synthetic-ui-session',source:'supabase'};break;
   case '/api/participants/profile':data={participantCode:'DEMO01',displayName:'Synthetic participant'};break;
   case '/api/challenge-data':data={source:'supabase',challenge:{id:contestId,title:'Synthetic queue test',eventPhase:'practice_open',leaderboardVisibility:'practice',eventAnnouncement:'',eventTimerEndsAt:null,eventTimerLabel:'',publicSubmissionLimit:5,finalSubmissionLimit:1},mode:{id:'synthetic',version:1,title:'Synthetic',fields,education:{version:1,pipeline:'structured-v1',systemPromptVersion:'clinical-extraction-v1',baselineInstructions:'Use explicit findings.',evaluationMode:'simulation'}},reportCounts:{sample:0,public:2,private:2}};break;
   case '/api/challenge-reports':data={reports:[{id:'synthetic-report',filename:'synthetic.txt',text:'Fictional findings.'}]};break;
   case '/api/sandbox':data={enabled:false,reports:[],job:null,inFlight:false,cooldownUntil:null,serverTime:new Date().toISOString()};break;
   case '/api/education-summary':data={simulated:true,baseline:null,hiddenBaseline:null};break;
   case '/api/team-history':data={practice:[],final:null};break;
   case '/api/leaderboard':data={source:'supabase',visible:true,rows:[]};break;
   case '/api/submissions/status':data=status();break;
   case '/api/submissions/public':posts++;expect(route.request().headers().prefer).toBe('respond-async');await route.fulfill({status:202,json:{state:'queued'}});return;
   case '/api/submissions/public/progress':
    if(state==='completed'){used=1;data={state,result:{...status(),kind:'public',evaluationMode:'mock',score:75,correctFields:9,totalFields:12,reportCount:1,feedback:{kind:'public',score:75,correctFields:9,totalFields:12,reportCount:1}},instructions:'Use explicit findings.'};}
    else if(state==='failed')data={state:'failed',code:'output_format',error:evaluationFailureMessage('output_format','public')};
    else data={state,progress:{phase:state,completedReports:state==='processing'?1:0,totalReports:2,retries:state==='retrying'?1:0}};
    break;
   default:throw Error(`Unexpected fixture API ${url.pathname}`);
  }
  await route.fulfill({json:data});
 });
 await page.goto('/challenge');page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'Use test attempt',exact:true}).click();
 const evaluate=page.getByRole('region',{name:'Public evaluation',exact:true});
 await expect(evaluate.getByText(/Your test submission is queued/).first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Processing test…',exact:true})).toBeDisabled();
 state='retrying';await expect(evaluate.getByText(/Retrying automatically/).first()).toBeVisible();
 expect(posts).toBe(1);
 await page.reload();await expect(evaluate.getByText(/Retrying automatically/).first()).toBeVisible();expect(posts).toBe(1);
 state='processing';await expect(evaluate.getByText(/1 of 2 reports complete/).first()).toBeVisible();
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(process.env.PROGRESS_PREVIEW_DIR)await evaluate.screenshot({path:`${process.env.PROGRESS_PREVIEW_DIR}/waiting-mobile.png`});
 state=outcome;
 if(outcome==='completed'){
  await expect(evaluate.getByText(/Test attempt saved: 75\.0%/).first()).toBeVisible();
  await expect(page.getByText('Viewing public attempt 1 · 75%',{exact:true})).toBeVisible();
 }else{
  await expect(evaluate.getByText(/required JSON format/).first()).toBeVisible();
  await expect(evaluate.getByText(/No test attempt was used/).first()).toBeVisible();
  expect(used).toBe(0);
 }
 await expect(page.getByRole('button',{name:'Use test attempt',exact:true})).toBeEnabled();expect(posts).toBe(1);
 expect(await page.evaluate(id=>localStorage.getItem(`gpo-pending-public:${id}:DEMO01`),contestId)).toBeNull();
});
