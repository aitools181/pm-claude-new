import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { DocumentService } from "../src/docs/document.service.js";
import { ModulesService } from "../src/modules/modules.service.js";
import { WhiteboardService } from "../src/whiteboard/whiteboard.service.js";

describe("Phase 13 — whiteboard module (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let wb: WhiteboardService, modules: ModulesService, items: WorkItemsService;
  let org: string, u: string, projectId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db);
    modules = new ModulesService(db); wb = new WhiteboardService(db, modules, items, new DocumentService(db));
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, u, "W"); projectId = (await projects.create(org, u, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("is disabled by default without affecting core", async () => {
    await expect(wb.createBoard(org, u, "B")).rejects.toThrow(/disabled/i);
    expect((await items.create(org, u, { projectId, title: "core" })).title).toBe("core");
  });

  it("enforces connectors and converts elements to tasks and frames to docs", async () => {
    await modules.setEnabled(org, "whiteboard", true, u);
    const board = await wb.createBoard(org, u, "Canvas");
    const note = await wb.addElement(org, board.id, { kind: "note", x: 50, y: 50, data: { label: "Fix bug" } });
    const shape = await wb.addElement(org, board.id, { kind: "shape", x: 300, y: 50, data: { label: "API" } });
    await wb.addElement(org, board.id, { kind: "connector", data: { fromId: note.id, toId: shape.id } });
    await expect(wb.addElement(org, board.id, { kind: "connector", data: { fromId: note.id, toId: "00000000-0000-0000-0000-000000000000" } })).rejects.toThrow();

    const conv = await wb.elementToTask(org, u, note.id, { projectId });
    expect(conv.workItem.title).toBe("Fix bug");
    const [el] = await db.select().from(schema.whiteboardElements).where(eq(schema.whiteboardElements.id, note.id));
    expect(el.createdWorkItemId).toBe(conv.workItem.id);

    const frame = await wb.addElement(org, board.id, { kind: "frame", x: 0, y: 0, w: 400, h: 300, data: { label: "Frame" } });
    await wb.addElement(org, board.id, { kind: "note", x: 500, y: 500, data: { label: "outside" } });
    const fdoc = await wb.frameToDoc(org, u, frame.id, {});
    expect(fdoc.capturedElements).toBe(2); // the two in-bounds notes

    await modules.setEnabled(org, "whiteboard", false, u);
    await expect(wb.listBoards(org)).rejects.toThrow(/disabled/i);
  });
});
