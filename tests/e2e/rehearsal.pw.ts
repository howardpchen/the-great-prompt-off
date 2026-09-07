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
  page.on("dialog", dialog => dialog.accept());
  const health = await context.request.get("/api/health");
  expect(health.ok()).toBe(true);
  const legacyLogin = await context.request.get("/api/participants/validate");
  expect(legacyLogin.status()).toBe(405);
  const hostileWrite = await context.request.post("/api/admin/challenge-phase", {
    headers: { Origin: "https://untrusted.invalid" }, data: { phase: "practice_open" },
  });
  expect(hostileWrite.status()).toBe(403);
  const unauthorized = await context.request.post("/api/admin/challenge-phase", {
    headers: writeHeaders, data: { phase: "practice_open" },
  });
  expect(unauthorized.status()).toBe(401);

  await page.goto("/admin");
  await page.getByLabel("Admin secret", { exact: true }).fill(adminSecret);
  const login = page.waitForResponse(r => r.url().endsWith("/api/admin/login"));
  await page.getByRole("button", { name: "Enter admin", exact: true }).click();
  const loginResponse = await login;
  expect(loginResponse.ok()).toBe(true);
  expect(loginResponse.headers()["cache-control"]).toContain("no-store");
  const adminCookie = (await context.cookies()).find(cookie => cookie.name === "great-prompt-off-admin-session");
  expect(Boolean(adminCookie)).toBe(true);
  expect(adminCookie?.secure).toBe(true);
  expect(adminCookie?.httpOnly).toBe(true);
  expect(adminCookie?.sameSite).toBe("Strict");
  await expect(page.getByLabel("Admin secret", { exact: true })).toHaveCount(0);
  const phase = await context.request.post("/api/admin/challenge-phase", {
    headers: writeHeaders, data: { phase: "practice_open" },
  });
  expect(phase.ok()).toBe(true);

  await page.goto("/");
  await page.getByLabel("Participant access code", { exact: true }).fill(accessCode);
  await page.getByRole("button", { name: "Enter workspace", exact: true }).click();
  await expect(page).toHaveURL(/\/challenge$/);
  await expect(page.getByRole("heading", { name: "5 public test reports", exact: true })).toBeVisible();
  await page.getByPlaceholder("Write your clinical extraction strategy here...").fill(
    "Extract all specified clinical fields accurately. Return only valid JSON matching the supplied schema.",
  );
  const attempt = page.waitForResponse(r => r.url().endsWith("/api/submissions/public"));
  await page.getByRole("button", { name: "Use test attempt", exact: true }).first().click();
  expect((await attempt).ok()).toBe(true);
  await expect(page.getByRole("button", { name: "Submit final", exact: true }).first()).toBeDisabled();

  const finalPhase = await context.request.post("/api/admin/challenge-phase", {
    headers: writeHeaders, data: { phase: "final_open" },
  });
  expect(finalPhase.ok()).toBe(true);
  await page.reload();
  await page.getByPlaceholder("Write your clinical extraction strategy here...").fill(
    "Extract all specified clinical fields accurately. Return only valid JSON matching the supplied schema.",
  );
  const finalResponse = page.waitForResponse(r => r.url().endsWith("/api/submissions/final"));
  await page.getByRole("button", { name: "Submit final", exact: true }).first().click();
  const final = await finalResponse;
  expect(final.ok()).toBe(true);
  const result = await final.json();
  // Final evaluation must not expose per-report hidden data.
  expect(Object.keys(result)).not.toContain("results");
  expect(Object.keys(result)).not.toContain("reports");
  expect(Object.keys(result.feedback || {})).not.toContain("reportDetails");
  expect(Object.keys(result.feedback || {})).not.toContain("reportScores");
  expect(final.headers()["cache-control"]).toContain("no-store");
  await page.reload();
  await expect(page.getByRole("button", { name: "Submit final", exact: true }).first()).toBeDisabled();
  await page.goto("/display/leaderboard");
  await expect(page.locator("body")).toContainText(/leaderboard/i);
});
