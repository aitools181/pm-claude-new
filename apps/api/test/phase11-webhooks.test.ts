import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { WebhookService } from "../src/webhooks/webhook.service.js";
import { signPayload, verifySignature } from "../src/webhooks/webhook-signing.js";

describe("Phase 11 — webhook signing (pure)", () => {
  it("verifies, and rejects tampering and stale timestamps", () => {
    const ts = Math.floor(Date.now() / 1000);
    const sig = signPayload("s", ts, "d1", "{}");
    expect(verifySignature("s", ts, "d1", "{}", sig)).toBe(true);
    expect(verifySignature("s", ts, "d1", '{"x":1}', sig)).toBe(false);
    expect(verifySignature("s", ts - 1000, "d1", "{}", signPayload("s", ts - 1000, "d1", "{}"))).toBe(false);
  });
});

describe("Phase 11 — webhook delivery & retries (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  const sender = { mode: "ok" as "ok" | "fail", async send() { if (this.mode === "fail") throw new Error("ECONNREFUSED"); return { status: 200 }; } };
  let svc: WebhookService, org: string, u: string;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    svc = new WebhookService(db, sender as any);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("delivers matching events, masks secrets, retries to give-up, then replays", async () => {
    const sub = await svc.create(org, u, { url: "https://example.com/hook", events: ["work_item.created"] });
    expect((await svc.list(org))[0]).not.toHaveProperty("secret");

    sender.mode = "ok";
    expect((await svc.emit(org, "work_item.created", { id: "WI-1" })).results[0].status).toBe("delivered");
    expect((await svc.emit(org, "other.event", {})).emitted).toBe(0);

    sender.mode = "fail";
    const f = await svc.emit(org, "work_item.created", { id: "WI-2" });
    const fid = f.results[0].deliveryId;
    await svc.retry(org, fid); await svc.retry(org, fid);
    expect((await svc.retry(org, fid)).status).toBe("failed");
    const [row] = await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.id, fid));
    expect(row.attempt).toBe(4);
    await expect(svc.retry(org, fid)).rejects.toThrow();

    sender.mode = "ok";
    const replay = await svc.replay(org, fid);
    expect(replay.status).toBe("delivered");
    expect(replay.deliveryId).not.toBe(fid);
  });
});
