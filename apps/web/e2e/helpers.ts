import { Page, expect } from "@playwright/test";

export const ADMIN = { email: "admin@e2e.local", password: "correct-horse-battery", name: "E2E Admin", org: "E2E Org", slug: "e2e" };

/** Ensures we are logged in. Runs first-run setup with fixed creds if available. */
export async function ensureLoggedIn(page: Page) {
  await page.goto("/setup");
  const setupVisible = await page.getByRole("heading", { name: /set up your installation/i }).isVisible().catch(() => false);
  if (setupVisible) {
    await page.getByLabel("Your name").fill(ADMIN.name);
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Organization name").fill(ADMIN.org);
    await page.getByLabel(/slug/i).fill(ADMIN.slug);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: /create and finish/i }).click();
    await expect(page).toHaveURL(/\/login/);
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/home/);
}
