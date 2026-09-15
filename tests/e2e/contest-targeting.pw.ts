import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { test, expect, request, type Page, type BrowserContext, type Route } from "@playwright/test";
import { twelveBinaryTemplate } from "../../app/lib/contest-schema-fixtures";

async function login(page: Page, context: BrowserContext) {
  if (process.env.E2E_ALLOW_MUTATIONS !== "true") throw new Error("Explicit disposable fixture only.");
  await page.goto("/admin");
  await page.getByLabel("Admin secret").fill(readFileSync(process.env.ADMIN_SECRET_FILE!, "utf8").trim());
  await page.getByRole("button", { name: "Enter admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Contest Library", exact: true })).toBeVisible();
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  return request.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin, Cookie: (await context.cookies()).map(c => `${c.name}=${c.value}`).join("; ") } });
}

test("selection failures/out-of-order reads cannot expose old actions; writes own every refresh", async ({page, context}) => {
  const api = await login(page, context);
  const ids = ["10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002", "10000000-0000-4000-8000-000000000003"];
  const state = (id: string) => ({ contestId: id, revision: 1, schema: {...twelveBinaryTemplate, title: `Fixture ${ids.indexOf(id)}`, version: 1}, evaluationModel: "qwen/qwen3.5-9b", practiceBudget: 5, locked: false, ready: true, reports: [] });
  const reads: {id: string; route: Route}[] = [];
  const writes: Route[] = [];
  let automatic = true;
  await page.route("**/api/admin/contests", async route => {
    if (route.request().method() === "POST") { writes.push(route); return; }
    await route.fulfill({json:{contests:ids.map((id,i) => ({id,title:`Fixture ${i}`,is_active:i===0,report_count:0,submission_count:0}))}});
  });
  await page.route("**/api/admin/contest-schema", route => { writes.push(route); });
  await page.route("**/api/admin/contest-schema?*", async route => {
    const id = new URL(route.request().url()).searchParams.get("contestId")!;
    if (automatic) await route.fulfill({json:state(id)});
    else reads.push({id,route});
  });
  await page.reload();
  const select = page.getByLabel("Selected contest", {exact:true});
  const save = page.getByRole("button", {name:"Save selected contest settings (paused)",exact:true});
  await expect(save).toBeEnabled();
  automatic = false;
  await select.selectOption(ids[1]);
  await expect.poll(() => reads.length).toBe(1);
  await expect(save).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Archive selected contest",exact:true})).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await select.selectOption(ids[2]);
  await expect.poll(() => reads.length).toBe(2);
  await reads[1].route.fulfill({json:state(ids[2])});
  await expect(save).toBeEnabled();
  await reads[0].route.fulfill({json:state(ids[1])});
  await page.waitForLoadState("networkidle");
  await expect(select).toHaveValue(ids[2]);
  await expect(page.getByLabel("Contest title", {exact:true})).toHaveValue("Fixture 2");
  await select.selectOption(ids[1]);
  await expect.poll(() => reads.length).toBe(3);
  await reads[2].route.fulfill({status:503,json:{error:"Controlled selection failure"}});
  await expect(page.getByRole("status")).toContainText("Controlled selection failure");
  await expect(save).toHaveCount(0);
  expect(writes).toHaveLength(0);
  await select.selectOption(ids[0]);
  await expect.poll(() => reads.length).toBe(4);
  await reads[3].route.fulfill({json:state(ids[0])});
  await expect(save).toBeEnabled();
  await save.click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].request().postDataJSON().contestId).toBe(ids[0]);
  await expect(select).toBeDisabled();
  await writes[0].fulfill({json:{contestId:ids[0]}});
  await expect.poll(() => reads.length).toBe(5);
  await expect(select).toBeDisabled(); // includes post-mutation list/schema refresh
  await expect(save).toHaveCount(0);
  await reads[4].route.fulfill({json:{...state(ids[0]),revision:2}});
  await expect(select).toBeEnabled();
  await select.selectOption(ids[2]);
  await expect.poll(() => reads.length).toBe(6);
  await reads[5].route.fulfill({json:state(ids[2])});
  await expect(page.getByLabel("Contest title", {exact:true})).toHaveValue("Fixture 2");
  await save.click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].request().postDataJSON().contestId).toBe(ids[2]);
  await writes[1].fulfill({status:409,json:{error:"Controlled write failure"}});
  await expect(select).toBeEnabled();
  await expect(page.getByRole("status")).toContainText("Controlled write failure");
  await page.getByRole("button", {name:"Save schema as new draft version",exact:true}).click();
  await expect.poll(() => writes.length).toBe(3);
  expect(writes[2].request().postDataJSON().contestId).toBe(ids[2]);
  expect(writes[2].request().postDataJSON().action).toBe("schema");
  await writes[2].fulfill({json:{contestId:ids[2]}});
  await expect.poll(() => reads.length).toBe(7);
  await expect(select).toBeDisabled();
  await reads[6].route.fulfill({status:503,json:{error:"Controlled mutation refresh failure"}});
  await expect(select).toBeEnabled();
  await expect(save).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Controlled mutation refresh failure");
  await api.dispose();
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
