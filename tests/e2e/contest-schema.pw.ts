import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
test("administrator configures mixed fields and imports answers; participant sees typed contract", async ({
  page,
  context,
}) => {
  if (process.env.E2E_ALLOW_MUTATIONS !== "true")
    throw new Error("Only run against an isolated synthetic test contest.");
  const file = process.env.ADMIN_SECRET_FILE;
  if (!file) throw new Error("Protected fixture credential file required.");
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  const headers = { Origin: origin };
  expect(
    (await context.request.get("/api/admin/contest-schema")).status(),
  ).toBe(401);
  expect(
    (
      await context.request.post("/api/admin/contest-schema", {
        headers: { Origin: "https://untrusted.invalid" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin");
  await page.getByLabel("Admin secret").fill(readFileSync(file, "utf8").trim());
  await page.getByRole("button", { name: "Enter admin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Contest fields and answer keys" }),
  ).toBeVisible();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", {
      name: "Create new contest version (preserve old scores)",
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Save schema as new draft version" }),
  ).toBeEnabled();
  await expect(page.getByLabel("Key", { exact: true })).toHaveCount(12);
  await page.getByRole("button", { name: "Add field (maximum 64)" }).click();
  await expect(page.getByLabel("Key", { exact: true })).toHaveCount(13);
  await page
    .getByRole("button", { name: "Remove field", exact: true })
    .last()
    .click();
  await expect(page.getByLabel("Key", { exact: true })).toHaveCount(12);
  await page
    .getByLabel("Absolute tolerance", { exact: true })
    .first()
    .fill("1.25");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/contest-schema") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Save schema as new draft version" })
    .click();
  expect((await saved).ok()).toBe(true);
  const state = await (
    await context.request.get("/api/admin/contest-schema")
  ).json();
  expect(state.schema.fields[10].tolerance).toBe(1.25);
  expect(state.ready).toBe(false);
  const answers = state.reports.map((r: { id: string }) => ({
    report_id_or_filename: r.id,
    answer_values: Object.fromEntries(
      state.schema.fields.map(
        (f: { key: string; type: string; allowedValues: string[] }) => [
          f.key,
          f.type === "number" ? 10 : f.allowedValues[0],
        ],
      ),
    ),
  }));
  await page
    .getByRole("textbox", { name: /Answer keys JSON/ })
    .fill(JSON.stringify(answers));
  const imported = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/contest-schema") &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Validate and import all answers" })
    .click();
  expect((await imported).ok()).toBe(true);
  expect(
    (await (await context.request.get("/api/admin/contest-schema")).json())
      .ready,
  ).toBe(true);
  const pub = await (await context.request.get("/api/challenge-data")).json();
  expect(pub.mode.fields).toHaveLength(12);
  expect(JSON.stringify(pub)).not.toContain("answer_values");
  expect(JSON.stringify(pub)).not.toContain("report_text");
  const accessFile = process.env.E2E_ACCESS_CODE_FILE;
  if (!accessFile) throw new Error("Protected participant fixture required.");
  await page.goto("/");
  await page
    .getByLabel("Participant access code", { exact: true })
    .fill(readFileSync(accessFile, "utf8").trim());
  await page
    .getByRole("button", { name: "Enter workspace", exact: true })
    .click();
  await expect(page.getByText(/Number in mm; tolerance ±1.25/)).toBeVisible();
  await page.goto("/admin/cases");
  await expect(
    page.getByRole("heading", { name: "Case Manager", exact: true }),
  ).toBeVisible();
  expect(
    (
      await context.request.post("/api/admin/contest-schema", {
        headers,
        data: {
          action: "schema",
          contestId: state.contestId,
          expectedVersion: 0,
          schema: state.schema,
        },
      })
    ).status(),
  ).toBe(400);
});
