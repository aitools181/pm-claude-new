import { Injectable, Inject, Optional } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { MaintenanceModeService } from "./maintenance-mode.service.js";
import { AuditService } from "../audit/audit.service.js";

export type RestoreInput = {
  backupRunId: string; manifestPath: string;
  requestedTargetDatabase: string; requestedObjectNamespace: string;
  primaryDatabase: string; primaryObjectNamespace: string;
};

/** The actual DB/object operations. Real impls live in the Maintenance CLI / one-shot container. */
export interface RestoreExecutors {
  pauseWorkers(): Promise<void>;
  resumeWorkers(): Promise<void>;
  takePreRestoreBackup(): Promise<string>;                 // returns a backup run id
  verifyChecksums(i: RestoreInput): Promise<boolean>;
  checkSchemaVersion(i: RestoreInput): Promise<{ ok: boolean; expected: string; found: string }>;
  checkAppVersion(i: RestoreInput): Promise<{ ok: boolean; expected: string; found: string }>;
  restoreToIsolated(i: RestoreInput): Promise<{ database: string; objectNamespace: string }>;
  reconcile(i: RestoreInput): Promise<{ ok: boolean; db: number; objects: number; manifest: number }>;
  cutover(i: RestoreInput): Promise<void>;
  revertCutover(i: RestoreInput): Promise<void>;
  postValidate(i: RestoreInput): Promise<boolean>;
}

/** Refuses to touch data — the normal API process must never run pg_restore. */
export const ApiRefusingExecutors: RestoreExecutors = {
  async pauseWorkers() {}, async resumeWorkers() {}, async takePreRestoreBackup() { return refuse(); },
  async verifyChecksums() { return refuse(); }, async checkSchemaVersion() { return refuse(); },
  async checkAppVersion() { return refuse(); }, async restoreToIsolated() { return refuse(); },
  async reconcile() { return refuse(); }, async cutover() { refuse(); }, async revertCutover() {}, async postValidate() { return refuse(); },
};
function refuse(): never { throw new AppError("FORBIDDEN", "The normal API process never runs pg_restore; execute via the Maintenance CLI or one-shot restore container"); }

@Injectable()
export class RestoreOrchestrator {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly maintenance: MaintenanceModeService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /** API path: record a restore REQUEST. Execution happens out-of-process (CLI). */
  async createRequest(input: RestoreInput, actorUserId: string) {
    const [rr] = await this.db.insert(schema.restoreRuns).values({
      backupRunId: input.backupRunId, manifestPath: input.manifestPath,
      targetDatabase: input.requestedTargetDatabase, targetObjectNamespace: input.requestedObjectNamespace, status: "running",
    }).returning();
    await this.audit?.append({ scopeType: "instance", actorUserId, action: "restore.requested", targetType: "restore_run", targetId: rr.id });
    return { restoreRunId: rr.id, message: "Restore queued. Execute via the Maintenance CLI or one-shot container." };
  }

