import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { DataOpsService } from "../src/data-ops/data-ops.service.js";

describe("Phase 12 — data ops (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let items: WorkItemsService, ops: DataOpsService, org: string, u: string, projectId: string;
  const softDelete = (id: string, daysAgo = 0) => db.update(schema.workItems).set({ deletedAt: new Date(Date.now() - daysAgo * 86400000), deletedBy: u }).where(eq(schema.workItems.id, id));

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db); ops = new DataOpsService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "Acme", slug: "acme" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, u, "W"); projectId = (await projects.create(org, u, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("recycles, restores, permanently deletes, purges by retention and exports", async () => {
    const a = await items.create(org, u, { projectId, title: "Alpha" });
    await softDelete(a.id);
    expect((await ops.listRecycleBin(org)).length).toBe(1);
    await ops.restore(org, a.id);
    expect((await ops.listRecycleBin(org)).length).toBe(0);

    const b = await items.create(org, u, { projectId, title: "Beta" });
    await softDelete(b.id);
    await ops.permanentDelete(org, b.id);
    expect((await db.select().from(schema.workItems).where(eq(schema.workItems.id, b.id))).length).toBe(0);

    const c = await items.create(org, u, { projectId, title: "Gamma" });
    await expect(ops.permanentDelete(org, c.id)).rejects.toThrow();

    await ops.setRetention(org, { retentionDays: 30, autoPurge: true });
    const old = await items.create(org, u, { projectId, title: "Old" });
    const recent = await items.create(org, u, { projectId, title: "Recent" });
    await softDelete(old.id, 40); await softDelete(recent.id, 10);
    expect((await ops.purgeExpired(org)).purged).toBe(1);
    expect((await db.select().from(schema.workItems).where(eq(schema.workItems.id, old.id))).length).toBe(0);
    expect((await db.select().from(schema.workItems).where(eq(schema.workItems.id, recent.id))).length).toBe(1);

    const ex = await ops.exportOrg(org);
    expect(ex.counts.projects).toBe(1);
    expect(ex.data.workItems.length).toBe(ex.counts.workItems);
  });
});
