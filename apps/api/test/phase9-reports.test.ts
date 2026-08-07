import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { ReportService } from "../src/reports/report.service.js";

describe("Phase 9 — scheduled reports (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  const deliverer = { mode: "ok" as "ok" | "fail", async deliver() { if (this.mode === "fail") throw new Error("SMTP down"); } };
  let svc: ReportService, org: string, u: string;
  const ref = randomUUID();

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    svc = new ReportService(db, deliverer as any);
    const [o] = await db.insert(schema.organizations).values({ name: "O", slug: "o" }).returning(); org = o.id;
    const [a] = await db.insert(schema.users).values({ email: "u@x.io", displayName: "u" }).returning(); u = a.id;
    await db.insert(schema.organizationMemberships).values({ organizationId: org, userId: u });
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("delivers and logs each recipient", async () => {
    deliverer.mode = "ok";
    const def = await svc.createDefinition(org, u, { name: "W", kind: "metric", refId: ref, recipients: ["a@x.io", "b@x.io"] });
    expect((await svc.runNow(org, def.id)).status).toBe("delivered");
    const [run] = await db.select().from(schema.reportRuns).where(eq(schema.reportRuns.reportId, def.id));
    expect((await svc.deliveries(org, run.id)).length).toBe(2);
  });

  it("retries a failed run with backoff and gives up at max attempts", async () => {
    deliverer.mode = "fail";
    const def = await svc.createDefinition(org, u, { name: "F", kind: "metric", refId: ref, recipients: ["c@x.io"] });
    const r1 = await svc.runNow(org, def.id);
    expect(r1.status).toBe("retry_scheduled");
    const [run] = await db.select().from(schema.reportRuns).where(eq(schema.reportRuns.reportId, def.id));
    expect(run.error).toBe("SMTP down"); expect(run.nextRetryAt).toBeTruthy();
    await svc.retry(org, run.id);                       // attempt 2
    expect((await svc.retry(org, run.id)).status).toBe("failed"); // attempt 3 gives up
    await expect(svc.retry(org, run.id)).rejects.toThrow();
  });

  it("succeeds on retry after recovery and via the scheduler", async () => {
    deliverer.mode = "fail";
    const def = await svc.createDefinition(org, u, { name: "R", kind: "metric", refId: ref, recipients: ["d@x.io"] });
    await svc.runNow(org, def.id);
    const [run] = await db.select().from(schema.reportRuns).where(eq(schema.reportRuns.reportId, def.id));
    deliverer.mode = "ok";
    expect((await svc.retry(org, run.id)).status).toBe("delivered");

    const sched = await svc.createDefinition(org, u, { name: "S", kind: "metric", refId: ref, recipients: ["e@x.io"], frequency: "daily", nextRunAt: new Date(Date.now() - 1000).toISOString() });
    expect((await svc.runDue(org, new Date())).ran).toBeGreaterThanOrEqual(1);
    const [after] = await db.select().from(schema.reportDefinitions).where(eq(schema.reportDefinitions.id, sched.id));
    expect(new Date(after.nextRunAt!).getTime()).toBeGreaterThan(Date.now());
  });
});
