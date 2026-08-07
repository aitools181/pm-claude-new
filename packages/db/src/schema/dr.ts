import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { backupRuns } from "./backup.js";

/* ============================================================
 * DISASTER RECOVERY — Phase 12 (advanced: repeated drills, evidence)
 * Drills are restore *tests* (never touch the primary); they record
 * checksum integrity, reconciliation, RPO/RTO and pass/fail evidence.
 * ============================================================ */

export const restoreDrills = pgTable("restore_drills", {
  id: uuid("id").primaryKey().defaultRandom(),
  backupRunId: uuid("backup_run_id").notNull().references(() => backupRuns.id),
  target: text("target").default("fresh").notNull(),        // fresh|off_server|isolated
  status: text("status").default("running").notNull(),      // running|passed|failed
  checksumsOk: boolean("checksums_ok").default(false).notNull(),
  reconciled: boolean("reconciled").default(false).notNull(),
  appStarted: boolean("app_started").default(false).notNull(),
  rpoSeconds: integer("rpo_seconds"),                        // data age at drill time
  rtoSeconds: integer("rto_seconds"),                        // time to recover in the drill
  reconciliation: jsonb("reconciliation"),                   // {component:{expected,actual,match}}
  evidence: jsonb("evidence"),
  scheduledLabel: text("scheduled_label"),                   // e.g. weekly-regression
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byBackup: index("restore_drills_backup_idx").on(t.backupRunId), byStatus: index("restore_drills_status_idx").on(t.status, t.startedAt) }));
