import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ApiTokenService } from "../src/api/api-token.service.js";
import { WebhookService } from "../src/webhooks/webhook.service.js";
import { IntegrationService } from "../src/integrations/integration.service.js";
import { SecurityAuditService } from "../src/security/security-audit.service.js";
import { findSensitiveKey } from "../src/security/sensitive-fields.js";

describe("Phase 12 — security self-audit (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let items: WorkItemsService, audit: SecurityAuditService, ws: WorkspacesService, projects: ProjectsService;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
    const tokens = new ApiTokenService(db);
    const webhooks = new WebhookService(db, { async send() { return { status: 200 }; } } as any);
    const integrations = new IntegrationService(db, { SESSION_SECRET: "s".repeat(40) } as any);
    audit = new SecurityAuditService(db, tokens, webhooks, integrations);
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  const mkOrg = async (tag: string) => {
    const [o] = await db.insert(schema.organizations).values({ name: tag, slug: tag }).returning();
    await db.insert(schema.workItemTypes).values([{ organizationId: o.id, key: "task", name: "Task" }]);
    const [u] = await db.insert(schema.users).values({ email: tag + "@x.io", displayName: tag }).returning();
    await db.insert(schema.organizationMemberships).values({ organizationId: o.id, userId: u.id });
    const w = await ws.create(o.id, u.id, "W"); const p = await projects.create(o.id, u.id, { workspaceId: w.id, name: "P", keyPrefix: "P" });
    return { o, u, p };
  };

  it("flags sensitive keys but allows masked variants", () => {
    expect(findSensitiveKey({ secret: "x" })).toBe("secret");
    expect(findSensitiveKey([{ tokenHash: "h" }])).toBe("tokenHash");
    expect(findSensitiveKey({ secretMasked: "••", credentialHint: "••1234" })).toBeNull();
  });

  it("denies cross-org access and catches a planted cross-tenant vulnerability", async () => {
    const A = await mkOrg("orga"); const B = await mkOrg("orgb");
    const bItem = await items.create(B.o.id, B.u.id, { projectId: B.p.id, title: "B" });
    await expect(items.get(A.o.id, bItem.id)).rejects.toThrow();

    expect((await audit.run(A.o.id)).passed).toBe(true);
    const aItem = await items.create(A.o.id, A.u.id, { projectId: A.p.id, title: "A" });
    await db.update(schema.workItems).set({ owningProjectId: B.p.id }).where(eq(schema.workItems.id, aItem.id));
    const vuln = await audit.run(A.o.id);
    expect(vuln.passed).toBe(false);
    expect(vuln.findings.find((f) => f.id === "tenant-integrity")!.ok).toBe(false);
    await db.update(schema.workItems).set({ owningProjectId: A.p.id }).where(eq(schema.workItems.id, aItem.id));
    expect((await audit.run(A.o.id)).passed).toBe(true);
  });
});
