import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems } from "./work.js";
import { portfolios } from "./portfolios.js";

export const planningScenarios = pgTable("planning_scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  description: text("description"),
  projectId: uuid("project_id").references(() => projects.id),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id),
  status: text("status").default("draft").notNull(), // draft|review|approved|committed|archived
  objective: text("objective").default("earliest_delivery").notNull(),
  baseSnapshot: jsonb("base_snapshot").default({}).notNull(),
  baseVersionHash: text("base_version_hash").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("planning_scenarios_org_idx").on(t.organizationId, t.createdAt) }));

export const scenarioChanges = pgTable("scenario_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  scenarioId: uuid("scenario_id").notNull().references(() => planningScenarios.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  field: text("field").notNull(),
  beforeValue: jsonb("before_value"),
  afterValue: jsonb("after_value"),
  selectedForCommit: boolean("selected_for_commit").default(true).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byScenario: index("scenario_changes_scenario_idx").on(t.scenarioId) }));

export const scenarioRuns = pgTable("scenario_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  scenarioId: uuid("scenario_id").notNull().references(() => planningScenarios.id),
  kind: text("kind").default("schedule").notNull(),
  status: text("status").default("completed").notNull(),
  inputs: jsonb("inputs").default({}).notNull(),
  output: jsonb("output").default({}).notNull(),
  explanation: jsonb("explanation").default([]).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byScenario: index("scenario_runs_scenario_idx").on(t.scenarioId, t.createdAt) }));

export const planningWarnings = pgTable("planning_warnings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  scenarioId: uuid("scenario_id").notNull().references(() => planningScenarios.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  code: text("code").notNull(),
  severity: text("severity").default("warning").notNull(),
  message: text("message").notNull(),
  data: jsonb("data").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byScenario: index("planning_warnings_scenario_idx").on(t.scenarioId) }));

export const scenarioCommitProposals = pgTable("scenario_commit_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  scenarioId: uuid("scenario_id").notNull().references(() => planningScenarios.id),
  status: text("status").default("pending").notNull(),
  selectedChangeIds: jsonb("selected_change_ids").default([]).notNull(),
  conflicts: jsonb("conflicts").default([]).notNull(),
  rollbackSnapshot: jsonb("rollback_snapshot").default({}).notNull(),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
}, (t) => ({ byScenario: index("scenario_commit_proposals_scenario_idx").on(t.scenarioId) }));
