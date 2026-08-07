import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ModulesService } from "../src/modules/modules.service.js";
import { MockAiProvider } from "../src/ai/provider.js";
import { AiService } from "../src/ai/ai.service.js";

describe("Phase 13 — AI assistant (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let ai: AiService, modules: ModulesService, items: WorkItemsService, provider: MockAiProvider;
  let org: string, alice: string, bob: string, p1: string, pubId: string, secId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db);
    modules = new ModulesService(db); provider = new MockAiProvider(); ai = new AiService(db, modules, provider, items);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "a@x.io", displayName: "alice" }).returning(); alice = a.id;
    const [b] = await db.insert(schema.users).values({ email: "b@x.io", displayName: "bob" }).returning(); bob = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: alice }, { organizationId: org, userId: bob }]);
    const w = await ws.create(org, alice, "W");
    p1 = (await projects.create(org, alice, { workspaceId: w.id, name: "Public", keyPrefix: "PUB" })).id;
    const p2 = await projects.create(org, bob, { workspaceId: w.id, name: "Secret", keyPrefix: "SEC" });
    await db.update(schema.projects).set({ privacy: "private" }).where(eq(schema.projects.id, p2.id));
    pubId = (await items.create(org, alice, { projectId: p1, title: "Public plan for launch" })).id;
    secId = (await items.create(org, bob, { projectId: p2.id, title: "Secret plan classified" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("is disabled by default and cannot retrieve inaccessible content", async () => {
    await expect(ai.retrieve(org, alice, "plan")).rejects.toThrow(/disabled/i);
    await modules.setEnabled(org, "ai", true, alice);
    const res = await ai.retrieve(org, alice, "plan launch");
    expect(res.map((r) => r.id)).toContain(pubId);
    expect(res.map((r) => r.id)).not.toContain(secId); // permission-aware
    expect(res.every((r) => r.key)).toBe(true); // cites sources
  });

  it("proposes with citations, mutates only on confirmation, degrades and audits", async () => {
    const before = (await db.select().from(schema.workItems).where(eq(schema.workItems.organizationId, org))).length;
    const prop = await ai.proposeTask(org, alice, { projectId: p1, text: "Public plan rollout. Coordinate the launch.", useRetrieval: true });
    expect(prop.status).toBe("proposed");
    expect(prop.citations.length).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(schema.workItems).where(eq(schema.workItems.organizationId, org))).length).toBe(before); // no mutation

    const conf = await ai.confirmProposal(org, alice, prop.id);
    expect(conf.applied).toBe(true);
    expect((await db.select().from(schema.aiAuditLog).where(and(eq(schema.aiAuditLog.organizationId, org), eq(schema.aiAuditLog.event, "apply")))).length).toBe(1);

    provider.setHealthy(false);
    const degraded = await ai.proposeTask(org, alice, { projectId: p1, text: "handle outage" });
    expect(degraded.degraded).toBe(true);
    provider.setHealthy(true);

    await db.update(schema.aiSettings).set({ budgetTokens: 1, usedTokens: 0 }).where(eq(schema.aiSettings.organizationId, org));
    await expect(ai.proposeTask(org, alice, { projectId: p1, text: "a fairly long piece of text exceeding the tiny budget" })).rejects.toThrow(/budget/i);
  });
});
