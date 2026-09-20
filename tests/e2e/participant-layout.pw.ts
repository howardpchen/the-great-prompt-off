import { test, expect } from "@playwright/test";

// UI-only fixture: intercept every API request. No account, database or provider access.
const baseline = "Use explicit evidence. Distinguish absent findings from findings not mentioned.";
const fields = Array.from({ length: 12 }, (_, i) => ({key: `finding_${i+1}`, label: `Clinical finding ${i+1}`, type: "multiclass", description: "PRIVATE_INSTRUCTION_SENTINEL", allowedValues: ["absent", "present", "not_mentioned"], weight:1}));

test("participant layout, controls, drafts and feedback on desktop and mobile", async ({ page }) => {
  let phase = "practice_open";
  let used = 0;
  let submissionCount = 0;
  const status = () => ({source:"supabase",publicSubmissionLimit:5,publicSubmissionsUsed:used,remainingPublicSubmissions:5-used,latestPublicScore:used?75:null,finalSubmissionUsed:false,finalScore:null});
  await page.addInitScript(() => {
    localStorage.setItem("great-prompt-off-participant-id", "DEMO01");
    sessionStorage.setItem("great-prompt-off-participant-session-token", "synthetic-ui-session");
  });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if(path === "/api/participants/validate") data = {valid:true,participantCode:"DEMO01",participantToken:"synthetic-ui-session",source:"supabase"};
    else if(path === "/api/challenge-data") data = {source:"supabase",challenge:{id:"synthetic-ui-contest",title:"Synthetic Participant Workshop",eventPhase:phase,leaderboardVisibility:"practice",eventAnnouncement:"",eventTimerEndsAt:null,eventTimerLabel:"",evaluationModelDisplayName:"Fixed workshop model",publicSubmissionLimit:5,finalSubmissionLimit:1},mode:{id:"synthetic",version:1,title:"Synthetic",fields,education:{version:1,pipeline:"structured-v1",baselineInstructions:baseline,evaluationMode:"simulation"}},reportCounts:{sample:0,public:20,private:80},participantCount:50};
    else if(path === "/api/sandbox") data={enabled:false,reports:[],job:null,inFlight:false,cooldownUntil:null,serverTime:new Date().toISOString()};
    else if(path === "/api/challenge-reports") data = {reports:Array.from({length:20},(_,i)=>({id:`report-${i+1}`,filename:`synthetic-${i+1}`,label:`Practice report ${i+1}`,text:`SYNTHETIC REPORT ${i+1}\n\nFindings:\nThis fictional report is for layout verification only.\n\nImpression:\nNo clinical data is included.`}))};
    else if(path === "/api/submissions/status") data=status();
    else if(path === "/api/leaderboard") data={source:"supabase",visible:true,rows:[]};
    else if(path === "/api/education-summary") data={simulated:true,baseline:{accuracy:50},hiddenBaseline:null};
    else if(path === "/api/team-history") data={practice:[{id:"practice-1",attemptNumber:1,score:60,submittedAt:"2026-01-01T12:00:00Z",instructions:"Saved team strategy",correctFields:6,totalFields:12,reportCount:1}],final:null};
    else if(path === "/api/submissions/public") {submissionCount++; used++; data={...status(),kind:"public",evaluationMode:"mock",score:75,feedback:{kind:"public",score:75,correctFields:9,totalFields:12,reportCount:1,clinicalComparisons:[{report:"Practice report 1",fields:[{field:"finding_1",actual:"present",expected:"absent",correct:false,noDecision:false}]}]}};}
    else throw new Error(`Unexpected fixture API: ${path}`);
    await route.fulfill({json:data});
  });
  await page.setViewportSize({width:1440,height:1000});
  await page.goto("/challenge");
  const editor=page.getByPlaceholder("Write your clinical extraction strategy here...");
  await expect(editor).toHaveValue(baseline);
  if(process.env.UI_CAPTURE_BEFORE) {
    await page.screenshot({path:process.env.UI_CAPTURE_BEFORE,fullPage:true});
    return;
  }
  await expect(page.getByRole("heading",{name:"Synthetic Participant Workshop",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Use test attempt",exact:true})).toHaveCount(1);
  await expect(page.getByRole("button",{name:"Submit final",exact:true})).toBeDisabled();
  await expect(page.getByText("PRIVATE_INSTRUCTION_SENTINEL",{exact:false})).toHaveCount(0);
  const box=await editor.boundingBox(); expect(box!.width).toBeGreaterThan(600); expect(box!.y).toBeLessThan(650);
  if(process.env.UI_CAPTURE_AFTER) await page.screenshot({path:process.env.UI_CAPTURE_AFTER,fullPage:true});
  await page.getByRole("button",{name:"Read practice report 20",exact:true}).click();
  await expect(page.getByText("SYNTHETIC REPORT 20",{exact:false})).toBeVisible();
  await editor.fill(""); await expect(page.getByRole("button",{name:"Use test attempt",exact:true})).toBeDisabled();
  await editor.fill("My explicit clinical rules"); await page.reload(); await expect(editor).toHaveValue("My explicit clinical rules");
  page.on("dialog",d=>d.accept());
  await page.getByRole("button",{name:"Use test attempt",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Practice clinical feedback"})).toBeVisible(); expect(submissionCount).toBe(1);
  await page.getByText("Field names and allowed values",{exact:true}).click(); await expect(page.getByText("Clinical finding 12",{exact:true})).toBeVisible();
  await page.getByText("Shared baseline and scoring",{exact:true}).click();
  await page.getByRole("button",{name:"Copy baseline into editor",exact:true}).click(); await expect(editor).toHaveValue(baseline);
  await page.getByText("Team instruction history",{exact:true}).click();
  await page.getByText(/^Practice 1 —/).click();
  await page.getByRole("button",{name:"Copy practice 1 instructions to editor",exact:true}).click(); await expect(editor).toHaveValue("Saved team strategy");
  for(const width of [1280,1024,768,390]) {
    await page.setViewportSize({width,height:900}); await expect(editor).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  if(process.env.UI_CAPTURE_MOBILE) await page.screenshot({path:process.env.UI_CAPTURE_MOBILE,fullPage:true});
  for(const next of ["not_started","final_open","ended"]) {
    phase=next; await page.reload(); await expect(editor).toHaveValue("Saved team strategy");
    await expect(page.getByRole("button",{name:"Use test attempt",exact:true})).toBeDisabled();
    if(next==="final_open") await expect(page.getByRole("button",{name:"Submit final",exact:true})).toBeEnabled();
    else await expect(page.getByRole("button",{name:"Submit final",exact:true})).toBeDisabled();
  }
  expect(submissionCount).toBe(1);
});
