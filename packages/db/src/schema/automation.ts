import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations } from "./identity.js";

/* ============================================================
 * AUTOMATION  (WHEN → IF → THEN)  — internal triggers only
 * ============================================================ */
export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  triggerType: text("trigger_type").notNull(),           // event|schedule|manual
  triggerConfig: jsonb("trigger_config"),                // { eventName } | { cron, timezone } | {}
  enabled: boolean("enabled").default(true).notNull(),
  disableOnFailure: boolean("disable_on_failure").default(false).notNull(),
  disabledReason: text("disabled_reason"),
  failureCount: integer("failure_count").default(0).notNull(),
  ...auditColumns,
}, (t) => ({ byOrg: index("automation_rules_org_idx").on(t.organizationId) }));

export const automationConditions = pgTable("automation_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ruleId: uuid("rule_id").notNull().references(() => automationRules.id),
  kind: text("kind").notNull(),                          // payload_equals|always
  config: jsonb("config"),
});

export const automationActions = pgTable("automation_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ruleId: uuid("rule_id").notNull().references(() => automationRules.id),
  kind: text("kind").notNull(),                          // add_comment|set_priority|emit_event|...
  config: jsonb("config"),
  rank: integer("rank").default(0).notNull(),
});

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  ruleId: uuid("rule_id").notNull().references(() => automationRules.id),
  triggerType: text("trigger_type").notNull(),
  status: text("status").default("pending").notNull(),   // pending|running|succeeded|failed|skipped|dry_run|loop_detected
  dedupeKey: text("dedupe_key").notNull(),               // rule + event id → idempotency
  depth: integer("depth").default(0).notNull(),          // causation depth (loop detection)
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({ dedupeUnique: uniqueIndex("automation_runs_dedupe_unique").on(t.dedupeKey), byRule: index("automation_runs_rule_idx").on(t.ruleId) }));

export const automationRunSteps = pgTable("automation_run_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  runId: uuid("run_id").notNull().references(() => automationRuns.id),
  actionId: uuid("action_id"),
  kind: text("kind").notNull(),
  rank: integer("rank").default(0).notNull(),
  status: text("status").default("pending").notNull(),   // pending|succeeded|failed|skipped|dry_run
  attempt: integer("attempt").default(0).notNull(),
  output: jsonb("output"),
  error: text("error"),
}, (t) => ({ byRun: index("automation_run_steps_run_idx").on(t.runId) }));
