import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { PortfolioService } from "../src/portfolios/portfolio.service.js";

describe("Phase 9 — portfolios (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let svc: PortfolioService, projects: ProjectsService, items: WorkItemsService;
  let org: string, owner: string, viewer: string, wsId: string;
  const mk = async (pid: string, done: boolean) => { const i = await items.create(org, owner, { projectId: pid, title: "t" }); if (done) await db.update(schema.workItems).set({ statusCategory: "done" }).where(eq(schema.workItems.id, i.id)); };

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db); svc = new PortfolioService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "o@x.io", displayName: "owner" }).returning(); owner = a.id;
    const [b] = await db.insert(schema.users).values({ email: "v@x.io", displayName: "viewer" }).returning(); viewer = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: owner }, { organizationId: org, userId: viewer }]);
    wsId = (await ws.create(org, owner, "W")).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("rolls up to match source and redacts private project metrics", async () => {
    const P1 = await projects.create(org, owner, { workspaceId: wsId, name: "Alpha", keyPrefix: "AL" });
    const P2 = await projects.create(org, owner, { workspaceId: wsId, name: "Beta", keyPrefix: "BE" });
    await mk(P1.id, true); await mk(P1.id, false); await mk(P2.id, true); await mk(P2.id, true);
    const pf = await svc.create(org, owner, { name: "Plan" });
    await svc.addProject(org, pf.id, P1.id); await svc.addProject(org, pf.id, P2.id);

    const owned = await svc.rollup(org, owner, pf.id);
    expect(owned.aggregateProgress).toBe(75); // 3/4

    await db.update(schema.projects).set({ privacy: "private" }).where(eq(schema.projects.id, P2.id));
    const seen = await svc.rollup(org, viewer, pf.id);
    const redacted = seen.projects.find((p) => p.name === "Restricted");
    expect(redacted?.redacted).toBe(true); expect(redacted?.progress).toBeNull();
    expect(seen.aggregateProgress).toBe(50); // private metrics excluded

    const m = await svc.createMilestone(org, pf.id, { name: "Launch", dueDate: "2020-01-01" });
    await svc.setMilestoneStatus(org, m.id, "hit");
    const roll = await svc.rollup(org, owner, pf.id);
    expect(roll.milestones.hit).toBe(1);
  });
});
