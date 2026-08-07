import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, schema } from "@pm/db";

let pg: StartedPostgreSqlContainer;

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  process.env.DATABASE_URL = pg.getConnectionUri();
  const db = getDb(process.env.DATABASE_URL);
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
});
afterAll(async () => { await pg?.stop(); });

describe("worker idempotency", () => {
  it("runs the effect once for a repeated idempotency key", async () => {
    const { runIdempotent } = await import("../src/job-runner.js");
    const effect = vi.fn(async () => ({ done: true }));
    const job = { idempotencyKey: "k-1", payload: {} };
    await runIdempotent(job, effect);
    await runIdempotent(job, effect); // repeat
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it("refuses a scoped job with no valid membership", async () => {
    const { runIdempotent } = await import("../src/job-runner.js");
    await expect(
      runIdempotent({ idempotencyKey: "k-2", organizationId: crypto.randomUUID(), actorUserId: crypto.randomUUID(), payload: {} }, async () => ({})),
    ).rejects.toThrow(/no active membership/i);
  });
});
