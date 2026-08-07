import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { TtlCache } from "../src/common/ttl-cache.js";

describe("Phase 12 — performance (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let orgId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); orgId = o.id;
    const [type] = await db.insert(schema.workItemTypes).values({ organizationId: orgId, key: "task", name: "Task" }).returning();
    const [u] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning();
    await db.insert(schema.organizationMemberships).values({ organizationId: orgId, userId: u.id });
    const w = await ws.create(orgId, u.id, "W"); const p = await projects.create(orgId, u.id, { workspaceId: w.id, name: "P", keyPrefix: "P" });
    await db.execute(sql`
      INSERT INTO work_items (organization_id, workspace_id, owning_project_id, type_id, key, title, status_category, created_at)
      SELECT ${orgId}, ${w.id}, ${p.id}, ${type.id}, 'K-'||g, 'Item '||g, 'todo', now() - (g||' seconds')::interval
      FROM generate_series(1, 5000) g`);
    await db.execute(sql`ANALYZE work_items`);
  }, 180_000);
  afterAll(async () => { await pg?.stop(); });

  it("uses the keyset index for pagination and creates hot-path indexes", async () => {
    const plan = (await db.execute(sql`EXPLAIN SELECT id FROM work_items WHERE organization_id=${orgId} ORDER BY created_at, id LIMIT 25`)).rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(/Index (Only )?Scan/.test(plan)).toBe(true);
    expect(/Seq Scan/.test(plan)).toBe(false);
    const idx = (await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename='work_items'`)).rows.map((r) => r.indexname);
    for (const i of ["work_items_keyset_idx", "work_items_board_idx", "work_items_recycle_idx"]) expect(idx).toContain(i);
  });

  it("caches hot values with TTL semantics", async () => {
    let clock = 1000; const cache = new TtlCache<string>(100, () => clock); let calls = 0;
    const fn = async () => { calls++; return "v"; };
    expect((await cache.wrap("k", fn)).hit).toBe(false);
    expect((await cache.wrap("k", fn)).hit).toBe(true);
    clock = 1200;
    expect((await cache.wrap("k", fn)).hit).toBe(false);
    expect(calls).toBe(2);
  });
});
