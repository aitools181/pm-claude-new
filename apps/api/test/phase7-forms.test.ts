import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { FormsService } from "../src/forms/forms.service.js";
import { SubmissionsService } from "../src/forms/submissions.service.js";
import { RateLimiter, AllowAllCaptcha } from "../src/forms/public-guards.js";
import { selectRoute, missingRequired } from "../src/forms/form-logic.js";

describe("Phase 7 — form logic (pure)", () => {
  const fields = [
    { key: "category", label: "C", type: "select", required: true },
    { key: "severity", label: "S", type: "select", required: true, visibleWhen: { fieldKey: "category", op: "eq" as const, value: "bug" } },
  ];
  it("hides + de-requires fields via branching", () => {
    expect(missingRequired(fields, { category: "task" })).toEqual([]);           // severity hidden
    expect(missingRequired(fields, { category: "bug" })).toContain("severity");  // severity visible+missing
  });
  it("selects the first matching route, else fallback", () => {
    const rules = [{ when: { fieldKey: "category", op: "eq" as const, value: "bug" }, projectId: "P_BUG" }];
    expect(selectRoute(rules, { category: "bug" }, { projectId: "P_DEF" })?.projectId).toBe("P_BUG");
    expect(selectRoute(rules, { category: "task" }, { projectId: "P_DEF" })?.projectId).toBe("P_DEF");
  });
});

describe("Phase 7 — forms routing + public (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let forms: FormsService, subs: SubmissionsService;
  let org: string, u: string, projBug: string, projDef: string, formId: string;
  const projOf = async (id: string) => (await db.select().from(schema.workItems).where(eq(schema.workItems.id, id)))[0].owningProjectId;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db), items = new WorkItemsService(db);
    forms = new FormsService(db); subs = new SubmissionsService(db, items, new RateLimiter(), new AllowAllCaptcha());
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, u, "W");
    projBug = (await projects.create(org, u, { workspaceId: w.id, name: "Bugs", keyPrefix: "BUG" })).id;
    projDef = (await projects.create(org, u, { workspaceId: w.id, name: "Intake", keyPrefix: "INT" })).id;
    const f = await forms.create(org, u, { key: "support", name: "Support" });
    formId = f.id;
    await forms.updateDraft(org, formId, {
      draftFields: [
        { key: "category", label: "Category", type: "select", required: true },
        { key: "severity", label: "Severity", type: "select", required: true, visibleWhen: { fieldKey: "category", op: "eq", value: "bug" } },
        { key: "title", label: "Title", type: "text", required: true },
      ],
      draftRouting: [{ when: { fieldKey: "category", op: "eq", value: "bug" }, projectId: projBug, titleTemplate: "BUG: {title}" }],
      defaultProjectId: projDef,
    });
    await forms.publish(org, u, formId);
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("routes each branch to the expected project", async () => {
    const bug = await subs.submitInternal(org, u, formId, { category: "bug", severity: "high", title: "crash" });
    expect(await projOf(bug.workItemId!)).toBe(projBug);
    const task = await subs.submitInternal(org, u, formId, { category: "task", title: "add" });
    expect(await projOf(task.workItemId!)).toBe(projDef);
  });

  it("public submit is rate-limited per IP", async () => {
    const { publicToken } = await forms.enablePublic(org, formId);
    const rl = new RateLimiter(); const s = new SubmissionsService(db, new WorkItemsService(db), rl, new AllowAllCaptcha());
    for (let i = 0; i < 5; i++) await s.submitPublic(publicToken!, { category: "task", title: "p" + i }, "1.1.1.1");
    await expect(s.submitPublic(publicToken!, { category: "task", title: "x" }, "1.1.1.1")).rejects.toThrow();
    await expect(s.submitPublic(publicToken!, { category: "task", title: "y" }, "2.2.2.2")).resolves.toBeTruthy();
  });
});
