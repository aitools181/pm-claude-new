import { pgTable, uuid, text, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";

/* ============================================================
 * APPROVALS — Phase 7 (models / delegation / escalation / reapproval)
 * ============================================================ */

/** Reusable approval spec. stages = [{ name, rule: any|all, approverUserIds: uuid[] }]. */
export const approvalDefinitions = pgTable("approval_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  mode: text("mode").default("sequential").notNull(),          // sequential|parallel
  stages: jsonb("stages").notNull(),
  lockedFields: jsonb("locked_fields").default([]).notNull(),   // string[]
  reapprovalPolicy: text("reapproval_policy").default("none").notNull(), // none|on_locked_change
  escalationUserId: uuid("escalation_user_id").references(() => users.id),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  definitionId: uuid("definition_id").references(() => approvalDefinitions.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  mode: text("mode").default("sequential").notNull(),
  status: text("status").default("pending").notNull(),         // pending|approved|rejected|cancelled
  currentStageIndex: integer("current_stage_index").default(0).notNull(),
  lockedFields: jsonb("locked_fields").default([]).notNull(),
  reapprovalPolicy: text("reapproval_policy").default("none").notNull(),
  escalationUserId: uuid("escalation_user_id").references(() => users.id),
  round: integer("round").default(1).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (t) => ({ byItem: index("approval_requests_item_idx").on(t.organizationId, t.workItemId) }));

export const approvalStages = pgTable("approval_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  requestId: uuid("request_id").notNull().references(() => approvalRequests.id),
  index: integer("index").notNull(),
  name: text("name").notNull(),
  rule: text("rule").default("any").notNull(),                 // any|all
  status: text("status").default("pending").notNull(),        // pending|active|approved|rejected|skipped
  dueAt: timestamp("due_at", { withTimezone: true }),
  round: integer("round").default(1).notNull(),
}, (t) => ({ byRequest: index("approval_stages_request_idx").on(t.requestId) }));

export const approvalDecisions = pgTable("approval_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  stageId: uuid("stage_id").notNull().references(() => approvalStages.id),
  approverUserId: uuid("approver_user_id").notNull().references(() => users.id),
  delegateToUserId: uuid("delegate_to_user_id").references(() => users.id),
  decision: text("decision"),                                 // null=pending | approved | rejected
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
  comment: text("comment"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
}, (t) => ({ byStage: index("approval_decisions_stage_idx").on(t.stageId), byApprover: index("approval_decisions_approver_idx").on(t.organizationId, t.approverUserId) }));

export const approvalEvents = pgTable("approval_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  requestId: uuid("request_id").notNull().references(() => approvalRequests.id),
  type: text("type").notNull(),
  data: text("data"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byRequest: index("approval_events_request_idx").on(t.requestId) }));
