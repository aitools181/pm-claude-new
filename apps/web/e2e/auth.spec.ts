import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";

/**
 * Phase 1A E2E. Requires the full stack running (docker compose up) against a
 * FRESH database so first-run setup is available.
 */

test("login page renders and is accessible", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await injectAxe(page);
  await checkA11y(page, undefined, { detailedReport: false });
});

test("first-run setup completes and redirects to login", async ({ page }) => {
  await page.goto("/setup");
  const heading = page.getByRole("heading", { name: /set up your installation/i });
  // If setup is already done, the app routes elsewhere — skip gracefully.
  if (!(await heading.isVisible().catch(() => false))) test.skip(true, "Setup already completed");

  await injectAxe(page);
  await checkA11y(page, undefined, { detailedReport: false });

  const unique = Date.now();
  await page.getByLabel("Your name").fill("Ada Lovelace");
  await page.getByLabel("Email").fill(`admin${unique}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Organization name").fill("Acme Inc.");
  await page.getByLabel(/slug/i).fill("acme-inc");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("button", { name: /create and finish/i }).click();
  await expect(page).toHaveURL(/\/login/);
});
