import { test, expect } from "@playwright/test";

test('sticky timer and announcement notifications survive polling without interrupting drafts', async ({ page }) => {
  let announcement = '';
  let endsAt: string | null = new Date(Date.now()+120000).toISOString();
  await page.addInitScript(() => {
    localStorage.setItem('great-prompt-off-participant-id', 'DEMO01');
    sessionStorage.setItem('great-prompt-off-participant-session-token', 'synthetic-ui-session');
  });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if(path==='/api/participants/validate') data={valid:true,participantCode:'DEMO01',participantToken:'synthetic-ui-session',source:'supabase'};
    else if(path==='/api/participants/profile') data={displayName:'Synthetic participant',participantCode:'DEMO01'};
    else if(path==='/api/challenge-data') data={source:'supabase',challenge:{id:'synthetic-ui-contest',title:'Synthetic notice workshop',eventPhase:'practice_open',leaderboardVisibility:'practice',eventAnnouncement:announcement,eventTimerEndsAt:endsAt,eventTimerLabel:'Practice round',evaluationModelDisplayName:'Mock model',publicSubmissionLimit:5,finalSubmissionLimit:1},mode:{id:'synthetic',version:1,title:'Synthetic',fields:[{key:'finding',label:'Finding',type:'multiclass',allowedValues:['absent','present'],weight:1}],education:{version:1,pipeline:'structured-v1',evaluationMode:'simulation',baselineInstructions:'Synthetic instructions.'}},reportCounts:{sample:3,public:20,private:177},participantCount:2};
    else if(path==='/api/submissions/status') data={source:'supabase',publicSubmissionLimit:5,publicSubmissionsUsed:0,remainingPublicSubmissions:5,finalSubmissionUsed:false,finalScore:null};
    else if(path==='/api/challenge-reports') data={reports:[{id:'sample-public',filename:'fictional.txt',label:'Practice report 1',text:'Synthetic report only.'}]};
    else if(path==='/api/sandbox') data={enabled:false,reports:[],job:null,inFlight:false,cooldownUntil:null};
    else if(path==='/api/leaderboard') data={source:'supabase',visible:true,rows:[]};
    else if(path==='/api/team-history') data={practice:[],final:null};
    else if(path==='/api/education-summary') data={simulated:true,baseline:null,hiddenBaseline:null};
    else throw new Error(`Unexpected API ${path}`);
    await route.fulfill({json:data});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/challenge');
  const editor=page.getByPlaceholder('Write your clinical extraction strategy here...');
  await expect(editor).toHaveValue('Synthetic instructions.');
  await editor.fill('My uninterrupted draft');
  const timer=page.getByRole('region',{name:'Event countdown'});
  await expect(timer).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,900));
  await expect.poll(async()=> (await timer.boundingBox())!.y).toBeLessThan(20);
  await editor.focus();
  announcement='Please prepare your final prompt.';
  const notice=page.getByRole('complementary',{name:'New organizer announcement'});
  await expect(notice).toBeVisible({timeout:12000});
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('My uninterrupted draft');
  await notice.getByRole('button',{name:'Got it'}).click();
  await expect(notice).toHaveCount(0);
  await page.waitForTimeout(7500);
  await expect(notice).toHaveCount(0);
  announcement='Final submission opens in one minute.';
  endsAt=new Date(Date.now()+45000).toISOString();
  await expect(notice).toBeVisible({timeout:12000});
  await expect(timer).toContainText('Final minute');
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:950});
    await page.evaluate(()=>window.scrollTo(0,900));
    await expect.poll(async()=> (await timer.boundingBox())!.y).toBeLessThan(20);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`../notice-${width}.png`});
  }
  announcement=''; endsAt=new Date(Date.now()-1000).toISOString();
  await expect(notice).toHaveCount(0,{timeout:12000});
  await expect(timer).toContainText('Time is up');
  await expect(timer.getByRole('timer')).toHaveText('00:00');
  endsAt=null;
  await expect(timer).toHaveCount(0,{timeout:12000});
  await expect(editor).toHaveValue('My uninterrupted draft');
});
