import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { BoardService } from "../src/work/board.service.js";
import { PlacementsService } from "../src/work/placements.service.js";
import { ViewsService } from "../src/views/views.service.js";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService, board: BoardService, placements: PlacementsService, views: ViewsService;
let orgId: string, owner: string, viewer: string;
let targetProjectId: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
  board = new BoardService(db); placements = new PlacementsService(db, projects); views = new ViewsService(db);

  const [o] = await db.insert(schema.organizations).values({ name: "Org", slug: "org" }).returning();
  orgId = o.id;
  await db.insert(schema.workItemTypes).values([{ organizationId: orgId, key: "task", name: "Task" }, { organizationId: orgId, key: "subtask", name: "Subtask" }]);
  const [uo] = await db.insert(schema.users).values({ email: "owner@x.io", displayName: "owner" }).returning(); owner = uo.id;
  const [uv] = await db.insert(schema.users).values({ email: "viewer@x.io", displayName: "viewer" }).returning(); viewer = uv.id;
  await db.insert(schema.organizationMemberships).values([{ organizationId: orgId, userId: owner }, { organizationId: orgId, userId: viewer }]);

  const w = await ws.create(orgId, owner, "Eng");
  const target = await projects.create(orgId, owner, { workspaceId: w.id, name: "Target", keyPrefix: "TGT" });
  targetProjectId = target.id;
  await db.insert(schema.projectMembers).values({ organizationId: orgId, projectId: target.id, userId: viewer });
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 3 — board move + undo", () => {
  it("persists rank/status on move and restores them on undo", async () => {
    const w = await ws.create(orgId, owner, "Board WS");
    const p = await projects.create(orgId, owner, { workspaceId: w.id, name: "Board", keyPrefix: "BRD" });
    const i1 = await items.create(orgId, owner, { projectId: p.id, title: "Card 1" });
    const before = (await items.get(orgId, i1.id));

    const res = await board.move(orgId, owner, p.id, i1.id, { toStatus: "In Progress", expectedVersion: before.version });
    const moved = await items.get(orgId, i1.id);
    expect(moved.status).toBe("In Progress");
    expect(moved.statusCategory).toBe("in_progress");
    expect(moved.version).toBe(before.version + 1);
    await expect(board.move(orgId, owner, p.id, i1.id, { toStatus: "Done", expectedVersion: before.version })).rejects.toMatchObject({
      code: "CONFLICT",
      details: { code: "WORK_ITEM_VERSION_CONFLICT" },
    });

    await board.undo(orgId, owner, p.id, i1.id, { status: res.previous.status, rank: res.previous.rank }, moved.version);
    const restored = await items.get(orgId, i1.id);
    expect(restored.status).toBe(before.status);
    expect(restored.version).toBe(moved.version + 1);
  });

  it("does not let a board move bypass the open-subtask completion policy", async () => {
    const w = await ws.create(orgId, owner, "Hierarchy Board WS");
    const p = await projects.create(orgId, owner, { workspaceId: w.id, name: "Hierarchy Board", keyPrefix: "HBR" });
    const parent = await items.create(orgId, owner, { projectId: p.id, title: "Parent task" });
    const child = await items.create(orgId, owner, { projectId: p.id, title: "Open child", typeKey: "subtask", parentId: parent.id });

    await expect(board.move(orgId, owner, p.id, parent.id, { toStatus: "Done", expectedVersion: parent.version })).rejects.toMatchObject({
      code: "VALIDATION",
      details: { code: "WORK_ITEM_OPEN_CHILDREN" },
    });

    const currentChild = await items.get(orgId, child.id);
    await items.update(orgId, child.id, owner, currentChild.version, { status: "Done" });
    const currentParent = await items.get(orgId, parent.id);
    await board.move(orgId, owner, p.id, parent.id, { toStatus: "Done", expectedVersion: currentParent.version });

    const completedParent = await items.get(orgId, parent.id);
    expect(completedParent.statusCategory).toBe("done");
    const history = await db.select().from(schema.workItemStatusHistory).where(eq(schema.workItemStatusHistory.workItemId, parent.id));
    expect(history.some((row) => row.toCategory === "done")).toBe(true);
  });
});

describe("Phase 3 — linked placements (permission intersection)", () => {
  it("links only with access to BOTH item and target, and linking does not grant access", async () => {
    // Private project + item, owned by `owner`; viewer is NOT a member.
    const w = await ws.create(orgId, owner, "Private WS");
    const priv = await projects.create(orgId, owner, { workspaceId: w.id, name: "Private", keyPrefix: "PRV", privacy: "private" });
    const secret = await items.create(orgId, owner, { projectId: priv.id, title: "Secret card" });

    // owner can link it into the target project (has access to both).
    await placements.link(orgId, owner, secret.id, targetProjectId);

    // viewer sees the target board but the linked secret item is hidden (no owning-project access).
    const asViewer = await board.board(orgId, viewer, targetProjectId);
    const viewerIds = Object.values(asViewer).flat().map((i: any) => i.id);
    expect(viewerIds).not.toContain(secret.id);

    // owner sees it on the target board (linked).
    const asOwner = await board.board(orgId, owner, targetProjectId);
    const ownerIds = Object.values(asOwner).flat().map((i: any) => i.id);
    expect(ownerIds).toContain(secret.id);

    // viewer cannot link the secret item anywhere (no access to it).
    await expect(placements.link(orgId, viewer, secret.id, targetProjectId)).rejects.toBeInstanceOf(AppError);
  });
});

describe("Phase 3 — My Work + Search", () => {
  it("returns items assigned to me", async () => {
    const item = await items.create(orgId, owner, { projectId: targetProjectId, title: "Assigned to viewer" });
    await db.insert(schema.workItemAssignees).values({ organizationId: orgId, workItemId: item.id, userId: viewer });
    const mine = await views.myWork(orgId, viewer);
    expect(mine.some((i) => i.id === item.id)).toBe(true);
  });

  it("search returns authorised results only and respects soft deletes", async () => {
    const found = await items.create(orgId, owner, { projectId: targetProjectId, title: "FindMeNow" });
    const r1 = await views.search(orgId, viewer, "FindMeNow");
    expect(r1.workItems.some((i) => i.id === found.id)).toBe(true);

    await items.softDelete(orgId, found.id, owner);
    const r2 = await views.search(orgId, viewer, "FindMeNow");
    expect(r2.workItems.some((i) => i.id === found.id)).toBe(false);

    // Private item is not leaked to a non-member.
    const w = await ws.create(orgId, owner, "Leak WS");
    const priv = await projects.create(orgId, owner, { workspaceId: w.id, name: "Leak", keyPrefix: "LEK", privacy: "private" });
    const secret = await items.create(orgId, owner, { projectId: priv.id, title: "SecretLeakTitle" });
    const r3 = await views.search(orgId, viewer, "SecretLeakTitle");
    expect(r3.workItems.some((i) => i.id === secret.id)).toBe(false);
  });
});
