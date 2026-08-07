import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { getDb, schema } from "@pm/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { MaintenanceModeService } from "../src/maintenance-ops/maintenance-mode.service.js";
import { MaintenanceGuard } from "../src/maintenance-ops/maintenance.guard.js";
import { BackupScheduleService } from "../src/maintenance-ops/backup-schedule.service.js";
import { RestoreOrchestrator, type RestoreExecutors, type RestoreInput } from "../src/maintenance-ops/restore.orchestrator.js";
import { AuditService } from "../src/audit/audit.service.js";
import { AppError } from "@pm/shared";

let pg: StartedPostgreSqlContainer;
let db: ReturnType<typeof getDb>;
let maintenance: MaintenanceModeService, schedules: BackupScheduleService, orchestrator: RestoreOrchestrator, audit: AuditService;
let backupRunId: string;

const ctxFor = (method: string, url: string): any => ({ switchToHttp: () => ({ getRequest: () => ({ method, originalUrl: url, path: url }) }) });

function makeExec(over: Partial<RestoreExecutors> = {}): RestoreExecutors & { reverted: boolean } {
  const state = { reverted: false };
  const base: RestoreExecutors = {
    async pauseWorkers() {}, async resumeWorkers() {},
    async takePreRestoreBackup() { return crypto.randomUUID(); },
    async verifyChecksums() { return true; },
    async checkSchemaVersion() { return { ok: true, expected: "42", found: "42" }; },
    async checkAppVersion() { return { ok: true, expected: "1.0.0", found: "1.0.0" }; },
    async restoreToIsolated() { return { database: `restore_${Date.now()}`, objectNamespace: `ns_${Date.now()}` }; },
    async reconcile() { return { ok: true, db: 10, objects: 5, manifest: 10 }; },
    async cutover() {}, async revertCutover() { state.reverted = true; }, async postValidate() { return true; },
  };
  return Object.assign(base, over, state);
}
const input = (over: Partial<RestoreInput> = {}): RestoreInput => ({
  backupRunId, manifestPath: "/manifests/x.json",
  requestedTargetDatabase: "restore_db", requestedObjectNamespace: "restore_ns",
  primaryDatabase: "primary", primaryObjectNamespace: "primary_ns", ...over,
});

beforeAll(async () => {
  pg = await new PostgreSqlContainer("postgres:18-alpine").start();
  db = getDb(pg.getConnectionUri());
  await migrate(db, { migrationsFolder: "../../packages/db/migrations" });
  maintenance = new MaintenanceModeService(db); schedules = new BackupScheduleService(db); audit = new AuditService(db);
  orchestrator = new RestoreOrchestrator(db, maintenance, audit);
  const [b] = await db.insert(schema.backupRuns).values({ status: "completed", note: "seed" }).returning();
  backupRunId = b.id;
});
afterAll(async () => { await pg?.stop(); });

describe("Phase 5B — maintenance mode + mutation blocking", () => {
  it("blocks mutations while active, allows reads and maintenance endpoints, and clears", async () => {
    const guard = new MaintenanceGuard(maintenance);
    await maintenance.enter("restore in progress", "op");
    expect(await maintenance.isActive()).toBe(true);

    await expect(guard.canActivate(ctxFor("POST", "/api/v1/projects"))).rejects.toBeInstanceOf(AppError);
    expect(await guard.canActivate(ctxFor("GET", "/api/v1/projects"))).toBe(true);               // reads pass
    expect(await guard.canActivate(ctxFor("POST", "/api/v1/maintenance/exit"))).toBe(true);        // exit path allowed

    await maintenance.exit();
    expect(await maintenance.isActive()).toBe(false);
    expect(await guard.canActivate(ctxFor("POST", "/api/v1/projects"))).toBe(true);
  });
});

