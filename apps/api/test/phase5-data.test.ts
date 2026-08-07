import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { TemplatesService } from "../src/templates/templates.service.js";
import { RecurrenceService } from "../src/templates/recurrence.service.js";
import { ImportService } from "../src/portability/import.service.js";
import { ExportService } from "../src/portability/export.service.js";
import { sha256 } from "../src/common/crypto.js";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService;
let templates: TemplatesService, recurrence: RecurrenceService, imp: ImportService, exp: ExportService;
let orgId: string, userId: string, workspaceId: string;

async function itemCount(projectId: string) {
  return (await db.select().from(schema.workItems).where(eq(schema.workItems.owningProjectId, projectId))).length;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);
  templates = new TemplatesService(db, projects, items);
  recurrence = new RecurrenceService(db, items);
  imp = new ImportService(db, items); exp = new ExportService(db);

  const [o] = await db.insert(schema.organizations).values({ name: "Org", slug: "org" }).returning(); orgId = o.id;
  await db.insert(schema.workItemTypes).values([{ organizationId: orgId, key: "task", name: "Task" }, { organizationId: orgId, key: "subtask", name: "Subtask" }]);
  const [u] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "U" }).returning(); userId = u.id;
  await db.insert(schema.organizationMemberships).values({ organizationId: orgId, userId });
  workspaceId = (await ws.create(orgId, userId, "Eng")).id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 5 — templates (no instance drift)", () => {
  it("instantiates a project template and does not mutate instances when the template changes", async () => {
    const { template, version } = await templates.create(orgId, userId, "project", "Sprint", { name: "Sprint", keyPrefix: "SPR", sections: ["Backlog"], tasks: [{ title: "T1" }, { title: "T2" }] });
    await templates.publish(orgId, version.id);

    const first = await templates.instantiateProject(orgId, userId, template.id, { workspaceId, keyPrefix: "SPR1" });
    expect(first.taskIds).toHaveLength(2);
    expect(await itemCount(first.projectId)).toBe(2);

    // New template version with 3 tasks — published.
    const v2 = await templates.addVersion(orgId, userId, template.id, { name: "Sprint", keyPrefix: "SPR", sections: ["Backlog"], tasks: [{ title: "T1" }, { title: "T2" }, { title: "T3" }] });
    await templates.publish(orgId, v2.id);

    // Existing instance is unchanged (no silent drift).
    expect(await itemCount(first.projectId)).toBe(2);
    // A fresh instance uses the new version (3 tasks).
    const second = await templates.instantiateProject(orgId, userId, template.id, { workspaceId, keyPrefix: "SPR2" });
    expect(second.taskIds).toHaveLength(3);
  });
});

describe("Phase 5 — recurrence", () => {
  it("produces unique occurrences and is timezone-correct", async () => {
    const p = await projects.create(orgId, userId, { workspaceId, name: "Rec", keyPrefix: "REC" });
    const firstRun = "2026-03-02T09:00:00.000Z";
    const rule = await recurrence.createRule(orgId, userId, { name: "Standup", spec: { projectId: p.id, title: "Standup" }, frequency: "daily", timezone: "UTC", firstRunAt: firstRun });

    const now = new Date("2026-03-02T09:05:00.000Z");
    await recurrence.generateDue(orgId, now);
    // Re-run the SAME window: push nextRunAt back and generate again — must not duplicate.
    await db.update(schema.recurringRules).set({ nextRunAt: new Date(firstRun) }).where(eq(schema.recurringRules.id, rule.id));
    await recurrence.generateDue(orgId, now);

    const occ = await db.select().from(schema.recurrenceOccurrences).where(eq(schema.recurrenceOccurrences.ruleId, rule.id));
    expect(occ).toHaveLength(1); // unique occurrence

    // Timezone: same instant, different tz → different local occurrence key.
    const instant = new Date("2026-01-01T20:00:00.000Z");
    expect(recurrence.occurrenceKeyFor(instant, "UTC")).toBe("2026-01-01");
    expect(recurrence.occurrenceKeyFor(instant, "Asia/Kolkata")).toBe("2026-01-02");
  });
});

describe("Phase 5 — import", () => {
  it("dry run validates and inserts nothing; run inserts valid rows and reports errors", async () => {
    const p = await projects.create(orgId, userId, { workspaceId, name: "Imp", keyPrefix: "IMP" });
    const rows = [{ Title: "Alpha", Priority: "high" }, { Title: "", Priority: "normal" }, { Title: "Beta", Priority: "weird" }];
    const mapping = { title: "Title", priority: "Priority" };

    const before = await itemCount(p.id);
    const dr = await imp.dryRun(orgId, rows, mapping);
    expect(dr.total).toBe(3);
    expect(dr.valid).toBe(1);
    expect(dr.errors).toHaveLength(2);
    expect(await itemCount(p.id)).toBe(before); // nothing inserted on dry run

    const res = await imp.run(orgId, userId, p.id, rows, mapping);
    expect(res.inserted).toBe(1);
    expect(res.failed).toBe(2);
    expect(await itemCount(p.id)).toBe(before + 1);
  });
});

describe("Phase 5 — export (counts/checksums match source)", () => {
  it("manifest counts and checksums reconcile with the exported content", async () => {
    const p = await projects.create(orgId, userId, { workspaceId, name: "Exp", keyPrefix: "EXP" });
    const a = await items.create(orgId, userId, { projectId: p.id, title: "one" });
    await items.create(orgId, userId, { projectId: p.id, title: "two" });
    await db.insert(schema.comments).values({ organizationId: orgId, workItemId: a.id, authorUserId: userId, body: "hi" });

    const { manifest, files } = await exp.exportProject(orgId, p.id);
    const wi = manifest.files.find((f) => f.name === "work_items.json")!;
    const cm = manifest.files.find((f) => f.name === "comments.json")!;
    expect(wi.count).toBe(2);
    expect(cm.count).toBe(1);
    // Checksums in the manifest match a fresh hash of the exported bytes.
    expect(wi.sha256).toBe(sha256(files["work_items.json"]));
    expect(cm.sha256).toBe(sha256(files["comments.json"]));
  });
});
