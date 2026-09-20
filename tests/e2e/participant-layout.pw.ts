import { test, expect } from "@playwright/test";

// UI-only fixture: intercept every API request. No account, database or provider access.
const baseline = "Use explicit evidence. Distinguish absent findings from findings not mentioned.";
const fields = Array.from({ length: 12 }, (_, i) => ({key: `finding_${i+1}`, label: `Clinical finding ${i+1}`, type: "multiclass", description: "REFERENCE_DEFINITION_NOT_PROMPTED", allowedValues: ["absent", "present", "not_mentioned"], weight:1}));

for (const systemPromptVersion of [undefined, "clinical-extraction-v1"] as const) {
test(`participant layout, controls, drafts and feedback (${systemPromptVersion ?? "historical"})`, async ({ page }) => {
  let phase = "practice_open";
  let used = 0;
  let submissionCount = 0;
  let finalCount = 0;
  let sandboxCount = 0;
  const samples = Array.from({length:3}, (_,i)=>({id:`sample-${i}`, text:`Fictional editable sample ${i+1}.`}));
  let job: null | { id:string; schema_version:number; reports: typeof samples; prompt:string; results:unknown[]; status:string; simulation:boolean } = null;
  const status = () => ({source:"supabase",publicSubmissionLimit:5,publicSubmissionsUsed:used,remainingPublicSubmissions:5-used,latestPublicScore:used?75:null,finalSubmissionUsed:false,finalScore:null});
  await page.addInitScript(() => {
    localStorage.setItem("great-prompt-off-participant-id", "DEMO01");
    sessionStorage.setItem("great-prompt-off-participant-session-token", "synthetic-ui-session");
  });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if(path === "/api/participants/validate") data = {valid:true,participantCode:"DEMO01",participantToken:"synthetic-ui-session",source:"supabase"};
    else if(path === "/api/challenge-data") data = {source:"supabase",challenge:{id:"synthetic-ui-contest",title:"Synthetic Participant Workshop",eventPhase:phase,leaderboardVisibility:"practice",eventAnnouncement:"",eventTimerEndsAt:null,eventTimerLabel:"",evaluationModelDisplayName:"Fixed workshop model",publicSubmissionLimit:5,finalSubmissionLimit:1},mode:{id:"synthetic",version:1,title:"Synthetic",fields,education:{version:1,pipeline:"structured-v1",systemPromptVersion,baselineInstructions:baseline,evaluationMode:"simulation"}},reportCounts:{sample:0,public:20,private:80},participantCount:50};
    else if(path === "/api/sandbox") {
      if(route.request().method()==="POST") {
        sandboxCount++;
        const body=route.request().postDataJSON();
        expect(body.prompt).toBe("My explicit clinical rules");
        job={id:"synthetic-job",schema_version:1,reports:body.reports,prompt:body.prompt,results:body.reports.map((r:{id:string})=>({reportId:r.id,status:"completed",decisions:Object.fromEntries(fields.map(f=>[f.key,{status:"decision",value:"present"}]))})),status:"completed",simulation:true};
      }
      data={enabled:true,reports:samples,job,inFlight:false,cooldownUntil:job?new Date(Date.now()+60000).toISOString():null,serverTime:new Date().toISOString()};
    }
    else if(path === "/api/challenge-reports") data = {reports:Array.from({length:20},(_,i)=>({id:`report-${i+1}`,filename:i===0?"fictional-942.txt":i===1?"fictional-017.txt":`synthetic-${i+1}`,label:`Practice report ${i+1}`,text:`SYNTHETIC REPORT ${i+1}\n\nFindings:\nThis fictional report is for layout verification only.\n\nImpression:\nNo clinical data is included.`}))};
    else if(path === "/api/submissions/status") data=status();
    else if(path === "/api/leaderboard") data={source:"supabase",visible:true,rows:[]};
    else if(path === "/api/education-summary") data={simulated:true,baseline:{accuracy:50},hiddenBaseline:null};
    else if(path === "/api/team-history") data={practice:[{id:"practice-1",attemptNumber:1,score:60,submittedAt:"2026-01-01T12:00:00Z",instructions:"Saved team strategy",correctFields:6,totalFields:12,reportCount:1}],final:null};
    else if(path === "/api/submissions/public") {expect(route.request().postDataJSON().prompt).toBe("My explicit clinical rules"); submissionCount++; used++; data={...status(),kind:"public",evaluationMode:"mock",score:75,feedback:{kind:"public",score:75,correctFields:9,totalFields:12,reportCount:1,clinicalComparisons:[{report:"fictional-017.txt",fields:[{field:"finding_1",actual:"absent",expected:"absent",correct:true,noDecision:false}]},{report:"fictional-942.txt",fields:[{field:"finding_1",actual:"present",expected:"absent",correct:false,noDecision:false}]}]}};}
    else if(path === "/api/submissions/final") {finalCount++;data={...status(),finalSubmissionUsed:true,resultsHidden:true,kind:"final",evaluationMode:"mock",score:0};}
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
  await expect(page.getByRole("complementary", {name:"Findings and allowed values"})).toBeVisible();
  await page.getByText("Clinical finding 1",{exact:true}).click();
  await expect(page.getByText("REFERENCE_DEFINITION_NOT_PROMPTED",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("complementary",{name:"Findings and allowed values"}).getByText("absent · present · not mentioned",{exact:false}).first()).toBeVisible();
  await expect(editor).toHaveValue(baseline);
  const positions = await page.evaluate(() => ['write','debug','evaluate','final'].map(id => document.getElementById(id)!.getBoundingClientRect().top));
  expect(positions).toEqual([...positions].sort((a,b)=>a-b));
  const definitionBox = await page.getByRole("complementary",{name:"Findings and allowed values"}).boundingBox();
  expect(definitionBox!.x).toBeGreaterThan((await editor.boundingBox())!.x);
  const box=await editor.boundingBox(); expect(box!.width).toBeGreaterThan(600); expect(box!.y).toBeLessThan(800);
  if(process.env.UI_CAPTURE_AFTER) await page.screenshot({path:process.env.UI_CAPTURE_AFTER,fullPage:true});
  await page.getByRole("button",{name:"Read practice report 20",exact:true}).click();
  await expect(page.getByText("SYNTHETIC REPORT 20",{exact:false})).toBeVisible();
  await editor.fill(""); await expect(page.getByRole("button",{name:"Use test attempt",exact:true})).toBeDisabled();
  await editor.fill("My explicit clinical rules"); await page.reload(); await expect(editor).toHaveValue("My explicit clinical rules");
  const sandbox=page.getByRole("region",{name:"Prompt Sandbox"});
  await sandbox.getByLabel("Editable sample 1").fill("Edited fictional example");
  await sandbox.getByRole("button",{name:"Run sandbox · 3 reports",exact:true}).click();
  await expect(sandbox.getByRole("button",{name:/Ready in/})).toBeDisabled();
  await expect(sandbox.getByText("present",{exact:true})).toHaveCount(12);
  expect(sandboxCount).toBe(1); expect(submissionCount).toBe(0);
  await editor.fill("Different instructions");
  await expect(sandbox.getByText("Results belong to an earlier schema, prompt or sample draft.")).toBeVisible();
  await editor.fill("My explicit clinical rules");
  page.on("dialog",d=>d.accept());
  await page.getByRole("button",{name:"Use test attempt",exact:true}).click();
  await page.getByRole("combobox", {name:"Review report results"}).selectOption({label:"Report 001 · 0/1 correct"});
  await expect(page.getByText("SYNTHETIC REPORT 1\n",{exact:false})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Practice clinical feedback"})).toBeVisible(); expect(submissionCount).toBe(1);
  const results = page.getByRole("region",{name:"Public test results",exact:true});
  await expect(results.locator("summary").filter({hasText:/^Report 001$/})).toBeVisible();
  await expect(results.getByText("fictional-942.txt",{exact:false})).toHaveCount(0);
  const options=await page.getByRole("combobox",{name:"Review report results"}).locator("option:not([disabled])").allTextContents();
  expect(options).toEqual(["Report 001 · 0/1 correct","Report 002 · 1/1 correct"]);
  await page.getByRole("combobox",{name:"Review report results"}).selectOption({label:"Report 002 · 1/1 correct"});
  await expect(page.getByText("SYNTHETIC REPORT 2\n",{exact:false})).toBeVisible();
  await expect(results.locator("summary").filter({hasText:/^Report 002$/})).toBeVisible();
  await page.getByRole("button",{name:"Read practice report 1",exact:true}).click();
  await expect(results.locator("summary").filter({hasText:/^Report 001$/})).toBeVisible();
  await expect(page.getByRole("complementary",{name:"Findings and allowed values"}).getByText("Clinical finding 12",{exact:true})).toBeVisible();
  await editor.fill("Revised since scored run");
  await expect(page.getByText("Your prompt has changed since this scored result.",{exact:false})).toBeVisible();
  await expect(page.getByLabel("Shared baseline text")).toBeVisible();
  await expect(page.getByLabel("System message", {exact:true})).toBeHidden();
  await page.getByText("View system message", {exact:true}).click();
  await expect(page.getByLabel("System message", {exact:true})).toContainText(systemPromptVersion ? "You are the extraction engine" : "Extract clinical field decisions");
  await expect(page.getByLabel("System message", {exact:true})).toContainText("finding_12");
  await expect(page.getByLabel("System message", {exact:true})).not.toContainText("PRIVATE_INSTRUCTION_SENTINEL");
  await page.getByText("Output format · explanation and example", {exact:true}).click();
  await expect(page.getByText("The format controls structure rather than clinical interpretation.", {exact:true})).toBeVisible();
  await expect(page.getByLabel("Output format example")).toBeHidden();
  await page.getByText("View JSON example", {exact:true}).click();
  const example = JSON.parse(await page.getByLabel("Output format example").innerText());
  expect(example.finding_1).toEqual({status:"decision",value:"absent"});
  await page.getByRole("button",{name:"Copy baseline into editor",exact:true}).click(); await expect(editor).toHaveValue(baseline);
  await page.getByText("Team instruction history",{exact:true}).click();
  await page.getByText(/^Practice 1 —/).click();
  await page.getByRole("button",{name:"Copy practice 1 instructions to editor",exact:true}).click(); await expect(editor).toHaveValue("Saved team strategy");
  for(const width of [1280,1024,768,390]) {
    await page.setViewportSize({width,height:900}); await expect(editor).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  }
  await page.getByRole("button",{name:"Show allowed values",exact:true}).click();
  await expect(page.getByRole("complementary",{name:"Findings and allowed values"}).getByText("Clinical finding 12",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Hide allowed values",exact:true}).click();
  await expect(page.getByRole("complementary",{name:"Findings and allowed values"}).getByText("Clinical finding 12",{exact:true})).toBeHidden();
  if(process.env.UI_CAPTURE_MOBILE) await page.screenshot({path:process.env.UI_CAPTURE_MOBILE,fullPage:true});
  for(const next of ["not_started","final_open","ended"]) {
    phase=next; await page.reload(); await expect(editor).toHaveValue("Saved team strategy");
    await expect(page.getByRole("button",{name:"Use test attempt",exact:true})).toBeDisabled();
    if(next==="final_open") {
      await expect(page.getByRole("button",{name:"Submit final",exact:true})).toBeEnabled();
      await page.getByRole("button",{name:"Submit final",exact:true}).click();
      await expect(page.getByRole("region",{name:"Final submission",exact:true}).getByText("Final instructions locked",{exact:false})).toBeVisible();
      await expect(page.getByRole("button",{name:"Submit final",exact:true})).toBeDisabled();
      expect(finalCount).toBe(1);
    }
    else await expect(page.getByRole("button",{name:"Submit final",exact:true})).toBeDisabled();
  }
  expect(submissionCount).toBe(1);
});

}
