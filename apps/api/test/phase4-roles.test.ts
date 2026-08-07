import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { PermissionResolver } from "../src/authz/permission-resolver.js";
import { AuditService } from "../src/audit/audit.service.js";
import { RolesService } from "../src/roles/roles.service.js";
import { ConfigService } from "../src/config-export/config.service.js";
import { WorkflowService } from "../src/workflow/workflow.service.js";
import { CAPABILITIES } from "../src/authz/capabilities.js";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let resolver: PermissionResolver, roles: RolesService, config: ConfigService, audit: AuditService;
let orgA: string, orgB: string, admin: string, reporter: string;

async function seedPermissionsRegistry() {
  await db.insert(schema.permissions).values(Object.values(CAPABILITIES).map((key) => ({ key, description: key }))).onConflictDoNothing();
}
async function makeOrg(slug: string) {
  const [o] = await db.insert(schema.organizations).values({ name: slug, slug }).returning();
  return o.id;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  resolver = new PermissionResolver(db); audit = new AuditService(db);
  roles = new RolesService(db, resolver, audit); config = new ConfigService(db, audit);

  await seedPermissionsRegistry();
  orgA = await makeOrg("org-a"); orgB = await makeOrg("org-b");
  const [ua] = await db.insert(schema.users).values({ email: "admin@x.io", displayName: "admin" }).returning(); admin = ua.id;
  const [ur] = await db.insert(schema.users).values({ email: "rep@x.io", displayName: "rep" }).returning(); reporter = ur.id;
  await db.insert(schema.organizationMemberships).values([{ organizationId: orgA, userId: admin }, { organizationId: orgA, userId: reporter }]);
  // org admin gets everything via the special-cased role key.
  await db.insert(schema.userRoleAssignments).values({ organizationId: orgA, userId: admin, roleKey: "organization_admin", scopeType: "organization" });
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 4 — custom roles + permission preview parity", () => {
  it("preview matches the resolver the guard uses", async () => {
    await roles.create(orgA, admin, { key: "reporter", name: "Reporter", permissions: [CAPABILITIES.WORKITEM_CREATE] });
    await roles.assign(orgA, admin, { targetUserId: reporter, roleKey: "reporter" });

    const preview = await roles.preview(orgA, reporter);
    const resolved = await resolver.resolveCapabilities(orgA, reporter);

    // Preview list is exactly what the resolver computes.
    expect(preview.capabilities).toEqual([...resolved].sort());
    // And it matches per-capability guard checks.
    expect(preview.capabilities).toContain(CAPABILITIES.WORKITEM_CREATE);
    expect(await resolver.can(orgA, reporter, CAPABILITIES.WORKITEM_CREATE)).toBe(true);
    expect(preview.capabilities).not.toContain(CAPABILITIES.PROJECT_CREATE);
    expect(await resolver.can(orgA, reporter, CAPABILITIES.PROJECT_CREATE)).toBe(false);
  });

  it("org admin resolves to every capability", async () => {
    for (const cap of Object.values(CAPABILITIES)) expect(await resolver.can(orgA, admin, cap)).toBe(true);
  });

  it("writes audit events for role create + assign", async () => {
    const events = await audit.listForOrg(orgA);
    const actions = events.map((e) => e.action);
    expect(actions).toContain("role.created");
    expect(actions).toContain("role.assigned");
  });
});

describe("Phase 4 — configuration export/import", () => {
  it("round-trips fields and roles into another organization", async () => {
    await db.insert(schema.customFieldDefinitions).values({ organizationId: orgA, key: "impact", name: "Impact", fieldType: "select", visibility: "all", createdBy: admin });
    const doc = await config.export(orgA);
    expect(doc.fields.some((f) => f.key === "impact")).toBe(true);
    expect(doc.roles.some((r) => r.key === "reporter")).toBe(true);

    await config.import(orgB, admin, doc);
    const [f] = await db.select().from(schema.customFieldDefinitions).where(eq(schema.customFieldDefinitions.organizationId, orgB));
    expect(f.key).toBe("impact");
    const importedRole = await db.select().from(schema.roles).where(eq(schema.roles.organizationId, orgB));
    expect(importedRole.some((r) => r.key === "reporter")).toBe(true);
  });
});

describe("Phase 4 — audit on workflow publish", () => {
  it("records a workflow.published audit event", async () => {
    const wf = new WorkflowService(db, audit);
    const created = await wf.create(orgA, admin, "Flow");
    const s = await wf.addStatus(orgA, created.version.id, { key: "open", name: "Open", isInitial: true });
    await wf.addTransition(orgA, created.version.id, { name: "self", fromStatusId: s.id, toStatusId: s.id });
    await wf.publish(orgA, admin, created.version.id);
    const events = await audit.listForOrg(orgA);
    expect(events.map((e) => e.action)).toContain("workflow.published");
  });
});
