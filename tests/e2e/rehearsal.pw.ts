import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Use only an isolated, freshly seeded synthetic database: this test spends attempts.
test("private deterministic participant and organizer rehearsal", async ({ page, context }) => {
  if (process.env.E2E_ALLOW_MUTATIONS !== "true") {
    throw new Error("Set E2E_ALLOW_MUTATIONS=true only for an isolated synthetic test event.");
  }
  const secretFile = process.env.ADMIN_SECRET_FILE;
  const accessFile = process.env.E2E_ACCESS_CODE_FILE;
  if (!secretFile || !accessFile) throw new Error("Protected admin/access-code files are required.");
  const adminSecret = readFileSync(secretFile, "utf8").trim();
  const accessCode = readFileSync(accessFile, "utf8").trim();
  const origin = process.env.E2E_BASE_URL || "http://localhost:3000";
  const writeHeaders = { Origin: origin };
  const health = await context.request.get("/api/health");
  expect(health.ok()).toBe(true);
  const unauthorized = await context.request.post("/api/admin/challenge-phase", {
    headers: writeHeaders, data: { phase: "practice_open" },
  });
  expect(unauthorized.status()).toBe(401);

  await page.goto("/admin");
  await page.getByLabel("Admin secret", { exact: true }).fill(adminSecret);
  const login = page.waitForResponse(r => r.url().endsWith("/api/admin/login"));
  await page.getByRole("button", { name: "Enter admin", exact: true }).click();
  expect((await login).ok()).toBe(true);
  await expect(page.getByLabel("Admin secret", { exact: true })).toHaveCount(0);
  const phase = await context.request.post("/api/admin/challenge-phase", {
    headers: writeHeaders, data: { phase: "practice_open" },
  });
  expect(phase.ok()).toBe(true);

  await page.goto("/");
  await page.getByLabel("Participant access code", { exact: true }).fill(accessCode);
  await page.getByRole("button", { name: "Enter workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/challenge$/);
  await page.getByPlaceholder("Write your clinical extraction strategy here...").fill(
    "Extract all specified clinical fields accurately. Return only valid JSON matching the supplied schema.",
  );
  const attempt = page.waitForResponse(r => r.url().endsWith("/api/submissions/public"));
  await page.getByRole("button", { name: "Use test attempt", exact: true }).click();
  expect((await attempt).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Submit final", exact: true })).toBeDisabled();

  const finalPhase = await context.request.post("/api/admin/challenge-phase", {
    headers: writeHeaders, data: { phase: "final_open" },
  });
  expect(finalPhase.ok()).toBe(true);
  await page.reload();
  await page.getByPlaceholder("Write your clinical extraction strategy here...").fill(
    "Extract all specified clinical fields accurately. Return only valid JSON matching the supplied schema.",
  );
  page.on("dialog", dialog => dialog.accept());
  const finalResponse = page.waitForResponse(r => r.url().endsWith("/api/submissions/final"));
  await page.getByRole("button", { name: "Submit final", exact: true }).click();
  const final = await finalResponse;
  expect(final.ok()).toBe(true);
  const result = await final.json();
  // Final evaluation must not expose per-report hidden data.
  expect(Object.keys(result)).not.toContain("results");
  expect(Object.keys(result)).not.toContain("reports");
  await page.reload();
  await expect(page.getByRole("button", { name: "Submit final", exact: true })).toBeDisabled();
  await page.goto("/display/leaderboard");
  await expect(page.locator("body")).toContainText(/leaderboard/i);
});
