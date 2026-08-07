import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { GoalsService } from "../src/goals/goals.service.js";
import { computeProgress, leafProgress } from "../src/goals/goal-logic.js";

describe("Phase 9 — goal logic (pure)", () => {
  it("computes leaf + rollup progress", () => {
    const pct = leafProgress({ targetType: "percent", currentValue: 60, startValue: null, targetValue: null, confidence: "on_track", status: "active" });
    const num = leafProgress({ targetType: "numeric", startValue: 0, targetValue: 10, currentValue: 5, confidence: "on_track", status: "active" });
    expect(pct).toBe(60); expect(num).toBe(50);
    expect(computeProgress({ targetType: "rollup", startValue: null, targetValue: null, currentValue: null, confidence: "on_track", status: "active" }, { childProgress: [pct, num] })).toBe(55);
  });
});

describe("Phase 9 — goals (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let svc: GoalsService, projects: ProjectsService, items: WorkItemsService, ws: WorkspacesService;
  let org: string, owner: string, viewer: string, wsId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db); svc = new GoalsService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "o@x.io", displayName: "owner" }).returning(); owner = a.id;
    const [b] = await db.insert(schema.users).values({ email: "v@x.io", displayName: "viewer" }).returning(); viewer = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: owner }, { organizationId: org, userId: viewer }]);
    wsId = (await ws.create(org, owner, "W")).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("rolls up children, links to work, records check-ins, and redacts private links", async () => {
    const obj = await svc.create(org, owner, { name: "Obj", targetType: "rollup" });
    await svc.create(org, owner, { name: "KR1", parentId: obj.id, targetType: "percent", currentValue: 60 });
    await svc.create(org, owner, { name: "KR2", parentId: obj.id, targetType: "numeric", startValue: 0, targetValue: 10, currentValue: 5 });
    expect((await svc.list(org)).find((g) => g.id === obj.id)!.progress).toBe(55);

    const p = await projects.create(org, owner, { workspaceId: wsId, name: "P", keyPrefix: "P" });
    const i1 = await items.create(org, owner, { projectId: p.id, title: "a" }); const i2 = await items.create(org, owner, { projectId: p.id, title: "b" });
    await db.update(schema.workItems).set({ statusCategory: "done" }).where(eq(schema.workItems.id, i1.id));
    const wg = await svc.create(org, owner, { name: "Ship", targetType: "percent" });
    await svc.addLink(org, wg.id, "work_item", i1.id); await svc.addLink(org, wg.id, "work_item", i2.id);
    expect((await svc.list(org)).find((g) => g.id === wg.id)!.progress).toBe(50);

    await svc.checkIn(org, owner, obj.id, { confidence: "at_risk", note: "tight" });
    const d = await svc.get(org, owner, obj.id);
    expect(d.updates).toHaveLength(1); expect(d.goal.confidence).toBe("at_risk");

    const secret = await projects.create(org, owner, { workspaceId: wsId, name: "Secret", keyPrefix: "SEC" });
    await db.update(schema.projects).set({ privacy: "private" }).where(eq(schema.projects.id, secret.id));
    const rg = await svc.create(org, owner, { name: "Linked", targetType: "percent" });
    await svc.addLink(org, rg.id, "project", secret.id);
    expect((await svc.get(org, owner, rg.id)).links[0].redacted).toBe(false);
    const asViewer = await svc.get(org, viewer, rg.id);
    expect(asViewer.links[0].redacted).toBe(true); expect(asViewer.links[0].refId).toBeNull();
  });
});
