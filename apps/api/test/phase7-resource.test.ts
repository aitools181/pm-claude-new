import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ResourceService } from "../src/resource/resource.service.js";
import { computeCapacity } from "../src/resource/capacity-core.js";

let MON = new Date("2026-03-01T00:00:00Z"); while (MON.getUTCDay() !== 1) MON.setUTCDate(MON.getUTCDate() + 1);
const d = (n: number) => { const x = new Date(MON); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

describe("Phase 7 — resource capacity (pure)", () => {
  it("keeps calendar, leave and unestimated work separate", () => {
    const c = computeCapacity({ workingDays: 4, holidayDays: 1, hoursPerDay: 8, leaveDays: 1, allocations: [{ percent: 50, workingDays: 4 }], estimatedWorkMin: 300, unestimatedItems: 1 });
    expect(c.grossCapacityMin).toBe(1920);
    expect(c.netCapacityMin).toBe(1440);   // gross - leave
    expect(c.allocatedMin).toBe(960);
    expect(c.holidayDays).toBe(1);
    expect(c.estimatedWorkMin).toBe(300);
    expect(c.unestimatedItems).toBe(1);    // reported separately
  });
});

describe("Phase 7 — resource workload (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>, svc: ResourceService;
  let org: string, u: string;
  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db), items = new WorkItemsService(db);
    svc = new ResourceService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const [cal] = await db.insert(schema.workingCalendars).values({ organizationId: org, name: "D", workingDays: [1, 2, 3, 4, 5], isDefault: true }).returning();
    await db.insert(schema.holidays).values({ organizationId: org, calendarId: cal.id, date: d(2), name: "H" });
    await svc.setProfile(org, u, { hoursPerDay: 8 });
    await svc.createLeave(org, u, { startDate: d(3), endDate: d(3) });
    const w = await ws.create(org, u, "W"); const p = await projects.create(org, u, { workspaceId: w.id, name: "P", keyPrefix: "P" });
    await svc.createAllocation(org, { userId: u, projectId: p.id, startDate: d(0), endDate: d(4), percent: 50 });
    const e = (await items.create(org, u, { projectId: p.id, title: "e" })).id;
    const n = (await items.create(org, u, { projectId: p.id, title: "n" })).id;
    await db.update(schema.workItems).set({ startDate: d(1), dueDate: d(1), estimateMinutes: 300 }).where(eq(schema.workItems.id, e));
    await db.update(schema.workItems).set({ startDate: d(1), dueDate: d(1) }).where(eq(schema.workItems.id, n));
    await db.insert(schema.workItemAssignees).values([{ organizationId: org, workItemId: e, userId: u }, { organizationId: org, workItemId: n, userId: u }]);
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("computes workload from calendar, leave, allocation and assigned work", async () => {
    const wl = await svc.workload(org, u, d(0), d(6));
    expect(wl.workingDays).toBe(4);       // 5 weekdays - 1 holiday
    expect(wl.holidayDays).toBe(1);
    expect(wl.leaveDays).toBe(1);
    expect(wl.netCapacityMin).toBe(1440);
    expect(wl.allocatedMin).toBe(960);
    expect(wl.estimatedWorkMin).toBe(300);
    expect(wl.unestimatedItems).toBe(1);
  });
});
