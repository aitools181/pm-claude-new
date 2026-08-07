import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { BacklogService } from "../src/agile/backlog.service.js";
import { SprintService } from "../src/agile/sprint.service.js";
import { AgileMetricsService } from "../src/agile/metrics.service.js";

describe("Phase 8 — sprint lifecycle & metrics (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let backlog: BacklogService, sprints: SprintService, metrics: AgileMetricsService, items: WorkItemsService;
  let org: string, u: string, projectId: string, A: string, B: string, C: string;
  const done = (id: string) => db.update(schema.workItems).set({ statusCategory: "done" }).where(eq(schema.workItems.id, id));

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db);
    backlog = new BacklogService(db); sprints = new SprintService(db); metrics = new AgileMetricsService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, u, "W"); projectId = (await projects.create(org, u, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
    const mk = async (t: string, p: number) => { const i = await items.create(org, u, { projectId, title: t }); await backlog.setPoints(org, i.id, p); return i.id; };
    A = await mk("A", 3); B = await mk("B", 5); C = await mk("C", 2);
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("preserves committed baseline, scope history, carry-over and a frozen report", async () => {
    const s = await sprints.create(org, projectId, { name: "S1" });
    await sprints.addItem(org, u, s.id, A); await sprints.addItem(org, u, s.id, B);
    const started = await sprints.start(org, s.id);
    expect(started.committedPoints).toBe(8);

    await sprints.addItem(org, u, s.id, C); // scope change after start
    const sprintNow = (await db.select().from(schema.sprints).where(eq(schema.sprints.id, s.id)))[0];
    expect(sprintNow.committedPoints).toBe(8); // baseline unchanged
    expect((await sprints.scopeEvents(org, s.id)).some((e) => e.type === "added")).toBe(true);

    await done(A);
    const { report } = await sprints.close(org, s.id, {});
    expect(report).toMatchObject({ committedPoints: 8, completedPoints: 3, addedPoints: 2, carriedOverPoints: 7 });
    expect((await db.select().from(schema.workItems).where(eq(schema.workItems.id, B)))[0].sprintId).toBeNull(); // carried to backlog

    await backlog.setPoints(org, A, 100); // later edit
    const frozen = (await db.select().from(schema.sprintReports).where(eq(schema.sprintReports.sprintId, s.id)))[0];
    expect(frozen.completedPoints).toBe(3); // report immutable

    const vel = await metrics.velocity(org, projectId);
    expect(vel.average).toBe(3);
    const bd = await metrics.burndown(org, s.id);
    expect(bd.frozen).toBe(true);

    await expect(sprints.addItem(org, u, s.id, C)).rejects.toThrow(); // closed sprint immutable
  });
});
