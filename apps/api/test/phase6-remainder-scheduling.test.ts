import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { DependenciesService } from "../src/dependencies/dependencies.service.js";
import { SchedulingService } from "../src/scheduling/scheduling.service.js";
import { CascadeService } from "../src/scheduling/cascade.service.js";
import { BaselineService } from "../src/scheduling/baseline.service.js";

// A Monday, for deterministic working-day math.
let MON = new Date("2026-03-01T00:00:00Z"); while (MON.getUTCDay() !== 1) MON.setUTCDate(MON.getUTCDate() + 1);
const d = (n: number) => { const x = new Date(MON); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

describe("Phase 6-remainder — CPM (pure, no DB)", () => {
  const sched = new SchedulingService(null as any);
  it("computes critical path and slack over a diamond network", () => {
    const items = [
      { id: "A", key: "A", title: "A", parentId: null, startDate: d(0), dueDate: null, durationDays: 2, scheduleMode: "auto" },
      { id: "B", key: "B", title: "B", parentId: null, startDate: null, dueDate: null, durationDays: 3, scheduleMode: "auto" },
      { id: "C", key: "C", title: "C", parentId: null, startDate: null, dueDate: null, durationDays: 1, scheduleMode: "auto" },
      { id: "D", key: "D", title: "D", parentId: null, startDate: null, dueDate: null, durationDays: 2, scheduleMode: "auto" },
    ];
    const deps = [{ predecessorId: "A", successorId: "B", type: "finish_to_start" }, { predecessorId: "A", successorId: "C", type: "finish_to_start" }, { predecessorId: "B", successorId: "D", type: "finish_to_start" }, { predecessorId: "C", successorId: "D", type: "finish_to_start" }];
    const r = sched.compute({ items, deps, wd: [1, 2, 3, 4, 5], hol: new Set() });
    expect(r.schedule.A.critical).toBe(true);
    expect(r.schedule.B.critical).toBe(true);   // longer branch
    expect(r.schedule.D.critical).toBe(true);
    expect(r.schedule.C.critical).toBe(false);  // shorter branch has slack
    expect(r.schedule.C.slack).toBeGreaterThan(0);
    expect(r.criticalPath.sort()).toEqual(["A", "B", "D"]);
  });
});

describe("Phase 6-remainder — cascade + baselines (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService, deps: DependenciesService;
  let sched: SchedulingService, cascade: CascadeService, baseline: BaselineService;
  let orgId: string, owner: string, projId: string, A: string, B: string, C: string;

  const setSched = (id: string, start: string | null, due: string | null, mode = "auto", dur: number | null = null) =>
    db.update(schema.workItems).set({ startDate: start, dueDate: due, scheduleMode: mode, durationDays: dur }).where(eq(schema.workItems.id, id));

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
    deps = new DependenciesService(db); sched = new SchedulingService(db); cascade = new CascadeService(db, sched); baseline = new BaselineService(db);

    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); orgId = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: orgId, key: "task", name: "Task" }]);
    const [u] = await db.insert(schema.users).values({ email: "o@x.io", displayName: "o" }).returning(); owner = u.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: orgId, userId: owner });
    const w = await ws.create(orgId, owner, "W");
    const p = await projects.create(orgId, owner, { workspaceId: w.id, name: "P", keyPrefix: "P" }); projId = p.id;
    A = (await items.create(orgId, owner, { projectId: projId, title: "A" })).id;
    B = (await items.create(orgId, owner, { projectId: projId, title: "B" })).id;
    C = (await items.create(orgId, owner, { projectId: projId, title: "C" })).id;
    await setSched(A, d(0), d(1), "auto", 2);
    await setSched(B, d(2), d(4), "auto", 3);
    await setSched(C, d(5), d(6), "auto", 2);
    await deps.add(orgId, owner, A, B); await deps.add(orgId, owner, B, C);
  });
  afterAll(async () => { await pg?.stop(); });

  it("preview shows the cascade WITHOUT persisting", async () => {
    const before = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, B)))[0];
    const p = await cascade.preview(orgId, owner, A, d(5)); // push A five days later
    expect(p.changedCount).toBeGreaterThanOrEqual(2);       // A + B (+C) move
    const after = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, B)))[0];
    expect(after.startDate).toBe(before.startDate);          // nothing written
  });

  it("confirm applies the cascade; undo restores it exactly", async () => {
    const origB = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, B)))[0].startDate;
    const res = await cascade.confirm(orgId, owner, A, d(5));
    expect(res.applied).toBeGreaterThanOrEqual(2);
    const movedB = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, B)))[0].startDate;
    expect(movedB).not.toBe(origB);                          // B moved
    await cascade.undo(orgId, res.operationId!);
    const restoredB = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, B)))[0].startDate;
    expect(restoredB).toBe(origB);                           // restored
  });

  it("a manual successor is NOT moved but is flagged as a conflict", async () => {
    await setSched(B, d(2), d(4), "manual", 3);
    const p = await cascade.preview(orgId, owner, A, d(10));
    expect(p.conflicts).toBeGreaterThanOrEqual(1);
    expect(p.changes.some((c) => c.itemId === B && c.manualConflict)).toBe(true);
    await setSched(B, d(2), d(4), "auto", 3);
  });

  it("baseline variance reports slippage", async () => {
    const b = await baseline.capture(orgId, owner, projId, "v1");
    expect(b.capturedItems).toBe(3);
    await setSched(A, d(3), d(4), "auto", 2);                // slip A by 3 days
    const v = await baseline.variance(orgId, projId, b.id);
    const av = v.find((x) => x.itemId === A)!;
    expect(av.startVarianceDays).toBe(3);
  });
});