  /** CLI path: run the full, orchestrated, reversible restore. */
  async run(input: RestoreInput, exec: RestoreExecutors, actorUserId: string) {
    // Hard isolation gate — a full restore may never target the primary.
    if (input.requestedTargetDatabase === input.primaryDatabase || input.requestedObjectNamespace === input.primaryObjectNamespace) {
      const [refused] = await this.db.insert(schema.restoreRuns).values({
        backupRunId: input.backupRunId, manifestPath: input.manifestPath, targetDatabase: input.requestedTargetDatabase,
        targetObjectNamespace: input.requestedObjectNamespace, status: "refused", evidence: [{ step: "isolation_check", ok: false }],
      }).returning();
      await this.audit?.append({ scopeType: "instance", actorUserId, action: "restore.refused", targetType: "restore_run", targetId: refused.id, metadata: { reason: "in_place" } });
      throw new AppError("VALIDATION", "In-place restore refused: a full restore must target a NEW isolated database and object namespace");
    }

    const [rr] = await this.db.insert(schema.restoreRuns).values({
      backupRunId: input.backupRunId, manifestPath: input.manifestPath,
      targetDatabase: input.requestedTargetDatabase, targetObjectNamespace: input.requestedObjectNamespace, status: "running",
    }).returning();
    const evidence: any[] = [];
    const record = (patch: Record<string, unknown>) => this.db.update(schema.restoreRuns).set(patch).where(eq(schema.restoreRuns.id, rr.id));

    try {
      await this.maintenance.enter("restore", actorUserId); await record({ maintenanceMode: true }); evidence.push({ step: "maintenance_enter", ok: true });
      await exec.pauseWorkers(); evidence.push({ step: "workers_paused", ok: true });

      const preId = await exec.takePreRestoreBackup(); await record({ preRestoreBackupId: preId }); evidence.push({ step: "pre_restore_backup", ok: true, backupId: preId });

      const cs = await exec.verifyChecksums(input); await record({ checksumsVerified: cs }); evidence.push({ step: "checksums", ok: cs });
      if (!cs) return this.abort(rr.id, evidence, actorUserId, "checksum/manifest verification failed");
      const sv = await exec.checkSchemaVersion(input); await record({ schemaVersionOk: sv.ok }); evidence.push({ step: "schema_version", ...sv });
      if (!sv.ok) return this.abort(rr.id, evidence, actorUserId, `schema version mismatch (found ${sv.found}, expected ${sv.expected})`);
      const av = await exec.checkAppVersion(input); await record({ appVersionOk: av.ok }); evidence.push({ step: "app_version", ...av });
      if (!av.ok) return this.abort(rr.id, evidence, actorUserId, `application version mismatch (found ${av.found}, expected ${av.expected})`);

      const target = await exec.restoreToIsolated(input);
      await record({ targetDatabase: target.database, targetObjectNamespace: target.objectNamespace }); evidence.push({ step: "restore_isolated", ok: true, ...target });
      if (target.database === input.primaryDatabase || target.objectNamespace === input.primaryObjectNamespace) return this.abort(rr.id, evidence, actorUserId, "isolated target collided with primary");

      const rec = await exec.reconcile(input); await record({ reconciled: rec.ok }); evidence.push({ step: "reconcile", ...rec });
      if (!rec.ok) return this.abort(rr.id, evidence, actorUserId, "database/object/manifest reconciliation mismatch");

      await exec.cutover(input); await record({ cutoverStatus: "cutover" }); evidence.push({ step: "cutover", ok: true });

      const pv = await exec.postValidate(input);
      if (!pv) { await exec.revertCutover(input); await record({ cutoverStatus: "reverted" }); evidence.push({ step: "post_validate", ok: false, reverted: true }); return this.abort(rr.id, evidence, actorUserId, "post-restore validation failed; cutover reverted"); }
      await record({ postValidationOk: true }); evidence.push({ step: "post_validate", ok: true });

      await record({ status: "completed", evidence, completedAt: new Date() });
      await this.audit?.append({ scopeType: "instance", actorUserId, action: "restore.completed", targetType: "restore_run", targetId: rr.id, metadata: { evidence } });
      return { status: "completed", restoreRunId: rr.id, evidence };
    } finally {
      try { await exec.resumeWorkers(); } catch { /* best effort */ }
      await this.maintenance.exit();
    }
  }

  private async abort(restoreRunId: string, evidence: any[], actorUserId: string, reason: string) {
    const full = [...evidence, { step: "abort", ok: false, reason }];
    await this.db.update(schema.restoreRuns).set({ status: "aborted", evidence: full, completedAt: new Date() }).where(eq(schema.restoreRuns.id, restoreRunId));
    await this.audit?.append({ scopeType: "instance", actorUserId, action: "restore.aborted", targetType: "restore_run", targetId: restoreRunId, metadata: { reason } });
    return { status: "aborted" as const, restoreRunId, reason, evidence: full };
  }
}
