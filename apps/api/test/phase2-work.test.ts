import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq, and } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService;
let orgA: string, orgB: string, userA: string, projectA: string;

async function bootstrapOrg(slug: string) {
  const [u] = await db.insert(schema.users).values({ email: `${slug}@x.io`, displayName: slug }).returning();
  const [o] = await db.insert(schema.organizations).values({ name: slug, slug, createdBy: u.id }).returning();
  await db.insert(schema.organizationMemberships).values({ organizationId: o.id, userId: u.id });
  await db.insert(schema.workItemTypes).values([
    { organizationId: o.id, key: "task", name: "Task" },
    { organizationId: o.id, key: "subtask", name: "Subtask" },
  ]);
  return { orgId: o.id, userId: u.id };
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);

  const a = await bootstrapOrg("org-a"); orgA = a.orgId; userA = a.userId;
  const b = await bootstrapOrg("org-b"); orgB = b.orgId;

  const workspace = await ws.create(orgA, userA, "Engineering");
  const project = await projects.create(orgA, userA, { workspaceId: workspace.id, name: "Platform", keyPrefix: "ENG" });
  projectA = project.id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 2 — work item engine invariants", () => {
  it("allocates sequential, unique per-project keys", async () => {
    const i1 = await items.create(orgA, userA, { projectId: projectA, title: "First" });
    const i2 = await items.create(orgA, userA, { projectId: projectA, title: "Second" });
    expect(i1.key).toBe("ENG-1");
    expect(i2.key).toBe("ENG-2");
  });

  it("creates exactly one owning placement per work item", async () => {
    const item = await items.create(orgA, userA, { projectId: projectA, title: "Owns one" });
    const placements = await db.select().from(schema.workItemPlacements)
      .where(and(eq(schema.workItemPlacements.workItemId, item.id), eq(schema.workItemPlacements.isOwning, true)));
    expect(placements).toHaveLength(1);
    // A second owning placement is rejected by the partial unique index.
    await expect(db.insert(schema.workItemPlacements).values({
      organizationId: orgA, workItemId: item.id, projectId: projectA, rank: "z", isOwning: true,
    })).rejects.toThrow();
  });

  it("never changes owning_project_id on update (immutable ownership)", async () => {
    const item = await items.create(orgA, userA, { projectId: projectA, title: "Immutable owner" });
    const updated = await items.update(orgA, item.id, userA, item.version, { title: "Renamed" });
    expect(updated.owningProjectId).toBe(item.owningProjectId);
    expect(updated.key).toBe(item.key);
  });

  it("rejects a stale optimistic update (concurrency)", async () => {
    const item = await items.create(orgA, userA, { projectId: projectA, title: "Concurrent" });
    await items.update(orgA, item.id, userA, item.version, { status: "In Progress" }); // version 0 -> 1
    await expect(items.update(orgA, item.id, userA, item.version, { status: "Done" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("maps status to status category", async () => {
    const item = await items.create(orgA, userA, { projectId: projectA, title: "Status" });
    const done = await items.update(orgA, item.id, userA, item.version, { status: "Done" });
    expect(done.statusCategory).toBe("done");
  });


  it("creates and lists a subtask under its parent", async () => {
    const parent = await items.create(orgA, userA, { projectId: projectA, title: "Parent task" });
    const child = await items.create(orgA, userA, { projectId: projectA, title: "Child task", typeKey: "subtask", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);
    const children = await items.listChildren(orgA, parent.id);
    expect(children.map((row) => row.id)).toContain(child.id);
    const detail = await items.get(orgA, parent.id);
    expect(detail.subtaskCount).toBe(1);
  });

  it("requires a parent when creating a subtask", async () => {
    await expect(items.create(orgA, userA, { projectId: projectA, title: "Orphan", typeKey: "subtask" }))
      .rejects.toMatchObject({ code: "VALIDATION", details: { code: "WORK_ITEM_PARENT_REQUIRED" } });
  });

  it("rejects an assignee who is not an active organization member", async () => {
    const [outsider] = await db.insert(schema.users).values({ email: "invalid-assignee@x.io", displayName: "Invalid assignee" }).returning();
    await expect(items.create(orgA, userA, { projectId: projectA, title: "Bad owner", primaryOwnerUserId: outsider.id }))
      .rejects.toMatchObject({ code: "VALIDATION", details: { code: "WORK_ITEM_ASSIGNEE_NOT_ALLOWED" } });
  });

  it("rejects a parent from another project", async () => {
    const workspace = await ws.create(orgA, userA, "Other workspace");
    const other = await projects.create(orgA, userA, { workspaceId: workspace.id, name: "Other project", keyPrefix: "OTH" });
    const parent = await items.create(orgA, userA, { projectId: projectA, title: "Original parent" });
    await expect(items.create(orgA, userA, { projectId: other.id, title: "Invalid child", typeKey: "subtask", parentId: parent.id }))
      .rejects.toMatchObject({ code: "VALIDATION", details: { code: "WORK_ITEM_CROSS_PROJECT_PARENT_PROHIBITED" } });
  });

  it("does not silently complete or delete a parent with open subtasks", async () => {
    const parent = await items.create(orgA, userA, { projectId: projectA, title: "Parent with open work" });
    const child = await items.create(orgA, userA, { projectId: projectA, title: "Open child", typeKey: "subtask", parentId: parent.id });
    await expect(items.update(orgA, parent.id, userA, parent.version, { status: "Done" }))
      .rejects.toMatchObject({ code: "VALIDATION", details: { code: "WORK_ITEM_OPEN_CHILDREN" } });
    await expect(items.softDelete(orgA, parent.id, userA))
      .rejects.toMatchObject({ code: "VALIDATION", details: { code: "WORK_ITEM_OPEN_CHILDREN" } });
    await items.update(orgA, child.id, userA, child.version, { status: "Done" });
    const completedParent = await items.update(orgA, parent.id, userA, parent.version, { status: "Done" });
    expect(completedParent.statusCategory).toBe("done");
  });

  it("keeps work items organization-isolated", async () => {
    const item = await items.create(orgA, userA, { projectId: projectA, title: "Private to A" });
    await expect(items.get(orgB, item.id)).rejects.toBeInstanceOf(AppError);
  });

  it("soft-deletes and restores", async () => {
    const item = await items.create(orgA, userA, { projectId: projectA, title: "Trash me" });
    await items.softDelete(orgA, item.id, userA);
    await expect(items.get(orgA, item.id)).rejects.toBeInstanceOf(AppError);
    await items.restore(orgA, item.id, userA);
    const back = await items.get(orgA, item.id);
    expect(back.id).toBe(item.id);
  });

  it("records an activity event for each mutation", async () => {
    const item = await items.create(orgA, userA, { projectId: projectA, title: "Tracked" });
    await items.update(orgA, item.id, userA, item.version, { priority: "high" });
    const events = await items.activity(orgA, item.id);
    const actions = events.map((e) => e.action);
    expect(actions).toContain("work_item.created");
    expect(actions).toContain("work_item.updated");
  });
});

describe("Phase 2 — project privacy", () => {
  it("blocks and hides a private project from an active non-project member", async () => {
    const workspace = await ws.create(orgA, userA, "Secret WS");
    const priv = await projects.create(orgA, userA, { workspaceId: workspace.id, name: "Hidden", keyPrefix: "SEC", privacy: "private" });
    const [outsider] = await db.insert(schema.users).values({ email: "out@x.io", displayName: "Out" }).returning();
    await db.insert(schema.organizationMemberships).values({ organizationId: orgA, userId: outsider.id });

    await expect(projects.assertAccess(orgA, priv.id, outsider.id)).rejects.toBeInstanceOf(AppError);
    const outsiderProjects = await projects.list(orgA, outsider.id);
    expect(outsiderProjects.map((project) => project.id)).not.toContain(priv.id);

    const ownerProjects = await projects.list(orgA, userA);
    expect(ownerProjects.map((project) => project.id)).toContain(priv.id);
    const ok = await projects.assertAccess(orgA, priv.id, userA);
    expect(ok.id).toBe(priv.id);
  });
});
