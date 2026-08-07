import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

type Provided = { kind: string; sha256: string };
type Reconciliation = Record<string, { expected: number; actual: number }>;

@Injectable()
export class DrService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Compare provided artifact checksums against the stored manifest — detects corruption. */
  async verifyChecksums(backupRunId: string, provided: Provided[]) {
    const artifacts = await this.db.select().from(schema.backupArtifacts).where(eq(schema.backupArtifacts.backupRunId, backupRunId));
    if (!artifacts.length) throw new AppError("NOT_FOUND", "No artifacts for backup run");
    const components = artifacts.map((a) => {
      const p = provided.find((x) => x.kind === a.kind);
      return { kind: a.kind, expected: a.sha256, provided: p?.sha256 ?? null, match: !!p && p.sha256 === a.sha256 };
    });
    return { ok: components.every((c) => c.match), components };
  }

  /** Run a restore drill against an isolated/off-server target and record recovery evidence. */
  async runDrill(input: { backupRunId: string; target?: "fresh" | "off_server" | "isolated"; provided: Provided[]; reconciliation: Reconciliation; appStarted?: boolean; rtoSeconds?: number; scheduledLabel?: string; now?: Date }) {
    const [run] = await this.db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, input.backupRunId)).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Backup run not found");
    const now = input.now ?? new Date();

    const checksum = await this.verifyChecksums(input.backupRunId, input.provided);
    const reconciliation: Record<string, { expected: number; actual: number; match: boolean }> = {};
    for (const [k, v] of Object.entries(input.reconciliation)) reconciliation[k] = { ...v, match: v.expected === v.actual };
    const reconciled = Object.values(reconciliation).every((r) => r.match);
    const appStarted = input.appStarted ?? true;

    const dataAt = (run.completedAt ?? run.startedAt) as Date;
    const rpoSeconds = Math.max(0, Math.round((now.getTime() - new Date(dataAt).getTime()) / 1000));
    const rtoSeconds = input.rtoSeconds ?? 0;
    const passed = checksum.ok && reconciled && appStarted;

    const evidence = { target: input.target ?? "fresh", checksums: checksum.components, reconciliation, rpoSeconds, rtoSeconds, appStarted, verifiedAt: now.toISOString() };
    const [drill] = await this.db.insert(schema.restoreDrills).values({
      backupRunId: input.backupRunId, target: input.target ?? "fresh", status: passed ? "passed" : "failed",
      checksumsOk: checksum.ok, reconciled, appStarted, rpoSeconds, rtoSeconds, reconciliation, evidence,
      scheduledLabel: input.scheduledLabel ?? null, finishedAt: now,
      notes: passed ? null : `checksums=${checksum.ok} reconciled=${reconciled} appStarted=${appStarted}`,
    }).returning();
    return { id: drill.id, status: drill.status, checksumsOk: checksum.ok, reconciled, appStarted, rpoSeconds, rtoSeconds, evidence };
  }

  listDrills(backupRunId?: string) {
    const q = this.db.select().from(schema.restoreDrills);
    return backupRunId ? q.where(eq(schema.restoreDrills.backupRunId, backupRunId)).orderBy(desc(schema.restoreDrills.startedAt)) : q.orderBy(desc(schema.restoreDrills.startedAt)).limit(50);
  }

  /** Recovery evidence dashboard: latest drill, pass rate, and last good RPO/RTO. */
  async recoveryEvidence() {
    const drills = await this.db.select().from(schema.restoreDrills).orderBy(desc(schema.restoreDrills.startedAt)).limit(100);
    const total = drills.length, passed = drills.filter((d) => d.status === "passed").length;
    const lastPassed = drills.find((d) => d.status === "passed");
    return {
      total, passed, passRate: total ? Math.round((passed / total) * 100) : 0,
      latest: drills[0] ? { id: drills[0].id, status: drills[0].status, at: drills[0].startedAt } : null,
      lastGoodRecovery: lastPassed ? { at: lastPassed.finishedAt, rpoSeconds: lastPassed.rpoSeconds, rtoSeconds: lastPassed.rtoSeconds, target: lastPassed.target } : null,
    };
  }
}
