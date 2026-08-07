import { Injectable, Inject } from "@nestjs/common";
import { and, eq, lte, lt, inArray, isNull, desc } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

@Injectable()
export class BackupScheduleService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async createSchedule(input: { organizationId?: string | null; name: string; intervalMinutes: number; timezone?: string; retentionDays?: number; firstRunAt: string }) {
    const [s] = await this.db.insert(schema.backupSchedules).values({
      organizationId: input.organizationId ?? null, name: input.name, intervalMinutes: input.intervalMinutes,
      timezone: input.timezone ?? "UTC", retentionDays: input.retentionDays ?? 30, nextRunAt: new Date(input.firstRunAt),
    }).returning();
    return s;
  }
  listSchedules() { return this.db.select().from(schema.backupSchedules); }
  listAlerts() { return this.db.select().from(schema.backupAlerts).where(isNull(schema.backupAlerts.acknowledgedAt)); }

  async listBackups(limit = 50) {
    const runs = await this.db.select().from(schema.backupRuns).orderBy(desc(schema.backupRuns.startedAt)).limit(limit);
    const verifs = await this.db.select().from(schema.backupVerifications);
    return runs.map((r) => ({ ...r, verified: verifs.some((v) => v.backupRunId === r.id && v.ok) }));
  }

  private async alert(kind: string, message: string) { await this.db.insert(schema.backupAlerts).values({ kind, message }); }

  /** Run all due schedules; detect missed runs; advance the schedule; apply retention. */
  async tick(now: Date, opts: { fail?: boolean } = {}) {
    const due = await this.db.select().from(schema.backupSchedules)
      .where(and(eq(schema.backupSchedules.enabled, true), lte(schema.backupSchedules.nextRunAt, now)));
    const ran: string[] = [];
    for (const sch of due) {
      const intervalMs = sch.intervalMinutes * 60_000;
      const elapsed = Math.floor((now.getTime() - new Date(sch.nextRunAt).getTime()) / intervalMs);
      let missed = sch.missedRuns;
      if (elapsed >= 1) { missed += elapsed; await this.alert("missed_run", `Schedule "${sch.name}" missed ${elapsed} run(s)`); }

      if (opts.fail) {
        await this.alert("backup_failed", `Scheduled backup "${sch.name}" failed`);
        await this.db.update(schema.backupSchedules).set({ lastStatus: "failed", missedRuns: missed }).where(eq(schema.backupSchedules.id, sch.id));
        continue;
      }
      const [run] = await this.db.insert(schema.backupRuns).values({ status: "completed", note: `scheduled: ${sch.name}`, createdBy: "scheduler", completedAt: now }).returning();
      ran.push(run.id);
      await this.db.update(schema.backupSchedules).set({ lastRunAt: now, lastStatus: "completed", missedRuns: missed, nextRunAt: new Date(now.getTime() + intervalMs) }).where(eq(schema.backupSchedules.id, sch.id));
      await this.pruneRetention(now, sch.retentionDays);
    }
    return { ran, count: ran.length };
  }

  /** Retention: drop backups (and their children) older than retentionDays. */
  async pruneRetention(now: Date, retentionDays: number) {
    const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
    const old = await this.db.select({ id: schema.backupRuns.id }).from(schema.backupRuns).where(lt(schema.backupRuns.startedAt, cutoff));
    const ids = old.map((r) => r.id);
    if (ids.length === 0) return { pruned: 0 };
    await this.db.delete(schema.backupVerifications).where(inArray(schema.backupVerifications.backupRunId, ids));
    await this.db.delete(schema.backupArtifacts).where(inArray(schema.backupArtifacts.backupRunId, ids));
    await this.db.delete(schema.backupRuns).where(inArray(schema.backupRuns.id, ids));
    return { pruned: ids.length };
  }

  /** Record a verification result for a backup run. */
  async verify(backupRunId: string, ok = true, detail?: unknown) {
    const [run] = await this.db.select().from(schema.backupRuns).where(eq(schema.backupRuns.id, backupRunId)).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Backup run not found");
    const [v] = await this.db.insert(schema.backupVerifications).values({ backupRunId, ok, detail: detail as object }).returning();
    if (!ok) await this.alert("verification_failed", `Backup ${backupRunId} failed verification`);
    return v;
  }
}
