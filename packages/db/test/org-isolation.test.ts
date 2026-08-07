import { describe, it, expect } from "vitest";
import { orgScope } from "../src/org-scope.js";
import { teams } from "../src/schema/index.js";

/**
 * Guard-level test: orgScope MUST refuse to build an unscoped query.
 * (Full DB-level cross-org negative tests use Testcontainers + real Postgres;
 *  see docs — those assert Org A cannot read Org B via API IDs/search/admin.)
 */
describe("organization isolation", () => {
  it("refuses to build a query without an organization id", () => {
    expect(() => orgScope(teams.organizationId, teams.deletedAt, "")).toThrow(
      /organizationId is required/,
    );
  });

  it("builds a scoped condition when organization id is present", () => {
    const cond = orgScope(teams.organizationId, teams.deletedAt, "org-123");
    expect(cond).toBeDefined();
  });
});
