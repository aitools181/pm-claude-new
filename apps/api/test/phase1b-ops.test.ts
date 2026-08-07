import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let orgId: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  const [u] = await db.insert(schema.users).values({ email: "o@x.io", displayName: "Owner" }).returning();
  const [o] = await db.insert(schema.organizations).values({ name: "Org", slug: "org", createdBy: u.id }).returning();
  orgId = o.id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 1B — audit scope constraint", () => {
  it("allows an instance-scoped event with null organization_id", async () => {
    await expect(db.insert(schema.auditEvents).values({ scopeType: "instance", action: "system.boot" })).resolves.toBeDefined();
  });

  it("rejects an instance event that carries an organization_id", async () => {
    await expect(
      db.insert(schema.auditEvents).values({ scopeType: "instance", organizationId: orgId, action: "bad" }),
    ).rejects.toThrow();
  });

  it("rejects an organization event with a null organization_id", async () => {
    await expect(
      db.insert(schema.auditEvents).values({ scopeType: "organization", action: "bad" }),
    ).rejects.toThrow();
  });

  it("accepts a well-formed organization event", async () => {
    await expect(
      db.insert(schema.auditEvents).values({ scopeType: "organization", organizationId: orgId, action: "invitation.created" }),
    ).resolves.toBeDefined();
  });
});

describe("Phase 1B — invitations", () => {
  it("enforces one pending invitation per email per org", async () => {
    const base = { organizationId: orgId, email: "dup@x.io", roleKey: "member", expiresAt: new Date(Date.now() + 1e6) };
    await db.insert(schema.invitations).values({ ...base, tokenHash: "h1" });
    await expect(db.insert(schema.invitations).values({ ...base, tokenHash: "h2" })).rejects.toThrow();
  });
});
