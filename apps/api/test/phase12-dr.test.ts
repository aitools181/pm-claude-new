import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { DrService } from "../src/dr/dr.service.js";

describe("Phase 12 — advanced DR drills (DB)", () => {
  let pg: StartedPostgreSqlContainer, db: ReturnType<typeof getDb>;
  let svc: DrService, runId: string;
  const good = [{ kind: "database", sha256: "db" }, { kind: "objects", sha256: "obj" }, { kind: "config", sha256: "cfg" }];
  const recon = { database: { expected: 5000, actual: 5000 }, objects: { expected: 120, actual: 120 }, config: { expected: 1, actual: 1 } };

  beforeAll(async () => {
    pg = await new PostgreSqlContainer("postgres:18-alpine").start();
    db = getDb(pg.getConnectionUri());
    await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
    svc = new DrService(db);
    const at = new Date(Date.now() - 2 * 3600 * 1000);
    const [run] = await db.insert(schema.backupRuns).values({ status: "completed", startedAt: at, completedAt: at, createdBy: "cli" }).returning();
    runId = run.id;
    for (const a of good) await db.insert(schema.backupArtifacts).values({ backupRunId: runId, kind: a.kind, path: "/b/" + a.kind, sha256: a.sha256, bytes: 1000 });
  }, 120_000);
  afterAll(async () => { await pg?.stop(); });

  it("verifies checksums and detects tampering", async () => {
    expect((await svc.verifyChecksums(runId, good)).ok).toBe(true);
    const bad = await svc.verifyChecksums(runId, [{ kind: "database", sha256: "X" }, ...good.slice(1)]);
    expect(bad.ok).toBe(false);
  });

  it("passes a clean drill and fails corruption / storage-loss / app-down scenarios", async () => {
    const ok = await svc.runDrill({ backupRunId: runId, target: "off_server", provided: good, reconciliation: recon, appStarted: true, rtoSeconds: 180 });
    expect(ok.status).toBe("passed");
    expect(ok.rpoSeconds).toBeGreaterThanOrEqual(7000);
    expect(ok.rtoSeconds).toBe(180);

    expect((await svc.runDrill({ backupRunId: runId, provided: [{ kind: "database", sha256: "BAD" }, ...good.slice(1)], reconciliation: recon, appStarted: true })).status).toBe("failed");
    expect((await svc.runDrill({ backupRunId: runId, provided: good, reconciliation: { ...recon, objects: { expected: 120, actual: 118 } }, appStarted: true })).status).toBe("failed");
    expect((await svc.runDrill({ backupRunId: runId, provided: good, reconciliation: recon, appStarted: false })).status).toBe("failed");

    const ev = await svc.recoveryEvidence();
    expect(ev.passed).toBe(1);
    expect(ev.lastGoodRecovery?.rtoSeconds).toBe(180);
  });
});
