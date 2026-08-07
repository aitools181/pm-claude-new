import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations } from "./identity.js";
import { workItems } from "./work.js";
/* ============================================================
 * WORKFLOW  (versioned; published versions are immutable)
 * ============================================================ */
export const workflows = pgTable("workflows", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    scopeType: text("scope_type").default("organization").notNull(), // organization|project|type
    scopeId: uuid("scope_id"),
    publishedVersionId: uuid("published_version_id"),
    ...auditColumns,
}, (t) => ({ byOrg: index("workflows_org_idx").on(t.organizationId) }));
export const workflowVersions = pgTable("workflow_versions", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
    versionNo: integer("version_no").notNull(),
    status: text("status").default("draft").notNull(), // draft|published|archived
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedBy: uuid("published_by"),
    ...auditColumns,
}, (t) => ({ wfVersionUnique: uniqueIndex("workflow_version_unique").on(t.workflowId, t.versionNo) }));
export const workflowStatuses = pgTable("workflow_statuses", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    versionId: uuid("version_id").notNull().references(() => workflowVersions.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    category: text("category").default("todo").notNull(), // todo|in_progress|done
    isInitial: boolean("is_initial").default(false).notNull(),
    rank: integer("rank").default(0).notNull(),
}, (t) => ({ versionKeyUnique: uniqueIndex("workflow_status_unique").on(t.versionId, t.key) }));
export const workflowTransitions = pgTable("workflow_transitions", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    versionId: uuid("version_id").notNull().references(() => workflowVersions.id),
    name: text("name").notNull(),
    fromStatusId: uuid("from_status_id"), // null = from any status
    toStatusId: uuid("to_status_id").notNull().references(() => workflowStatuses.id),
}, (t) => ({ byVersion: index("workflow_transition_version_idx").on(t.versionId) }));
// Conditions gate whether a transition is OFFERED; validators gate whether it SUCCEEDS.
export const transitionRules = pgTable("transition_rules", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    transitionId: uuid("transition_id").notNull().references(() => workflowTransitions.id),
    ruleType: text("rule_type").notNull(), // condition|validator|post_action
    kind: text("kind").notNull(), // role|assignee_set|field_required|comment_required|assign_actor|set_progress
    config: jsonb("config"),
}, (t) => ({ byTransition: index("transition_rules_transition_idx").on(t.transitionId) }));
// Binds a work item to a workflow version + current status.
export const workItemWorkflowState = pgTable("work_item_workflow_state", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
    versionId: uuid("version_id").notNull().references(() => workflowVersions.id),
    currentStatusId: uuid("current_status_id").notNull().references(() => workflowStatuses.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ itemUnique: uniqueIndex("work_item_workflow_state_unique").on(t.workItemId) }));
//# sourceMappingURL=workflow.js.map