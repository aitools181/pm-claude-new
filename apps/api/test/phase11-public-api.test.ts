import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ApiTokenService } from "../src/api/api-token.service.js";
import { PublicApiService } from "../src/api/public-api.service.js";

describe("Phase 11 — public API & tokens (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let tokens: ApiTokenService, pub: PublicApiService, items: WorkItemsService;
  let org: string, u: string, projectId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db);
    tokens = new ApiTokenService(db); pub = new PublicApiService(db, items);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, u, "W"); projectId = (await projects.create(org, u, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("issues masked tokens and denies revoked/expired/unknown", async () => {
    const t = await tokens.create(org, u, { name: "CI", scopes: ["work:read"] });
    expect(t.token).toMatch(/^pmk_/);
    const listed = await tokens.list(org);
    expect(listed[0]).not.toHaveProperty("tokenHash");
    expect((listed[0] as any).token).toBeUndefined();
    expect((await tokens.authenticate(t.token)).scopes).toContain("work:read");
    await tokens.revoke(org, t.id);
    await expect(tokens.authenticate(t.token)).rejects.toThrow(/revoked/i);
    const t2 = await tokens.create(org, u, { name: "E", scopes: ["work:read"] });
    await db.update(schema.apiTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.apiTokens.id, t2.id));
    await expect(tokens.authenticate(t2.token)).rejects.toThrow(/expired/i);
    await expect(tokens.authenticate("pmk_bogus")).rejects.toThrow(/invalid/i);
  });

  it("paginates by keyset without overlap and filters", async () => {
    for (let i = 0; i < 5; i++) await items.create(org, u, { projectId, title: "i" + i });
    const p1 = await pub.listWorkItems(org, { limit: 2 });
    const p2 = await pub.listWorkItems(org, { limit: 2, cursor: p1.nextCursor! });
    const p3 = await pub.listWorkItems(org, { limit: 2, cursor: p2.nextCursor! });
    const ids = [...p1.data, ...p2.data, ...p3.data].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(p3.nextCursor).toBeNull();
    expect((await pub.listWorkItems(org, { projectId, status: "todo" })).data.length).toBe(5);
  });
});
