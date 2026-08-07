import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { AgileMetricsService } from "../src/agile/metrics.service.js";
import { ReleaseService } from "../src/agile/release.service.js";

describe("Phase 8 — releases + charts (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let items: WorkItemsService, metrics: AgileMetricsService, releases: ReleaseService;
  let org: string, u: string, projectId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db);
    metrics = new AgileMetricsService(db); releases = new ReleaseService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, u, "W"); projectId = (await projects.create(org, u, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("release notes trace to included work items; published releases lock", async () => {
    const A = await items.create(org, u, { projectId, title: "Login fix" });
    const rel = await releases.create(org, projectId, { name: "v1", version: "1.0.0" });
    await releases.addItem(org, rel.id, A.id);
    const notes = await releases.notes(org, rel.id);
    expect(notes.itemKeys).toContain(A.key);
    expect(notes.generated).toContain(A.key);
    await releases.publish(org, rel.id);
    await expect(releases.addItem(org, rel.id, A.id)).rejects.toThrow();
  });

  it("status transitions record history and yield cycle/lead time", async () => {
    const X = await items.create(org, u, { projectId, title: "X" });
    const v0 = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, X.id)))[0];
    await items.update(org, X.id, u, v0.version, { status: "In Progress" });
    const v1 = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, X.id)))[0];
    await items.update(org, X.id, u, v1.version, { status: "Done" });
    const created = new Date(v0.createdAt as unknown as Date).getTime();
    for (const h of await db.select().from(schema.workItemStatusHistory).where(eq(schema.workItemStatusHistory.workItemId, X.id))) {
      await db.update(schema.workItemStatusHistory).set({ at: new Date(created + (h.toCategory === "in_progress" ? 1 : 3) * 3600_000) }).where(eq(schema.workItemStatusHistory.id, h.id));
    }
    const clt = await metrics.cycleLeadTime(org, projectId);
    expect(clt.avgLeadHours).toBe(3);
    expect(clt.avgCycleHours).toBe(2);
  });
});
