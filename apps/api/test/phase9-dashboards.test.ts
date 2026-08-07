import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { MetricService } from "../src/dashboards/metric.service.js";
import { DashboardService } from "../src/dashboards/dashboard.service.js";

describe("Phase 9 — dashboards & metrics (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let metrics: MetricService, dash: DashboardService, projects: ProjectsService, items: WorkItemsService;
  let org: string, owner: string, viewer: string, projectId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
    metrics = new MetricService(db); dash = new DashboardService(db, metrics);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "o@x.io", displayName: "owner" }).returning(); owner = a.id;
    const [b] = await db.insert(schema.users).values({ email: "v@x.io", displayName: "viewer" }).returning(); viewer = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: owner }, { organizationId: org, userId: viewer }]);
    const w = await ws.create(org, owner, "W"); projectId = (await projects.create(org, owner, { workspaceId: w.id, name: "A", keyPrefix: "A" })).id;
    const mk = async (done: boolean) => { const i = await items.create(org, owner, { projectId, title: "t" }); if (done) await db.update(schema.workItems).set({ statusCategory: "done" }).where(eq(schema.workItems.id, i.id)); };
    await mk(true); await mk(false); await mk(false);
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("computes, caches with freshness, and exposes the formula", async () => {
    expect((await metrics.compute(org, "work.done_ratio", { projectId })).value).toBe(33);
    const def = await metrics.createDefinition(org, { key: "done", name: "D", source: "work.done_ratio", params: { projectId } });
    const s1 = await metrics.snapshot(org, def.id, {});
    const s2 = await metrics.snapshot(org, def.id, {});
    expect(s1.cached).toBe(false); expect(s2.cached).toBe(true);
    expect(new Date(s2.computedAt).getTime()).toBe(new Date(s1.computedAt).getTime());
    expect(s2.formula.formula).toContain("done");
    const s3 = await metrics.snapshot(org, def.id, { force: true });
    expect(s3.cached).toBe(false);
  });

  it("drills a widget to authorised records only", async () => {
    const d = await dash.create(org, owner, { name: "Exec", visibility: "org", widgets: [{ id: "w2", type: "list", title: "Open", source: "work.open_count", params: { projectId } }] });
    expect((await dash.drill(org, owner, d.id, "w2")).authorizedCount).toBe(2);
    await db.update(schema.projects).set({ privacy: "private" }).where(eq(schema.projects.id, projectId));
    const viewerDrill = await dash.drill(org, viewer, d.id, "w2");
    expect(viewerDrill.total).toBe(2);
    expect(viewerDrill.authorizedCount).toBe(0); // private records hidden
  });
});
