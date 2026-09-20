import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { test, expect, request, type Page, type BrowserContext, type Route } from "@playwright/test";
import { twelveBinaryTemplate } from "../../app/lib/contest-schema-fixtures";

async function login(page: Page, context: BrowserContext) {
  if (process.env.E2E_ALLOW_MUTATIONS !== "true") throw new Error("Explicit disposable fixture only.");
  await page.goto("/admin");
  await page.getByLabel("Admin secret").fill(readFileSync(process.env.ADMIN_SECRET_FILE!, "utf8").trim());
  await page.getByRole("button", { name: "Enter admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Run contest", exact: true })).toBeVisible();
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  return request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, Cookie: (await context.cookies()).map(c => `${c.name}=${c.value}`).join("; ") } });
}

test("selection failures cannot retarget route-bound drafts; writes own every refresh", async ({page, context}) => {
  const api=await login(page,context);
  const created=await api.post('/api/admin/contests',{data:{action:'create',title:'Synthetic targeting draft',schema:twelveBinaryTemplate,evaluationModel:'qwen/qwen3.5-9b',practiceBudget:5}});
  expect(created.ok()).toBe(true);const {contestId:id}=await created.json();
  const s=await(await api.get(`/api/admin/contest-schema?contestId=${id}`)).json();
  await page.goto(`/admin/contests/${id}`);
  const writes:Route[]=[];const reads:Route[]=[];
  await page.route('**/api/admin/contest-schema',r=>{writes.push(r);});
  await page.route('**/api/admin/contest-schema?*',r=>{reads.push(r);});
  await page.getByLabel('Contest title',{exact:true}).fill('Changed synthetic title');
  const save=page.getByRole('button',{name:'Save draft configuration',exact:true});
  await save.click();await expect.poll(()=>writes.length).toBe(1);
  expect(writes[0].request().postDataJSON().contestId).toBe(id);
  await expect(save).toBeDisabled();await expect(page.getByRole('button',{name:'Reload contest',exact:true})).toBeDisabled();
  await writes[0].fulfill({json:{ok:true}});await expect.poll(()=>reads.length).toBe(1);await expect(save).toBeDisabled();
  await reads[0].fulfill({json:{...s,revision:s.revision+1}});
  await expect(page.getByRole('status').last()).toContainText('Saved');
  await page.getByRole('button',{name:'Reload contest',exact:true}).click();await expect.poll(()=>reads.length).toBe(2);await expect(page.getByLabel('Contest title',{exact:true})).toBeDisabled();await expect(save).toBeDisabled();
  await reads[1].fulfill({json:{...s,contestId:'10000000-0000-4000-8000-000000000001'}});
  await expect(page.getByRole('status').last()).toContainText('mismatch');
  await page.getByLabel('Contest title',{exact:true}).fill('Another change');await save.click();await expect.poll(()=>writes.length).toBe(2);expect(writes[1].request().postDataJSON().contestId).toBe(id);
  await writes[1].fulfill({status:400,json:{error:'Contest changed; reload before saving.'}});await expect(page.getByRole('status').last()).toContainText('Contest changed');await api.dispose();
});

