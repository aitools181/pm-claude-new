import { pgTable, uuid, text, timestamp, integer, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations } from "./identity.js";
/* ============================================================
 * TEMPLATES  (versioned; instances never silently mutate)
 * ============================================================ */
export const templates = pgTable("templates", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    kind: text("kind").notNull(), // project|task|workflow|form|document|dashboard
    name: text("name").notNull(),
    publishedVersionId: uuid("published_version_id"),
    ...auditColumns,
}, (t) => ({ byOrg: index("templates_org_idx").on(t.organizationId) }));
export const templateVersions = pgTable("template_versions", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    templateId: uuid("template_id").notNull().references(() => templates.id),
    versionNo: integer("version_no").notNull(),
    status: text("status").default("draft").notNull(), // draft|published
    content: jsonb("content").notNull(), // snapshot definition
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...auditColumns,
}, (t) => ({ versionUnique: uniqueIndex("template_version_unique").on(t.templateId, t.versionNo) }));
// Provenance of an instantiated entity (proves instances are independent copies).
export const templateInstances = pgTable("template_instances", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    templateId: uuid("template_id").notNull().references(() => templates.id),
    versionId: uuid("version_id").notNull().references(() => templateVersions.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
/* ============================================================
 * RECURRENCE  (unique, timezone-correct occurrences)
 * ============================================================ */
export const recurringRules = pgTable("recurring_rules", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    spec: jsonb("spec").notNull(), // { projectId, title, priority }
    frequency: text("frequency").notNull(), // daily|weekly|monthly
    interval: integer("interval").default(1).notNull(),
    timezone: text("timezone").default("UTC").notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    active: boolean("active").default(true).notNull(),
    ...auditColumns,
}, (t) => ({ byNext: index("recurring_rules_next_idx").on(t.active, t.nextRunAt) }));
export const recurrenceOccurrences = pgTable("recurrence_occurrences", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    ruleId: uuid("rule_id").notNull().references(() => recurringRules.id),
    occurrenceKey: text("occurrence_key").notNull(), // tz-local date, per rule
    workItemId: uuid("work_item_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ occUnique: uniqueIndex("recurrence_occurrence_unique").on(t.ruleId, t.occurrenceKey) }));
//# sourceMappingURL=templates.js.map