import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems, workspaces } from "./work.js";

export const aiTeammates = pgTable("ai_teammates", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  role: text("role").notNull(),
  skills: jsonb("skills").default([]).notNull(),
  allowedProjectIds: jsonb("allowed_project_ids").default([]).notNull(),
  humanOwnerUserId: uuid("human_owner_user_id").notNull().references(() => users.id),
  provider: text("provider").default("default").notNull(),
  model: text("model"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("ai_teammates_org_name_unique").on(t.organizationId, t.name) }));

export const agentPolicies = pgTable("agent_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  teammateId: uuid("teammate_id").notNull().references(() => aiTeammates.id),
  allowedActions: jsonb("allowed_actions").default([]).notNull(),
  destructiveActions: jsonb("destructive_actions").default([]).notNull(),
  externalSendRequiresCheckpoint: boolean("external_send_requires_checkpoint").default(true).notNull(),
  massMutationLimit: integer("mass_mutation_limit").default(10).notNull(),
  maxRunTokens: integer("max_run_tokens").default(10000).notNull(),
  maxDailyTokens: integer("max_daily_tokens").default(50000).notNull(),
  retentionDays: integer("retention_days").default(30).notNull(),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("agent_policies_teammate_unique").on(t.teammateId) }));

export const agentToolGrants = pgTable("agent_tool_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  teammateId: uuid("teammate_id").notNull().references(() => aiTeammates.id),
  toolKey: text("tool_key").notNull(),
  scope: jsonb("scope").default({}).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  grantedByUserId: uuid("granted_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("agent_tool_grants_unique").on(t.teammateId, t.toolKey) }));

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  teammateId: uuid("teammate_id").notNull().references(() => aiTeammates.id),
  initiatedByUserId: uuid("initiated_by_user_id").notNull().references(() => users.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  task: text("task").notNull(),
  status: text("status").default("running").notNull(),
  input: jsonb("input").default({}).notNull(),
  output: jsonb("output").default({}).notNull(),
  citations: jsonb("citations").default([]).notNull(),
  toolCalls: jsonb("tool_calls").default([]).notNull(),
  timeline: jsonb("timeline").default([]).notNull(),
  tokensUsed: integer("tokens_used").default(0).notNull(),
  costMicros: integer("cost_micros").default(0).notNull(),
  qualityScore: integer("quality_score"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byTeammate: index("agent_runs_teammate_idx").on(t.teammateId, t.startedAt) }));

export const aiMemoryRecords = pgTable("ai_memory_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  teammateId: uuid("teammate_id").notNull().references(() => aiTeammates.id),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  projectId: uuid("project_id").references(() => projects.id),
  scopeType: text("scope_type").default("project").notNull(),
  memoryKey: text("memory_key").notNull(),
  content: text("content").notNull(),
  sourceRefs: jsonb("source_refs").default([]).notNull(),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byScope: index("ai_memory_scope_idx").on(t.organizationId, t.teammateId, t.scopeType, t.projectId) }));

export const humanCheckpoints = pgTable("human_checkpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  agentRunId: uuid("agent_run_id").notNull().references(() => agentRuns.id),
  actionKey: text("action_key").notNull(),
  proposal: jsonb("proposal").default({}).notNull(),
  status: text("status").default("pending").notNull(),
  requiredRoleKey: text("required_role_key"),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
  decisionReason: text("decision_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (t) => ({ byRun: index("human_checkpoints_run_idx").on(t.agentRunId, t.status) }));

export const aiUsageBudgets = pgTable("ai_usage_budgets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  teammateId: uuid("teammate_id").references(() => aiTeammates.id),
  period: text("period").default("monthly").notNull(),
  tokenLimit: integer("token_limit").default(100000).notNull(),
  tokenUsed: integer("token_used").default(0).notNull(),
  costLimitMicros: integer("cost_limit_micros").default(0).notNull(),
  costUsedMicros: integer("cost_used_micros").default(0).notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("ai_usage_budgets_unique").on(t.organizationId, t.teammateId, t.period, t.periodStart) }));
