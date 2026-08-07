import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { WorkflowService } from "../src/workflow/workflow.service.js";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let wf: WorkflowService, ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService;
let orgId: string, lead: string, plain: string;
let workflowId: string, v1: string;
let sTodo: string, sDoing: string, sDone: string, tStart: string, tFinish: string;
let itemId: string;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  wf = new WorkflowService(db); ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);

  const [o] = await db.insert(schema.organizations).values({ name: "Org", slug: "org" }).returning(); orgId = o.id;
  await db.insert(schema.workItemTypes).values([{ organizationId: orgId, key: "task", name: "Task" }, { organizationId: orgId, key: "subtask", name: "Subtask" }]);
  const [ul] = await db.insert(schema.users).values({ email: "lead@x.io", displayName: "lead" }).returning(); lead = ul.id;
  const [up] = await db.insert(schema.users).values({ email: "plain@x.io", displayName: "plain" }).returning(); plain = up.id;
  await db.insert(schema.organizationMemberships).values([{ organizationId: orgId, userId: lead }, { organizationId: orgId, userId: plain }]);
  await db.insert(schema.userRoleAssignments).values({ organizationId: orgId, userId: lead, roleKey: "lead" });

  const created = await wf.create(orgId, lead, "Dev Flow");
  workflowId = created.workflow.id; v1 = created.version.id;
  sTodo = (await wf.addStatus(orgId, v1, { key: "todo", name: "To Do", category: "todo", isInitial: true })).id;
  sDoing = (await wf.addStatus(orgId, v1, { key: "doing", name: "Doing", category: "in_progress" })).id;
  sDone = (await wf.addStatus(orgId, v1, { key: "done", name: "Done", category: "done" })).id;
  tStart = (await wf.addTransition(orgId, v1, { name: "Start", fromStatusId: sTodo, toStatusId: sDoing })).id;
  tFinish = (await wf.addTransition(orgId, v1, { name: "Finish", fromStatusId: sDoing, toStatusId: sDone })).id;
  await wf.addRule(orgId, tFinish, "condition", "role", { roleKey: "lead" });
  await wf.addRule(orgId, tFinish, "validator", "field_required", { fieldKey: "signoff" });
  await db.insert(schema.customFieldDefinitions).values({ organizationId: orgId, key: "signoff", name: "Sign-off", fieldType: "text" });

  await wf.publish(orgId, lead, v1);

  const w = await ws.create(orgId, lead, "Eng");
  const p = await projects.create(orgId, lead, { workspaceId: w.id, name: "P", keyPrefix: "P" });
  itemId = (await items.create(orgId, lead, { projectId: p.id, title: "Ticket" })).id;
  await wf.bindItem(orgId, workflowId, itemId);
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 4 — published workflow is immutable", () => {
  it("rejects edits to a published version", async () => {
    await expect(wf.addStatus(orgId, v1, { key: "x", name: "X" })).rejects.toBeInstanceOf(AppError);
  });
});

describe("Phase 4 — transitions, conditions, validators", () => {
  it("offers only valid transitions from the current status", async () => {
    const actions = await wf.availableActions(orgId, lead, itemId);
    expect(actions.map((a) => a.name)).toEqual(["Start"]);
  });

  it("blocks an invalid transition with a precise reason", async () => {
    await expect(wf.transition(orgId, lead, itemId, tFinish)).rejects.toMatchObject({ message: /not available from the current status/ });
  });

  it("moves through a valid transition", async () => {
    await wf.transition(orgId, lead, itemId, tStart);
    const [it] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, itemId));
    expect(it.status).toBe("Doing");
  });

  it("hides a role-gated transition from users without the role", async () => {
    const asPlain = await wf.availableActions(orgId, plain, itemId);
    expect(asPlain.map((a) => a.name)).not.toContain("Finish");
    await expect(wf.transition(orgId, plain, itemId, tFinish)).rejects.toMatchObject({ message: /requires role "lead"/ });
  });

  it("enforces a validator with a precise reason, then succeeds once satisfied", async () => {
    await expect(wf.transition(orgId, lead, itemId, tFinish)).rejects.toMatchObject({ message: /"signoff" must be set/ });
    const [def] = await db.select().from(schema.customFieldDefinitions).where(eq(schema.customFieldDefinitions.key, "signoff"));
    await db.insert(schema.customFieldValues).values({ organizationId: orgId, workItemId: itemId, fieldId: def.id, valueText: "approved" });
    await wf.transition(orgId, lead, itemId, tFinish);
    const [it] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, itemId));
    expect(it.statusCategory).toBe("done");
  });
});

describe("Phase 4 — versioning + migration", () => {
  it("branches a new draft and migrates bound items by status key", async () => {
    const v2 = await wf.newDraftVersion(orgId, lead, workflowId);
    const preview = await wf.migrationPreview(workflowId, v2.id);
    const mine = preview.find((p) => p.workItemId === itemId);
    expect(mine?.mapsCleanly).toBe(true);           // 'done' key exists in the clone
    await wf.migrate(orgId, workflowId, v2.id);
    const [state] = await db.select().from(schema.workItemWorkflowState).where(eq(schema.workItemWorkflowState.workItemId, itemId));
    expect(state.versionId).toBe(v2.id);
  });
});
