import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * SCHEDULED REPORTS — Phase 9 (definitions, runs, deliveries, retry)
 * ============================================================ */

export const reportDefinitions = pgTable("report_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  kind: text("kind").notNull(),                 // dashboard|portfolio|metric
  refId: uuid("ref_id").notNull(),
  format: text("format").default("json").notNull(),   // json|csv|html
  frequency: text("frequency").default("weekly").notNull(), // daily|weekly|monthly
  recipients: jsonb("recipients").default([]).notNull(),    // string[]
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id),
  enabled: boolean("enabled").default(true).notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("report_definitions_org_idx").on(t.organizationId, t.enabled) }));

export const reportRuns = pgTable("report_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  reportId: uuid("report_id").notNull().references(() => reportDefinitions.id),
  status: text("status").default("pending").notNull(), // pending|running|delivered|failed|retry_scheduled
  attempt: integer("attempt").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  error: text("error"),
  contentSummary: jsonb("content_summary"),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byReport: index("report_runs_report_idx").on(t.reportId, t.createdAt) }));

export const reportDeliveries = pgTable("report_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  runId: uuid("run_id").notNull().references(() => reportRuns.id),
  recipient: text("recipient").notNull(),
  status: text("status").notNull(),             // delivered|failed
  error: text("error"),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byRun: index("report_deliveries_run_idx").on(t.runId) }));
