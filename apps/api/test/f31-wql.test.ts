import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WorkspacesService } from "../src/work/workspaces.service.js";
import { ProjectsService } from "../src/work/projects.service.js";
import { WorkItemsService } from "../src/work/work-items.service.js";
import { WqlService } from "../src/wql/wql.service.js";
import { parseWql } from "../src/wql/wql.js";

describe("F31 — WQL parser (pure)", () => {
  it("parses grouping, operators and functions; rejects unknown fields", () => {
    const ast = parseWql('status = "todo" AND (priority = "high" OR owner = currentUser())');
    expect(ast.type).toBe("and");
    expect(() => parseWql('bogus = "x"')).toThrow(/unknown or inaccessible/i);
    expect(() => parseWql("status =")).toThrow();
  });
});

describe("F31 — WQL execution + schemes (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let wql: WqlService, items: WorkItemsService, org: string, alice: string, bob: string, pub: string, secretId: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    const ws = new WorkspacesService(db), projects = new ProjectsService(db); items = new WorkItemsService(db); wql = new WqlService(db);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    await db.insert(schema.workItemTypes).values([{ organizationId: org, key: "task", name: "Task" }]);
    const [a] = await db.insert(schema.users).values({ email: "a@x.io", displayName: "alice" }).returning(); alice = a.id;
    const [b] = await db.insert(schema.users).values({ email: "b@x.io", displayName: "bob" }).returning(); bob = b.id;
    await db.insert(schema.organizationMemberships).values([{ organizationId: org, userId: alice }, { organizationId: org, userId: bob }]);
    const w = await ws.create(org, alice, "W");
    pub = (await projects.create(org, alice, { workspaceId: w.id, name: "Pub", keyPrefix: "PUB" })).id;
    const priv = await projects.create(org, bob, { workspaceId: w.id, name: "Priv", keyPrefix: "PRV" });
    await db.update(schema.projects).set({ privacy: "private" }).where(eq(schema.projects.id, priv.id));
    await items.create(org, alice, { projectId: pub, title: "Launch plan", priority: "high" });
    secretId = (await items.create(org, bob, { projectId: priv.id, title: "Launch secret", priority: "high" })).id;
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("executes permission-safe queries and manages schemes", async () => {
    const r = await wql.run(org, alice, 'priority = "high" AND title ~ "Launch"');
    expect(r.results.length).toBe(1); // alice sees only the public one
    expect(r.results.some((x) => x.id === secretId)).toBe(false);

    expect((await wql.run(org, alice, 'owner = currentUser()')).results.length).toBe(1);
    await expect(wql.run(org, alice, 'nope = "x"')).rejects.toThrow(/unknown or inaccessible/i);

    const sq = await wql.save(org, alice, "Launches", 'title ~ "Launch"');
    expect((await wql.listSaved(org)).some((x) => x.id === sq.id)).toBe(true);

    await wql.setLayout(org, "task", "create", ["title", "priority"]);
    expect((await wql.getLayout(org, "task", "create")).fields).toEqual(["title", "priority"]);
    expect((await wql.getLayout(org, "task", "edit")).fields).toContain("title"); // default fallback
  });
});
