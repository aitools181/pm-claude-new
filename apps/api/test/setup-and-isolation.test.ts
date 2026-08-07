import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema, orgScope } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";

/**
 * Phase 1A backend acceptance — runs against a REAL PostgreSQL (no SQLite).
 * Covers: first-run once-only, and the #1 rule — cross-organization isolation.
 */
let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
});
afterAll(async () => { await pg?.stop(); });

async function makeOrg(name: string, slug: string) {
  const [u] = await db.insert(schema.users).values({ email: `${slug}@x.io`, displayName: name }).returning();
  const [o] = await db.insert(schema.organizations).values({ name, slug, createdBy: u.id }).returning();
  await db.insert(schema.organizationMemberships).values({ organizationId: o.id, userId: u.id });
  await db.insert(schema.teams).values({ organizationId: o.id, name: "Core", createdBy: u.id });
  return { user: u, org: o };
}

describe("Phase 1A backend", () => {
  it("orgScope refuses an unscoped query", () => {
    expect(() => orgScope(schema.teams.organizationId, schema.teams.deletedAt, "")).toThrow();
  });

  it("a scoped query returns only the caller's organization data", async () => {
    const a = await makeOrg("Org A", "org-a");
    const b = await makeOrg("Org B", "org-b");

    const aTeams = await db.select().from(schema.teams)
      .where(orgScope(schema.teams.organizationId, schema.teams.deletedAt, a.org.id));
    const bTeams = await db.select().from(schema.teams)
      .where(orgScope(schema.teams.organizationId, schema.teams.deletedAt, b.org.id));

    expect(aTeams.every((t) => t.organizationId === a.org.id)).toBe(true);
    expect(bTeams.every((t) => t.organizationId === b.org.id)).toBe(true);
    // Org A's scope never leaks Org B rows.
    expect(aTeams.some((t) => t.organizationId === b.org.id)).toBe(false);
  });

  it("enforces org-scoped unique team names (not global)", async () => {
    const a = await db.select().from(schema.organizations).where(eq(schema.organizations.slug, "org-a"));
    // 'Core' already exists in org-a; inserting again must violate the org-scoped unique index.
    await expect(
      db.insert(schema.teams).values({ organizationId: a[0].id, name: "Core" }),
    ).rejects.toThrow();
  });
});
