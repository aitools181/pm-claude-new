import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { FieldSecurityService } from "../src/config-fields/field-security.service.js";
import { FieldsService } from "../src/config-fields/fields.service.js";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let fields: FieldsService, items: WorkItemsService, ws: WorkspacesService, projects: ProjectsService;
let orgId: string, admin: string, plain: string, itemId: string, typeIdTask: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
  fields = new FieldsService(db, new FieldSecurityService(db));

  const [o] = await db.insert(schema.organizations).values({ name: "Org", slug: "org" }).returning(); orgId = o.id;
  const [tt] = await db.insert(schema.workItemTypes).values({ organizationId: orgId, key: "task", name: "Task" }).returning(); typeIdTask = tt.id;
  await db.insert(schema.workItemTypes).values({ organizationId: orgId, key: "subtask", name: "Subtask" });
  const [ua] = await db.insert(schema.users).values({ email: "admin@x.io", displayName: "admin" }).returning(); admin = ua.id;
  const [up] = await db.insert(schema.users).values({ email: "plain@x.io", displayName: "plain" }).returning(); plain = up.id;
  await db.insert(schema.organizationMemberships).values([{ organizationId: orgId, userId: admin }, { organizationId: orgId, userId: plain }]);
  await db.insert(schema.userRoleAssignments).values({ organizationId: orgId, userId: admin, roleKey: "organization_admin" });

  const w = await ws.create(orgId, admin, "Eng");
  const p = await projects.create(orgId, admin, { workspaceId: w.id, name: "P", keyPrefix: "P" });
  const item = await items.create(orgId, admin, { projectId: p.id, title: "Item" });
  itemId = item.id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 4 — field validation per type", () => {
  it("text respects maxLength", async () => {
    const f = await fields.defineField(orgId, admin, { key: "t1", name: "T", fieldType: "text", config: { maxLength: 5 } });
    await expect(fields.setValue(orgId, admin, itemId, f.id, "toolong")).rejects.toBeInstanceOf(AppError);
    await expect(fields.setValue(orgId, admin, itemId, f.id, "ok")).resolves.toBeUndefined();
  });
  it("number respects min/max", async () => {
    const f = await fields.defineField(orgId, admin, { key: "n1", name: "N", fieldType: "number", config: { min: 0, max: 10 } });
    await expect(fields.setValue(orgId, admin, itemId, f.id, 20)).rejects.toBeInstanceOf(AppError);
    await expect(fields.setValue(orgId, admin, itemId, f.id, 5)).resolves.toBeUndefined();
  });
  it("date must be valid", async () => {
    const f = await fields.defineField(orgId, admin, { key: "d1", name: "D", fieldType: "date" });
    await expect(fields.setValue(orgId, admin, itemId, f.id, "nope")).rejects.toBeInstanceOf(AppError);
    await expect(fields.setValue(orgId, admin, itemId, f.id, "2026-01-01")).resolves.toBeUndefined();
  });
  it("select rejects an invalid option and accepts a valid one", async () => {
    const f = await fields.defineField(orgId, admin, { key: "s1", name: "S", fieldType: "select", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] });
    await expect(fields.setValue(orgId, admin, itemId, f.id, crypto.randomUUID())).rejects.toBeInstanceOf(AppError);
    const [opt] = await db.select().from(schema.customFieldOptions).where(eq(schema.customFieldOptions.fieldId, f.id)).limit(1);
    await expect(fields.setValue(orgId, admin, itemId, f.id, opt.id)).resolves.toBeUndefined();
  });
  it("url must be valid; required blocks empty", async () => {
    const u = await fields.defineField(orgId, admin, { key: "u1", name: "U", fieldType: "url" });
    await expect(fields.setValue(orgId, admin, itemId, u.id, "not a url")).rejects.toBeInstanceOf(AppError);
    const req = await fields.defineField(orgId, admin, { key: "r1", name: "R", fieldType: "text", required: true });
    await expect(fields.setValue(orgId, admin, itemId, req.id, "")).rejects.toBeInstanceOf(AppError);
  });
});

describe("Phase 4 — field-level security (no leakage)", () => {
  it("hides a restricted field from unauthorised users, shows it to authorised", async () => {
    const secret = await fields.defineField(orgId, admin, { key: "salary", name: "Salary", fieldType: "number", visibility: "restricted", visibleToRoles: ["manager"] });
    await fields.setValue(orgId, admin, itemId, secret.id, 100);

    // Plain user (no manager role) — field absent.
    const asPlain = await fields.valuesForItem(orgId, plain, itemId);
    expect(asPlain.some((v) => v.key === "salary")).toBe(false);

    // Grant the role — now visible.
    await db.insert(schema.userRoleAssignments).values({ organizationId: orgId, userId: plain, roleKey: "manager" });
    const asManager = await fields.valuesForItem(orgId, plain, itemId);
    expect(asManager.some((v) => v.key === "salary")).toBe(true);

    // Org admin sees it regardless.
    const asAdmin = await fields.valuesForItem(orgId, admin, itemId);
    expect(asAdmin.some((v) => v.key === "salary")).toBe(true);
  });
});

describe("Phase 4 — required fields per custom type", () => {
  it("enforces required type fields", async () => {
    const f = await fields.defineField(orgId, admin, { key: "sev", name: "Severity", fieldType: "text" });
    const bugType = await fields.defineType(orgId, admin, { key: "bug", name: "Bug", icon: "🐞", fields: [{ fieldId: f.id, required: true }] });
    const w = await ws.create(orgId, admin, "QA");
    const p = await projects.create(orgId, admin, { workspaceId: w.id, name: "QA", keyPrefix: "QA" });
    const bug = await items.create(orgId, admin, { projectId: p.id, title: "A bug" });

    await expect(fields.assertRequiredForType(orgId, bugType.id, bug.id)).rejects.toBeInstanceOf(AppError);
    await fields.setValue(orgId, admin, bug.id, f.id, "high");
    await expect(fields.assertRequiredForType(orgId, bugType.id, bug.id)).resolves.toBeUndefined();
  });
});
