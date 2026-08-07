import { pgTable, uuid, text, timestamp, bigint, boolean, jsonb, integer, index } from "drizzle-orm/pg-core";
/* ============================================================
 * BACKUP / RESTORE  (installation-level; system tables)
 * Restore is ALWAYS into an isolated DB + isolated object namespace.
 * The normal API process never runs pg_restore — only the Maintenance runtime.
 * ============================================================ */
export const backupRuns = pgTable("backup_runs", {
    id: uuid("id").primaryKey().defaultRandom(),
    status: text("status").default("running").notNull(), // running|completed|failed
    manifestPath: text("manifest_path"),
    note: text("note"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: text("created_by"), // operator identity (CLI)
});
export const backupArtifacts = pgTable("backup_artifacts", {
    id: uuid("id").primaryKey().defaultRandom(),
    backupRunId: uuid("backup_run_id").notNull().references(() => backupRuns.id),
    kind: text("kind").notNull(), // database|objects|config
    path: text("path").notNull(),
    sha256: text("sha256").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byRun: index("backup_artifacts_run_idx").on(t.backupRunId) }));
export const restoreRuns = pgTable("restore_runs", {
    id: uuid("id").primaryKey().defaultRandom(),
    backupRunId: uuid("backup_run_id").references(() => backupRuns.id),
    manifestPath: text("manifest_path").notNull(),
    targetDatabase: text("target_database").notNull(), // isolated DB name/URL (not primary)
    targetObjectNamespace: text("target_object_namespace").notNull(),
    checksumsVerified: boolean("checksums_verified").default(false).notNull(),
    schemaVersionOk: boolean("schema_version_ok").default(false).notNull(),
    appVersionOk: boolean("app_version_ok").default(false).notNull(),
    reconciled: boolean("reconciled").default(false).notNull(),
    preRestoreBackupId: uuid("pre_restore_backup_id"),
    maintenanceMode: boolean("maintenance_mode").default(false).notNull(),
    cutoverStatus: text("cutover_status").default("none").notNull(), // none|cutover|reverted
    postValidationOk: boolean("post_validation_ok").default(false).notNull(),
    status: text("status").default("running").notNull(), // running|completed|failed|refused|aborted
    evidence: jsonb("evidence"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
});
/* ============================================================
 * PHASE 5B — schedules, verification, alerts, maintenance mode
 * ============================================================ */
export const maintenanceMode = pgTable("maintenance_mode", {
    id: text("id").primaryKey().default("singleton"),
    active: boolean("active").default(false).notNull(),
    reason: text("reason"),
    startedBy: text("started_by"),
    startedAt: timestamp("started_at", { withTimezone: true }),
});
export const backupSchedules = pgTable("backup_schedules", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id"), // null = instance-wide
    name: text("name").notNull(),
    intervalMinutes: integer("interval_minutes").notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    retentionDays: integer("retention_days").default(30).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    missedRuns: integer("missed_runs").default(0).notNull(),
    lastStatus: text("last_status"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const backupVerifications = pgTable("backup_verifications", {
    id: uuid("id").primaryKey().defaultRandom(),
    backupRunId: uuid("backup_run_id").notNull().references(() => backupRuns.id),
    ok: boolean("ok").notNull(),
    detail: jsonb("detail"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).defaultNow().notNull(),
});
export const backupAlerts = pgTable("backup_alerts", {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // backup_failed|missed_run|verification_failed
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});
//# sourceMappingURL=backup.js.map