describe("Phase 5B — scheduled backups", () => {
  it("runs due schedules, detects missed runs, and records verification", async () => {
    const sch = await schedules.createSchedule({ name: "hourly", intervalMinutes: 60, retentionDays: 30, firstRunAt: new Date(Date.now() - 3 * 3600_000).toISOString() });
    const res = await schedules.tick(new Date());
    expect(res.count).toBe(1);
    const [after] = await db.select().from(schema.backupSchedules).where(eq(schema.backupSchedules.id, sch.id));
    expect(after.missedRuns).toBeGreaterThanOrEqual(2);           // ~3 intervals elapsed
    expect(new Date(after.nextRunAt).getTime()).toBeGreaterThan(Date.now()); // advanced to the future
    const alerts = await schedules.listAlerts();
    expect(alerts.some((a) => a.kind === "missed_run")).toBe(true);

    const v = await schedules.verify(res.ran[0], true);
    expect(v.ok).toBe(true);
  });

  it("prunes backups beyond the retention window", async () => {
    const [old] = await db.insert(schema.backupRuns).values({ status: "completed", note: "ancient", startedAt: new Date(Date.now() - 40 * 86_400_000) }).returning();
    await schedules.pruneRetention(new Date(), 30);
    const found = await db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, old.id));
    expect(found).toHaveLength(0);
  });
});

describe("Phase 5B — restore orchestration", () => {
  it("runs the full orchestrated restore and records immutable evidence", async () => {
    const res = await orchestrator.run(input(), makeExec(), "op") as any;
    expect(res.status).toBe("completed");
    const [rr] = await db.select().from(schema.restoreRuns).where(eq(schema.restoreRuns.id, res.restoreRunId));
    expect(rr.checksumsVerified && rr.schemaVersionOk && rr.appVersionOk && rr.reconciled && rr.postValidationOk).toBe(true);
    expect(rr.cutoverStatus).toBe("cutover");
    expect(rr.preRestoreBackupId).toBeTruthy();
    expect((rr.evidence as any[]).some((e) => e.step === "restore_isolated")).toBe(true);
    expect(await maintenance.isActive()).toBe(false); // maintenance exited after
    const events = await audit.listInstance();
    expect(events.some((e) => e.action === "restore.completed")).toBe(true);
  });

  it("refuses an in-place restore (must target a new isolated database)", async () => {
    await expect(orchestrator.run(input({ requestedTargetDatabase: "primary" }), makeExec(), "op")).rejects.toBeInstanceOf(AppError);
    const refused = (await db.select().from(schema.restoreRuns)).filter((r) => r.status === "refused");
    expect(refused.length).toBeGreaterThanOrEqual(1);
  });

  it("aborts on version mismatch BEFORE cutover", async () => {
    const res = await orchestrator.run(input(), makeExec({ checkSchemaVersion: async () => ({ ok: false, expected: "42", found: "41" }) }), "op") as any;
    expect(res.status).toBe("aborted");
    const [rr] = await db.select().from(schema.restoreRuns).where(eq(schema.restoreRuns.id, res.restoreRunId));
    expect(rr.schemaVersionOk).toBe(false);
    expect(rr.cutoverStatus).toBe("none");                        // never cut over
    const events = await audit.listInstance();
    expect(events.some((e) => e.action === "restore.aborted")).toBe(true);
  });

  it("aborts on reconciliation mismatch before cutover", async () => {
    const res = await orchestrator.run(input(), makeExec({ reconcile: async () => ({ ok: false, db: 9, objects: 5, manifest: 10 }) }), "op") as any;
    expect(res.status).toBe("aborted");
    const [rr] = await db.select().from(schema.restoreRuns).where(eq(schema.restoreRuns.id, res.restoreRunId));
    expect(rr.reconciled).toBe(false);
    expect(rr.cutoverStatus).toBe("none");
  });

  it("reverts the cutover when post-validation fails", async () => {
    const exec = makeExec({ postValidate: async () => false });
    const res = await orchestrator.run(input(), exec, "op") as any;
    expect(res.status).toBe("aborted");
    expect(exec.reverted).toBe(true);
    const [rr] = await db.select().from(schema.restoreRuns).where(eq(schema.restoreRuns.id, res.restoreRunId));
    expect(rr.cutoverStatus).toBe("reverted");
  });
});
