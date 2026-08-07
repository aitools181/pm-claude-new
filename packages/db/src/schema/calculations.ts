import { pgTable, uuid, text, timestamp, jsonb, doublePrecision, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { customFieldDefinitions } from "./config.js";
import { workItems } from "./work.js";

export const relationPaths = pgTable("relation_paths", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  key: text("key").notNull(),
  name: text("name").notNull(),
  sourceType: text("source_type").default("work_item").notNull(),
  targetType: text("target_type").default("work_item").notNull(),
  pathKind: text("path_kind").notNull(), // children|parent|dependency|placement|custom_relation
  config: jsonb("config").default({}).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("relation_paths_org_key_unique").on(t.organizationId, t.key) }));

export const calculatedFieldDefinitions = pgTable("calculated_field_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  targetFieldId: uuid("target_field_id").notNull().references(() => customFieldDefinitions.id),
  relationPathId: uuid("relation_path_id").references(() => relationPaths.id),
  kind: text("kind").notNull(), // lookup|mirror|rollup
  sourceFieldKey: text("source_field_key").notNull(),
  operation: text("operation"),
  filter: jsonb("filter").default({}).notNull(),
  config: jsonb("config").default({}).notNull(),
  refreshMode: text("refresh_mode").default("eventual").notNull(),
  active: boolean("active").default(true).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("calculated_fields_org_idx").on(t.organizationId), targetUnique: uniqueIndex("calculated_fields_target_unique").on(t.targetFieldId) }));

export const calculationDependencies = pgTable("calculation_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  calculationId: uuid("calculation_id").notNull().references(() => calculatedFieldDefinitions.id),
  dependsOnCalculationId: uuid("depends_on_calculation_id").references(() => calculatedFieldDefinitions.id),
  dependsOnFieldId: uuid("depends_on_field_id").references(() => customFieldDefinitions.id),
}, (t) => ({ unique: uniqueIndex("calculation_dependencies_unique").on(t.calculationId, t.dependsOnCalculationId, t.dependsOnFieldId) }));

export const rollupProjections = pgTable("rollup_projections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  calculationId: uuid("calculation_id").notNull().references(() => calculatedFieldDefinitions.id),
  valueNumber: doublePrecision("value_number"),
  valueText: text("value_text"),
  valueJson: jsonb("value_json"),
  sourceCount: integer("source_count").default(0).notNull(),
  redactedCount: integer("redacted_count").default(0).notNull(),
  overridden: boolean("overridden").default(false).notNull(),
  error: text("error"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("rollup_projections_unique").on(t.workItemId, t.calculationId), byCalculation: index("rollup_projections_calc_idx").on(t.calculationId) }));

export const recalculationRuns = pgTable("recalculation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  calculationId: uuid("calculation_id").notNull().references(() => calculatedFieldDefinitions.id),
  scopeType: text("scope_type").default("organization").notNull(),
  scopeId: uuid("scope_id"),
  status: text("status").default("running").notNull(),
  processed: integer("processed").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  errorSummary: jsonb("error_summary").default([]).notNull(),
  startedByUserId: uuid("started_by_user_id").notNull().references(() => users.id),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byCalculation: index("recalculation_runs_calc_idx").on(t.calculationId, t.startedAt) }));
