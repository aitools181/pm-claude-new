import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { DocumentService } from "../src/docs/document.service.js";

describe("Phase 10 — docs (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let docs: DocumentService, items: WorkItemsService, projects: ProjectsService, ws: WorkspacesService;
  let org: string, owner: string, viewer: string, wsId: string, projectId: string, W: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db); docs = new DocumentService(db, items);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "o@x.io", displayName: "owner" }).returning(); owner = a.id;
    const [b] = await db.insert(schema.users).values({ email: "v@x.io", displayName: "viewer" }).returning(); viewer = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: owner }, { organizationId: org, userId: viewer }]);
    wsId = (await ws.create(org, owner, "W")).id;
    projectId = (await projects.create(org, owner, { workspaceId: wsId, name: "P", keyPrefix: "P" })).id;
    W = (await items.create(org, owner, { projectId, title: "Embedded" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("versions, restores, keeps backlinks valid, and respects embed permissions", async () => {
    const A = await docs.create(org, owner, { workspaceId: wsId, title: "Spec", blocks: [{ type: "embed", refKind: "work_item", refId: W }] });
    expect(A.version).toBe(1);
    await docs.save(org, owner, A.id, { blocks: [{ type: "text", text: "no embed" }] });
    const r = await docs.restore(org, owner, A.id, 1);
    expect(r.version).toBe(3); expect(r.restoredFrom).toBe(1);
    expect((await docs.listVersions(org, A.id)).length).toBe(3);
    expect((await docs.backlinksFor(org, "work_item", W))[0].id).toBe(A.id); // backlink valid after restore

    await db.update(schema.projects).set({ privacy: "private" }).where(eq(schema.projects.id, projectId));
    expect((await docs.get(org, owner, A.id)).embeds[0].allowed).toBe(true);
    expect((await docs.get(org, viewer, A.id)).embeds[0].redacted).toBe(true);

    const s2t = await docs.selectionToTask(org, owner, A.id, { projectId, title: "Follow-up" });
    expect((await docs.backlinksFor(org, "work_item", s2t.workItem.id))[0].id).toBe(A.id);
  });
});
