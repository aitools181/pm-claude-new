import { describe, it, expect, beforeAll } from "vitest";
import { runRestore, InPlaceRestoreRefused } from "../src/restore.js";

const PRIMARY = "postgresql://pm:pw@primary-host:5432/pm_platform";
beforeAll(() => { process.env.DATABASE_URL = PRIMARY; });

describe("restore isolation guard", () => {
  it("refuses an in-place restore onto the live primary database", async () => {
    await expect(
      runRestore({ manifestPath: "/unused", targetDatabaseUrl: PRIMARY, isolatedObjectPrefix: "restore/x" }),
    ).rejects.toBeInstanceOf(InPlaceRestoreRefused);
  });

  it("refuses when only credentials differ but host+db are the primary", async () => {
    await expect(
      runRestore({ manifestPath: "/unused", targetDatabaseUrl: "postgresql://other:other@primary-host:5432/pm_platform", isolatedObjectPrefix: "restore/x" }),
    ).rejects.toBeInstanceOf(InPlaceRestoreRefused);
  });
});
