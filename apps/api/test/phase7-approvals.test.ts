import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ApprovalsService } from "../src/approvals/approvals.service.js";

describe("Phase 7 — approvals (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let items: WorkItemsService, svc: ApprovalsService;
  let org: string, A: string, B: string, C: string, ESC: string, projectId: string;
  const stagesOf = async (rid: string) => (await svc.get(org, rid)).stages;
  const item = async (t: string) => (await items.create(org, A, { projectId, title: t })).id;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db); svc = new ApprovalsService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const mk = async (n: string) => (await db.insert(schema.users).values({ email: n + "@x.io", displayName: n }).returning())[0].id;
    A = await mk("A"); B = await mk("B"); C = await mk("C"); ESC = await mk("E");
    for (const u of [A, B, C, ESC]) await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
    const w = await ws.create(org, A, "W"); projectId = (await projects.create(org, A, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("sequential all → any", async () => {
    const r = await svc.start(org, A, { workItemId: await item("seq"), mode: "sequential", stages: [{ name: "S0", rule: "all", approverUserIds: [A, B] }, { name: "S1", rule: "any", approverUserIds: [C] }] });
    const s = await stagesOf(r.id);
    expect((await svc.decide(org, A, s[0].id, "approved")).requestStatus).toBe("pending");
    expect((await svc.decide(org, B, s[0].id, "approved")).stageStatus).toBe("approved");
    expect((await svc.decide(org, C, s[1].id, "approved")).requestStatus).toBe("approved");
  });

  it("parallel any", async () => {
    const r = await svc.start(org, A, { workItemId: await item("par"), mode: "parallel", stages: [{ name: "P0", rule: "any", approverUserIds: [A] }, { name: "P1", rule: "any", approverUserIds: [B] }] });
    const s = await stagesOf(r.id);
    await svc.decide(org, A, s[0].id, "approved");
    expect((await svc.decide(org, B, s[1].id, "approved")).requestStatus).toBe("approved");
  });

  it("delegation lets the substitute decide", async () => {
    const r = await svc.start(org, A, { workItemId: await item("del"), mode: "sequential", stages: [{ name: "S0", rule: "any", approverUserIds: [A] }] });
    const s = await stagesOf(r.id);
    await svc.delegate(org, A, s[0].id, B);
    expect((await svc.queue(org, B)).some((q) => q.delegated)).toBe(true);
    expect((await svc.decide(org, B, s[0].id, "approved")).requestStatus).toBe("approved");
  });

  it("field lock + reapproval on locked change", async () => {
    const it = await item("reap");
    const r = await svc.start(org, A, { workItemId: it, mode: "sequential", stages: [{ name: "S0", rule: "any", approverUserIds: [A] }], lockedFields: ["dueDate"], reapprovalPolicy: "on_locked_change" });
    expect(await svc.isFieldLocked(org, it, "dueDate")).toBe(true);
    expect(await svc.isFieldLocked(org, it, "title")).toBe(false);
    await svc.decide(org, A, (await stagesOf(r.id))[0].id, "approved");
    expect((await svc.onTargetChange(org, it, ["title"])).reopened).toBe(0);
    expect((await svc.onTargetChange(org, it, ["dueDate"])).reopened).toBe(1);
    expect((await svc.get(org, r.id)).request.status).toBe("pending");
  });

  it("escalation adds the fallback approver to an overdue stage", async () => {
    const r = await svc.start(org, A, { workItemId: await item("esc"), mode: "sequential", stages: [{ name: "S0", rule: "any", approverUserIds: [A] }], escalationUserId: ESC });
    const s = await stagesOf(r.id);
    await db.update(schema.approvalStages).set({ dueAt: new Date(Date.now() - 3600_000) }).where(eq(schema.approvalStages.id, s[0].id));
    expect((await svc.escalateOverdue(org, new Date())).escalated).toBe(1);
    expect((await svc.get(org, r.id)).stages[0].approvers.some((a) => a.approverUserId === ESC)).toBe(true);
  });
});
