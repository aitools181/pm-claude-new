import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { WorkItemMobilityService } from "../src/work/work-item-mobility.service.js";

describe("F30 — work item mobility (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let items: WorkItemsService, mob: WorkItemMobilityService;
  let org: string, u: string, pA: string, pB: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db);
    mob = new WorkItemMobilityService(db, items);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }, { organizationId: org, key: "subtask", name: "Subtask" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, u, "W");
    pA = (await projects.create(org, u, { workspaceId: w.id, name: "Alpha", keyPrefix: "ALP" })).id;
    pB = (await projects.create(org, u, { workspaceId: w.id, name: "Beta", keyPrefix: "BET" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("clones with a fresh identity and reset status, including the subtree", async () => {
    const p = await items.create(org, u, { projectId: pA, title: "Design" });
    await items.create(org, u, { projectId: pA, title: "Hero", typeKey: "subtask", parentId: p.id });
    await db.update(schema.workItems).set({ statusCategory: "done" }).where(eq(schema.workItems.id, p.id));
    const cl = await mob.clone(org, u, p.id, { includeSubtasks: true });
    expect(cl.clone.key).not.toBe(p.key);
    expect(cl.clone.statusCategory).toBe("todo");
    expect(cl.clonedChildren).toBe(1);
  });

  it("enforces the type matrix, cycle and depth on re-parent", async () => {
    const t1 = await items.create(org, u, { projectId: pA, title: "t1" });
    const t2 = await items.create(org, u, { projectId: pA, title: "t2" });
    const s = await items.create(org, u, { projectId: pA, title: "s", typeKey: "subtask", parentId: t1.id });
    await mob.reparent(org, u, s.id, t2.id);
    expect((await db.select().from(schema.workItems).where(eq(schema.workItems.id, s.id)))[0].parentId).toBe(t2.id);
    await mob.reparent(org, u, s.id, null);
    expect((await db.select().from(schema.workItems).where(eq(schema.workItems.id, s.id)))[0].parentId).toBeNull();
    const taskChild = await items.create(org, u, { projectId: pA, title: "task child" });
    await expect(mob.reparent(org, u, taskChild.id, s.id)).rejects.toThrow(/may not contain/i); // task under subtask
    await expect(mob.reparent(org, u, t1.id, t1.id)).rejects.toThrow(/own parent/i);
  });

  it("bulk-creates with partial success and moves across projects with key history", async () => {
    const bulk = await mob.bulkCreate(org, u, pA, ["A", "", "B"]);
    expect(bulk.created).toBe(2); expect(bulk.failed).toBe(1);

    const mv = await items.create(org, u, { projectId: pA, title: "movable" });
    const oldKey = mv.key;
    expect((await mob.move(org, u, mv.id, { destinationProjectId: pB, dryRun: true })).dryRun).toBe(true);
    const res = await mob.move(org, u, mv.id, { destinationProjectId: pB, reason: "reorg" });
    const after = (await db.select().from(schema.workItems).where(eq(schema.workItems.id, mv.id)))[0];
    expect(after.owningProjectId).toBe(pB);
    expect(after.key.startsWith("BET-")).toBe(true);
    expect((await mob.resolveKey(org, oldKey, u))?.workItemId).toBe(mv.id);
    void res;
  });

  it("prevents cross-project orphan hierarchy and preserves a moved subtree", async () => {
    const [section] = await db.insert(schema.sections).values({ organizationId: org, projectId: pA, name: "Source section", rank: "a", createdBy: u }).returning();
    const ancestor = await items.create(org, u, { projectId: pA, title: "ancestor" });
    const root = await items.create(org, u, { projectId: pA, title: "moving root", typeKey: "subtask", parentId: ancestor.id, sectionId: section.id });
    const child = await items.create(org, u, { projectId: pA, title: "moving child", typeKey: "subtask", parentId: root.id, sectionId: section.id });

    const preview = await mob.move(org, u, root.id, { destinationProjectId: pB, dryRun: true });
    expect(preview.valid).toBe(false);
    await expect(mob.move(org, u, root.id, { destinationProjectId: pB })).rejects.toThrow(/has children/i);

    const result = await mob.move(org, u, root.id, { destinationProjectId: pB, hierarchyHandling: "subtree" });
    expect(result.moved).toBe(2);
    const [movedRoot] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, root.id));
    const [movedChild] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, child.id));
    expect(movedRoot.owningProjectId).toBe(pB);
    expect(movedRoot.parentId).toBeNull();
    expect(movedChild.owningProjectId).toBe(pB);
    expect(movedChild.parentId).toBe(root.id);

    const placements = await db.select().from(schema.workItemPlacements).where(eq(schema.workItemPlacements.projectId, pB));
    const movedPlacements = placements.filter((placement) => placement.workItemId === root.id || placement.workItemId === child.id);
    expect(movedPlacements).toHaveLength(2);
    expect(movedPlacements.every((placement) => placement.sectionId === null)).toBe(true);
  });
});
