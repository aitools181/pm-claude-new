import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ActionRegistry } from "../src/automation/action-registry.js";
import { AutomationService } from "../src/automation/automation.service.js";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let auto: AutomationService, registry: ActionRegistry;
let ws: WorkspacesService, projects: ProjectsService, items: WorkItemsService;
let orgId: string, userId: string, itemId: string;
const flaky = { count: 0 };

async function commentCount(workItemId: string) {
  const rows = await db.select().from(schema.comments).where(eq(schema.comments.workItemId, workItemId));
  return rows.length;
}

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });

  registry = new ActionRegistry();
  registry.register("test_fail_always", async () => { throw new Error("always fails"); });
  registry.register("test_flaky", async (_ctx, config) => { flaky.count++; if (flaky.count <= (config?.failTimes ?? 1)) throw new Error("flaky"); return { ok: true, at: flaky.count }; });
  auto = new AutomationService(db, registry);
  ws = new WorkspacesService(db); projects = new ProjectsService(db); items = new WorkItemsService(db);

  const [o] = await db.insert(schema.organizations).values({ name: "Org", slug: "org" }).returning(); orgId = o.id;
  await db.insert(schema.workItemTypes).values([{ organizationId: orgId, key: "task", name: "Task" }, { organizationId: orgId, key: "subtask", name: "Subtask" }]);
  const [u] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "U" }).returning(); userId = u.id;
  await db.insert(schema.organizationMemberships).values({ organizationId: orgId, userId });
  const w = await ws.create(orgId, userId, "Eng");
  const p = await projects.create(orgId, userId, { workspaceId: w.id, name: "P", keyPrefix: "P" });
  itemId = (await items.create(orgId, userId, { projectId: p.id, title: "Item" })).id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 5 — automation engine", () => {
  it("does not duplicate side effects for the same event id (idempotency)", async () => {
    const rule = await auto.createRule(orgId, userId, { name: "Comment on X", triggerType: "event", triggerConfig: { eventName: "X" } });
    await auto.addAction(orgId, rule.id, "add_comment", { workItemId: itemId, body: "auto" });
    const eid = crypto.randomUUID();
    await auto.dispatchEvent(orgId, "X", eid, { workItemId: itemId }, userId);
    await auto.dispatchEvent(orgId, "X", eid, { workItemId: itemId }, userId); // same event id
    expect(await commentCount(itemId)).toBe(1);
  });

  it("does not act on a dry run", async () => {
    const rule = await auto.createRule(orgId, userId, { name: "Dry", triggerType: "event", triggerConfig: { eventName: "DRY" } });
    await auto.addAction(orgId, rule.id, "add_comment", { workItemId: itemId, body: "should-not-persist" });
    const before = await commentCount(itemId);
    await auto.dispatchEvent(orgId, "DRY", crypto.randomUUID(), { workItemId: itemId }, userId, { dryRun: true });
    expect(await commentCount(itemId)).toBe(before);
  });

  it("retries a failing step within a run", async () => {
    flaky.count = 0;
    const rule = await auto.createRule(orgId, userId, { name: "Retry", triggerType: "manual" });
    await auto.addAction(orgId, rule.id, "test_flaky", { failTimes: 1 });
    const runId = (await auto.manualTrigger(orgId, rule.id, {}, userId))!;
    const [run] = await db.select().from(schema.automationRuns).where(eq(schema.automationRuns.id, runId));
    expect(run.status).toBe("succeeded");
    const [step] = await auto.steps(runId);
    expect(step.attempt).toBe(2); // failed once, succeeded on retry
  });

  it("fails, then replays safely without re-running succeeded steps", async () => {
    flaky.count = 0;
    const rule = await auto.createRule(orgId, userId, { name: "ReplayRule", triggerType: "manual" });
    await auto.addAction(orgId, rule.id, "add_comment", { workItemId: itemId, body: "replay-comment" }, 0);
    await auto.addAction(orgId, rule.id, "test_flaky", { failTimes: 3 }, 1); // fails all 3 attempts in the first run
    const before = await commentCount(itemId);

    const runId = (await auto.manualTrigger(orgId, rule.id, { workItemId: itemId }, userId))!;
    let [run] = await db.select().from(schema.automationRuns).where(eq(schema.automationRuns.id, runId));
    expect(run.status).toBe("failed");
    expect(await commentCount(itemId)).toBe(before + 1); // comment added once

    await auto.replay(orgId, runId); // flaky.count is now 3 → next attempt (4) succeeds
    [run] = await db.select().from(schema.automationRuns).where(eq(schema.automationRuns.id, runId));
    expect(run.status).toBe("succeeded");
    expect(await commentCount(itemId)).toBe(before + 1); // NOT duplicated on replay
  });

  it("detects and stops an automation loop, disabling the rule", async () => {
    const rule = await auto.createRule(orgId, userId, { name: "Looper", triggerType: "event", triggerConfig: { eventName: "LOOP" } });
    await auto.addAction(orgId, rule.id, "emit_event", { eventName: "LOOP" }); // re-emits its own trigger
    await auto.dispatchEvent(orgId, "LOOP", crypto.randomUUID(), {}, userId);

    const [after] = await db.select().from(schema.automationRules).where(eq(schema.automationRules.id, rule.id));
    expect(after.enabled).toBe(false);
    expect(after.disabledReason).toBe("loop_detected");
    const runs = await auto.runs(orgId, rule.id);
    expect(runs.length).toBeLessThanOrEqual(7); // bounded by MAX_DEPTH, not infinite
  });

  it("disables a rule on failure when configured", async () => {
    const rule = await auto.createRule(orgId, userId, { name: "SelfDisable", triggerType: "manual", disableOnFailure: true });
    await auto.addAction(orgId, rule.id, "test_fail_always", {});
    await auto.manualTrigger(orgId, rule.id, {}, userId);
    const [after] = await db.select().from(schema.automationRules).where(eq(schema.automationRules.id, rule.id));
    expect(after.enabled).toBe(false);
    expect(after.disabledReason).toBe("action_failed");
  });
});
