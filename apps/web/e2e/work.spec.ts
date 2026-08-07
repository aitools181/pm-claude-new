import { test, expect } from "@playwright/test";
import { ensureLoggedIn } from "./helpers";

/** Create → add subtask → execute → complete slice. */
test("create a project, add a task and subtask, and complete the hierarchy", async ({ page }) => {
  await ensureLoggedIn(page);
  await page.goto("/projects");

  const wsCreate = page.getByRole("button", { name: "Create" });
  if (await page.getByText("Create your first workspace").isVisible().catch(() => false)) {
    await page.getByPlaceholder("Engineering").fill("Engineering");
    await wsCreate.click();
  }

  await page.getByPlaceholder("Platform").fill("Platform");
  await page.getByPlaceholder("ENG").fill("ENG");
  await page.getByRole("button", { name: "Create" }).last().click();

  await page.getByText("Platform").first().click();
  await expect(page).toHaveURL(/\/projects\//);

  const input = page.getByPlaceholder("Add a task and press Enter");
  await input.fill("Ship the MVP");
  await input.press("Enter");
  await expect(page.getByText("Ship the MVP")).toBeVisible();

  await page.getByText("Ship the MVP").click();
  const dialog = page.getByRole("dialog");
  const subtaskInput = dialog.getByPlaceholder("Add a subtask and press Enter");
  await subtaskInput.fill("Verify production checklist");
  await subtaskInput.press("Enter");
  await expect(dialog.getByText("Verify production checklist")).toBeVisible();

  await dialog.getByText("Verify production checklist").click();
  await dialog.getByRole("button", { name: "Mark complete" }).click();
  await dialog.getByRole("button", { name: "Back to parent task" }).click();
  await dialog.getByRole("button", { name: "Mark complete" }).click();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".row-complete.done")).toBeVisible();
});
