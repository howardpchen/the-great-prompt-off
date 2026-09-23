import {test, expect} from "@playwright/test";

test("complete matrix, latest/history synchronization, focus, and narrow screens", async ({page}) => {
  const fields = Array.from({length:12},(_,i)=>({key:`finding_${i+1}`,label:`Finding ${i+1}`,allowedValues:["present","absent"],type:"multiclass",weight:1}));
  const reports = Array.from({length:20},(_,i)=>({id:`report-${i+1}`,filename:`example-${100-i}.txt`,split:"public",text:`Fictional report ${i+1}. Layout-only synthetic example.`}));
  const comparisons = (historical:boolean) => reports.slice().reverse().map((r,index)=>({report:r.id,fields:fields.map((f,j)=>({field:f.key,expected:"present",actual:(index+j)%4===0 ? "absent":"present",correct:historical ? false : (index+j)%4!==0,noDecision:false}))}));
  let failHistory = false;
  let submitRequests = 0;
  await page.addInitScript(()=>{localStorage.setItem("great-prompt-off-participant-id","DEMO01");sessionStorage.setItem("great-prompt-off-participant-session-token","fixture-token");});
  await page.route("**/api/**",async route=>{
    const url=new URL(route.request().url());
    if(route.request().method()!=="GET" && url.pathname!=="/api/participants/validate") submitRequests++;
    let data:unknown;
    switch(url.pathname) {
      case "/api/participants/validate": data={valid:true,participantCode:"DEMO01",participantToken:"fixture-token",source:"supabase"};break;
      case "/api/challenge-data": data={source:"supabase",challenge:{id:"matrix-demo",title:"Synthetic feedback preview",eventPhase:"practice_open",leaderboardVisibility:"practice",eventAnnouncement:"",eventTimerEndsAt:null,eventTimerLabel:"",publicSubmissionLimit:5,finalSubmissionLimit:1},mode:{id:"demo",version:1,title:"Demo",fields,education:{version:1,pipeline:"structured-v1",systemPromptVersion:"clinical-extraction-v1",baselineInstructions:"Use explicit evidence.",evaluationMode:"simulation"}},reportCounts:{sample:0,public:20,private:77},participantCount:2};break;
      case "/api/challenge-reports": data={reports};break;
      case "/api/submissions/status": data={source:"supabase",publicSubmissionLimit:5,publicSubmissionsUsed:2,remainingPublicSubmissions:3,latestPublicScore:75,finalSubmissionUsed:false,finalScore:null};break;
      case "/api/leaderboard":data={visible:true,source:"supabase",rows:[]};break;
      case "/api/education-summary":data={simulated:true,baseline:{accuracy:0},hiddenBaseline:null};break;
      case "/api/sandbox":data={enabled:false,reports:[],job:null,inFlight:false,cooldownUntil:null,serverTime:new Date().toISOString()};break;
      case "/api/team-history": {
        const id=url.searchParams.get("submission");
        if(id) {
          if(failHistory) {await route.fulfill({status:503,json:{error:"unavailable"}});return;}
          const older=id==="older";
          data={attemptNumber:older?1:2,instructions:older?"Old instructions":"Use explicit evidence.",feedback:{kind:"public",score:older?0:75,correctFields:older?0:180,totalFields:240,reportCount:20,clinicalComparisons:comparisons(older)}};
        } else data={practice:[{id:"latest",attemptNumber:2,instructions:"Use explicit evidence.",score:75,correctFields:180,totalFields:240,reportCount:20,submittedAt:"2026-01-02T00:00:00Z"},{id:"older",attemptNumber:1,instructions:"Old instructions",score:0,correctFields:0,totalFields:240,reportCount:20,submittedAt:"2026-01-01T00:00:00Z"}],final:null};
        break;
      }
      default:throw new Error(`Unexpected API ${url.pathname}`);
    }
    await route.fulfill({json:data});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("/challenge");
  const matrix=page.getByRole("region",{name:"Results by report and finding",exact:true});
  await expect(page.getByText("Viewing public attempt 2 · 75%",{exact:true})).toBeVisible();
  await expect(matrix.getByRole("button")).toHaveCount(240);
  await expect(matrix.getByRole("button").filter({hasText:"✓"})).toHaveCount(180);
  await expect(matrix.getByRole("button").filter({hasText:"×"})).toHaveCount(60);
  if(process.env.MATRIX_PREVIEW_DIR) {
    await matrix.evaluate(element=>window.scrollTo(0,window.scrollY+element.getBoundingClientRect().top-90));
    await matrix.screenshot({path:`${process.env.MATRIX_PREVIEW_DIR}/matrix.png`});
  }
  const cell=matrix.getByRole("button",{name:/^Report 020, Finding 12:/});
  await cell.click();
  await expect(page.getByText("Fictional report 20.",{exact:false})).toBeVisible();
  await expect(page.locator('[id="public-feedback-example-81.txt-finding_12"]')).toBeFocused();
  for(const width of [768,390]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await cell.focus(); await cell.press("Enter");
    await expect(cell).toHaveAttribute("aria-pressed","true");
  }
  if(process.env.MATRIX_PREVIEW_DIR) await matrix.screenshot({path:`${process.env.MATRIX_PREVIEW_DIR}/matrix-mobile.png`});
  await page.getByText("Submission history",{exact:true}).click();
  await page.getByText(/^Practice 1 —/).click();
  await page.getByRole("button",{name:"View practice 1 results",exact:true}).click();
  await expect(page.getByText("Viewing public attempt 1 · 0%",{exact:true})).toBeVisible();
  await expect(matrix.getByRole("button").filter({hasText:"×"})).toHaveCount(240);
  await expect(page.getByPlaceholder("Write your clinical extraction strategy here...")).toHaveValue("Use explicit evidence.");
  await expect(page.getByRole("region",{name:"Public test results",exact:true})).toContainText("Score: 0%");
  failHistory=true;
  await page.getByText(/^Practice 2 —/).click();
  await page.getByRole("button",{name:"View practice 2 results",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"Could not load"})).toBeVisible();
  await expect(page.getByText("Viewing public attempt 1 · 0%",{exact:true})).toBeVisible();
  expect(submitRequests).toBe(0);
});