test("all DELETE verbs reject stale/missing context without changing either contest; async reads stay scoped", async ({page,context}) => {
  if (process.env.PGDATABASE !== "gpo_library_test" || process.env.USE_REAL_LLM !== "false") throw new Error("Synthetic database fixture only.");
  const api = await login(page,context);
  const db = new Pool({password:process.env.PGPASSWORD_FILE ? readFileSync(process.env.PGPASSWORD_FILE,"utf8").trim() : undefined});
  try {
    const contests = (await (await api.get("/api/admin/contests")).json()).contests.filter((c:{schema_ready:boolean}) => c.schema_ready);
    expect(contests.length).toBeGreaterThanOrEqual(2);
    const [a,b] = contests;
    const activate = async (id:string) => {
      const s = await (await api.get(`/api/admin/contest-schema?contestId=${id}`)).json();
      expect((await api.post("/api/admin/contests",{data:{action:"activate",contestId:id,expectedVersion:s.schema.version,expectedRevision:s.revision}})).ok()).toBe(true);
      return {"X-Contest-Id":id,"X-Contest-Version":String(s.schema.version)};
    };
    const seedSimulation = async (headers:Record<string,string>) => {
      const s = await (await api.get("/api/admin/contest-schema")).json();
      const response = await api.post("/api/admin/simulations/run",{headers,data:{modeId:s.schema.id,schemaVersion:s.schema.version,reportScope:"public",profileIds:["strong_all_fields"]}});
      expect(response.ok()).toBe(true);
      const {batchId} = await response.json();
      expect((await api.post("/api/admin/simulations/reference",{headers,data:{batchId,label:"Synthetic targeting regression"}})).ok()).toBe(true);
      return batchId as string;
    };
    const stale = await activate(a.id);
    await seedSimulation(stale);
    for (const url of ["/admin", "/admin/participants", "/admin/results", "/admin/analytics", "/admin/cases", "/admin/help", "/admin/simulations"]) {
      expect((await page.goto(url))?.ok()).toBe(true);
      await expect(page.locator("[data-active-contest]")).toHaveAttribute("data-active-contest",a.id);
    }
    const current = await activate(b.id);
    const batch = await seedSimulation(current);
    const tables = (await db.query<{tablename:string}>("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> 'schema_migrations' ORDER BY tablename")).rows;
    const fingerprint = async () => {
      const result: Record<string,string> = {};
      for (const {tablename} of tables) {
        if (!/^[a-z_]+$/.test(tablename)) throw new Error("Unexpected fixture table");
        result[tablename] = (await db.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]')) AS hash FROM public."${tablename}" t`)).rows[0].hash;
      }
      return result;
    };
    const before = await fingerprint();
    for (const headers of [stale, {}]) {
      for (const [url,confirmation] of [["/api/admin/simulations","CLEAR SIMULATIONS"],["/api/admin/simulations/reference","CLEAR REFERENCE"],[`/api/admin/simulations/${batch}`,batch]]) {
        expect((await api.delete(url,{headers,data:{confirmation}})).status()).toBe(409);
        expect(await fingerprint()).toEqual(before);
      }
    }
    for (const url of ["/api/admin/simulations","/api/admin/simulations/reference","/api/admin/simulations/analytics",`/api/admin/simulations/${batch}`,`/api/admin/simulations/compare?leftBatchId=${batch}&rightBatchId=${batch}`]) {
      expect((await api.get(url,{headers:stale})).status()).toBe(409);
    }
    const renderedStatus = await page.evaluate(async () => {
      const frame = document.querySelector<HTMLElement>("[data-active-contest]")!;
      return (await fetch("/api/admin/simulations",{method:"DELETE",headers:{"Content-Type":"application/json","X-Contest-Id":frame.dataset.activeContest!,"X-Contest-Version":frame.dataset.contestVersion!},body:JSON.stringify({confirmation:"CLEAR SIMULATIONS"})})).status;
    });
    expect(renderedStatus).toBe(409);
    expect(await fingerprint()).toEqual(before);
    for (const kind of ["public","final"]) {
      for (const contestId of ["", " ", "invalid"]) {
        expect((await api.post(`/api/submissions/${kind}`,{data:{participantCode:"P001",participantToken:"invalid-but-identity-validation-must-run-first",prompt:"Synthetic",contestId,schemaVersion:Number(current["X-Contest-Version"])}})).status()).toBe(400);
      }
    }
    expect(await fingerprint()).toEqual(before);
    // Positive controls prove the fence does not merely disable deletion.
    expect((await api.delete("/api/admin/simulations/reference",{headers:current,data:{confirmation:"CLEAR REFERENCE"}})).ok()).toBe(true);
    expect((await db.query("SELECT is_reference FROM simulation_batches WHERE id=$1",[batch])).rows[0].is_reference).toBe(false);
    expect((await api.delete(`/api/admin/simulations/${batch}`,{headers:current,data:{confirmation:batch}})).ok()).toBe(true);
    await seedSimulation(current);
    expect((await api.delete("/api/admin/simulations",{headers:current,data:{confirmation:"CLEAR SIMULATIONS"}})).ok()).toBe(true);
    expect((await db.query("SELECT count(*)::int n FROM simulation_batches WHERE challenge_id=$1",[b.id])).rows[0].n).toBe(0);
    expect((await db.query("SELECT count(*)::int n FROM simulation_batches WHERE challenge_id=$1 AND is_reference",[a.id])).rows[0].n).toBe(1);
  } finally { await db.end(); await api.dispose(); }
});
