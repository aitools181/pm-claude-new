import { test, expect } from "@playwright/test";
import { injectAxe, checkA11y } from "axe-playwright";
import { ensureLoggedIn } from "./helpers";

const referenceWidths = [320, 768, 1024, 1440] as const;

test("reference widths do not create page-level horizontal overflow", async ({ page }) => {
  await ensureLoggedIn(page);
  for (const width of referenceWidths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/home");
    await page.waitForLoadState("networkidle");
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(metrics.scrollWidth, `${width}px viewport must not horizontally overflow`).toBeLessThanOrEqual(metrics.clientWidth + 1);
  }
});

test("shared controls keep documented geometry and visible focus", async ({ page }) => {
  await ensureLoggedIn(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/settings/display");

  const controls = page.locator(".ui-input, .ui-select, .ui-textarea, .ui-button, .btn");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < Math.min(count, 30); i++) {
    const control = controls.nth(i);
    if (!(await control.isVisible().catch(() => false))) continue;
    const box = await control.boundingBox();
    if (!box) continue;
    expect(box.height, "interactive controls must not shrink below compact desktop size").toBeGreaterThanOrEqual(40);
  }

  const focusables = page.locator("input:not([type=hidden]), select, textarea, button");
  let firstFocusable = focusables.first();
  for (let i = 0; i < await focusables.count(); i++) {
    if (await focusables.nth(i).isVisible().catch(() => false)) { firstFocusable = focusables.nth(i); break; }
  }
  await firstFocusable.focus();
  const focusStyle = await firstFocusable.evaluate((node) => {
    const style = getComputedStyle(node);
    return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle, boxShadow: style.boxShadow };
  });
  expect(
    focusStyle.outlineStyle !== "none" && focusStyle.outlineWidth !== "0px" || focusStyle.boxShadow !== "none",
    "focused control should have a visible outline or focus shadow",
  ).toBeTruthy();
});

test("light and dark themes pass automated accessibility smoke checks", async ({ page }) => {
  await ensureLoggedIn(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  for (const mode of ["light", "dark"] as const) {
    await page.goto("/settings/display");
    const modeButton = page.getByRole("button", { name: mode, exact: true });
    await modeButton.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme-mode", mode);
    await injectAxe(page);
    await checkA11y(page, undefined, { detailedReport: false });
  }
});

test("keyboard navigation reaches main content and tabs expose current state", async ({ page }) => {
  await ensureLoggedIn(page);
  await page.goto("/my-tasks");
  await page.keyboard.press("Tab");
  const skip = page.locator(".skip-link");
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const tablist = page.getByRole("tablist", { name: "My tasks views" });
  await expect(tablist).toBeVisible();
  const selected = tablist.getByRole("tab", { selected: true });
  await expect(selected).toHaveCount(1);
});
