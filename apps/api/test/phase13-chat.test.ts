import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { ModulesService } from "../src/modules/modules.service.js";
import { ChatService } from "../src/chat/chat.service.js";

describe("Phase 13 — chat module (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let chat: ChatService, modules: ModulesService, items: WorkItemsService;
  let org: string, alice: string, bob: string, projectId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db);
    modules = new ModulesService(db); chat = new ChatService(db, modules, items);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "a@x.io", displayName: "alice" }).returning(); alice = a.id;
    const [b] = await db.insert(schema.users).values({ email: "b@x.io", displayName: "bob" }).returning(); bob = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: alice }, { organizationId: org, userId: bob }]);
    const w = await ws.create(org, alice, "W"); projectId = (await projects.create(org, alice, { workspaceId: w.id, name: "P", keyPrefix: "P" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("is disabled by default without affecting core work", async () => {
    await expect(chat.createChannel(org, alice, { name: "g" })).rejects.toThrow(/disabled/i);
    expect((await items.create(org, alice, { projectId, title: "core" })).title).toBe("core");
  });

  it("supports threads, private access control and authorised message-to-task", async () => {
    await modules.setEnabled(org, "chat", true, alice);
    const gen = await chat.createChannel(org, alice, { name: "general" });
    const m1 = await chat.postMessage(org, alice, gen.id, { body: "Ship notes Friday" });
    await chat.postMessage(org, bob, gen.id, { body: "ok", parentMessageId: m1.id });
    expect((await chat.listMessages(org, alice, gen.id)).length).toBe(2);

    const priv = await chat.createChannel(org, alice, { name: "secret", isPrivate: true });
    await expect(chat.postMessage(org, bob, priv.id, { body: "x" })).rejects.toThrow(/not a member/i);

    const conv = await chat.messageToTask(org, alice, m1.id, { projectId });
    expect(conv.workItem.title).toBe("Ship notes Friday");
    const [msg] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, m1.id));
    expect(msg.createdWorkItemId).toBe(conv.workItem.id);

    await modules.setEnabled(org, "chat", false, alice);
    await expect(chat.listChannels(org, alice)).rejects.toThrow(/disabled/i);
  });
});
