import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ReleaseService } from "../src/release/release.service.js";
import { findSensitiveKey } from "../src/security/sensitive-fields.js";

describe("Phase 12 — release readiness (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let rel: ReleaseService, ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    rel = new ReleaseService(db); ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("reports version, a current migration status and a served changelog", async () => {
    expect(rel.versionInfo().appVersion).toBe("1.0.0");
    const st = await rel.migrationStatus();
    expect(st.upToDate).toBe(true);
    expect(st.mode).toBe("current");
    expect(rel.changelog().entries.length).toBeGreaterThan(0);
  });

  it("assembles a redacted support bundle with reconciled counts", async () => {
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning();
    await db.insert(schema.workItemTypes).values([{ organizationId: o.id, key: "task", name: "Task" }]);
    const [u] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning();
    await db.insert(schema.organizationMemberships).values({ organizationId: o.id, userId: u.id });
    const w = await ws.create(o.id, u.id, "W"); const p = await projects.create(o.id, u.id, { workspaceId: w.id, name: "P", keyPrefix: "P" });
    await items.create(o.id, u.id, { projectId: p.id, title: "a" });
    const bundle = await rel.supportBundle(o.id);
    expect(bundle.counts.projects).toBe(1);
    expect(bundle.counts.workItems).toBe(1);
    expect(findSensitiveKey(bundle)).toBeNull();
  });
});
