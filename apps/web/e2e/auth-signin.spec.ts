import { test, expect, type Page } from "@playwright/test";

/**
 * Regression cover for the 6.0 sign-in defects. These run against a stubbed API
 * so they need no database or running backend — unlike the other specs in this
 * folder, which assume the full compose stack.
 *
 * What broke, and what each test pins down:
 *  - Buttons defaulted to type="button", so clicking never submitted the form.
 *  - The submit button was disabled while React state for email/password was
 *    empty, which browser autofill leaves empty — so Enter did nothing either.
 */

const PREFS = {
  themeMode: "light", chromeTone: "black", colorPreset: "asana", homeBackground: "golden",
  density: "comfortable", locale: "en", defaultLanding: "/home", showRowNumbers: false,
  colorBlindMode: false, celebrations: true, inboxSummaryEnabled: true,
  inboxSummaryTimeframe: "week", navigationPreferences: {}, notificationPopupSeconds: 5,
  workspaceWeekStart: 1,
};

const STUB: Record<string, unknown> = {
  "/api/v1/ui/preferences": PREFS,
  "/api/v1/organizations/mine": [{ id: "11111111-1111-1111-1111-111111111111", name: "Acme", slug: "acme" }],
  "/api/v1/me/profile": { displayName: "Test User", email: "test@example.com" },
  "/api/v1/notifications/unread-count": { count: 0 },
};

type Seen = { method: string; path: string; body: string | null };

async function stubApi(page: Page): Promise<Seen[]> {
  const seen: Seen[] = [];
  await page.route("**/socket.io/**", (route) => route.abort());
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    seen.push({ method: route.request().method(), path, body: route.request().postData() });
    const body = STUB[path] !== undefined ? STUB[path] : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  return seen;
}

test("clicking Sign in submits the form", async ({ page }) => {
  const seen = await stubApi(page);
  await page.goto("/login");

  const button = page.getByRole("button", { name: "Sign in" });
  await expect(button).toBeEnabled();
  await expect(button).toHaveAttribute("type", "submit");

  await page.fill('input[name="email"]', "test@example.com");
  await page.fill('input[name="password"]', "correct-horse-battery");
  await button.click();

  await expect.poll(() => seen.some((r) => r.method === "POST" && r.path === "/api/v1/auth/login")).toBe(true);
  const login = seen.find((r) => r.path === "/api/v1/auth/login");
  expect(JSON.parse(login?.body ?? "{}")).toMatchObject({ email: "test@example.com", password: "correct-horse-battery" });
});

test("autofilled credentials submit even without a React change event", async ({ page }) => {
  const seen = await stubApi(page);
  await page.goto("/login");

  // Browser autofill writes to the DOM without firing React's onChange.
  await page.evaluate(() => {
    (document.querySelector('input[name="email"]') as HTMLInputElement).value = "autofill@example.com";
    (document.querySelector('input[name="password"]') as HTMLInputElement).value = "autofill-password";
  });
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect.poll(() => seen.some((r) => r.path === "/api/v1/auth/login")).toBe(true);
  expect(JSON.parse(seen.find((r) => r.path === "/api/v1/auth/login")?.body ?? "{}")).toMatchObject({
    email: "autofill@example.com", password: "autofill-password",
  });
});

test("Enter in the password field submits", async ({ page }) => {
  const seen = await stubApi(page);
  await page.goto("/login");
  await page.fill('input[name="email"]', "test@example.com");
  await page.fill('input[name="password"]', "correct-horse-battery");
  await page.press('input[name="password"]', "Enter");
  await expect.poll(() => seen.some((r) => r.path === "/api/v1/auth/login")).toBe(true);
});

test("submitting an empty form explains why instead of doing nothing", async ({ page }) => {
  const seen = await stubApi(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Enter your email and password.")).toBeVisible();
  expect(seen.some((r) => r.path === "/api/v1/auth/login")).toBe(false);
});

test("sign out is reachable from the rail, the sidebar and the account menu", async ({ page, context }) => {
  await stubApi(page);
  await context.addCookies([{ name: "pm_session", value: "e2e", url: "http://localhost:3000" }]);
  await page.goto("/home");

  await expect(page.locator('a[href="/logout"]')).toHaveCount(1);
  await expect(page.getByTestId("sidebar-sign-out")).toBeVisible();

  await page.locator("button.user-trigger").click();
  await expect(page.getByTestId("sign-out")).toBeVisible();
});

test("/logout revokes the session", async ({ page, context }) => {
  const seen = await stubApi(page);
  await context.addCookies([{ name: "pm_session", value: "e2e", url: "http://localhost:3000" }]);
  await page.goto("/logout");
  await expect.poll(() => seen.some((r) => r.method === "POST" && r.path === "/api/v1/auth/logout")).toBe(true);
});
