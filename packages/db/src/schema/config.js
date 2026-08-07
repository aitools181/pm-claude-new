import { pgTable, uuid, text, timestamp, boolean, doublePrecision, date, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations, users } from "./identity.js";
import { workItems, workItemTypes } from "./work.js";
/* ============================================================
 * CUSTOM FIELDS  (typed, scoped, with field-level security)
 * ============================================================ */
export const customFieldDefinitions = pgTable("custom_field_definitions", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    fieldType: text("field_type").notNull(), // text|number|date|checkbox|select|user|url
    scopeType: text("scope_type").default("organization").notNull(), // organization|project|type
    scopeId: uuid("scope_id"),
    required: boolean("required").default(false).notNull(),
    visibility: text("visibility").default("all").notNull(), // all|restricted
    config: jsonb("config"), // { min,max,maxLength,pattern }
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...auditColumns,
}, (t) => ({ orgKeyUnique: uniqueIndex("custom_field_key_unique").on(t.organizationId, t.key) }));
export const customFieldOptions = pgTable("custom_field_options", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    fieldId: uuid("field_id").notNull().references(() => customFieldDefinitions.id),
    value: text("value").notNull(),
    label: text("label").notNull(),
    rank: text("rank").notNull(),
}, (t) => ({ fieldValueUnique: uniqueIndex("custom_field_option_unique").on(t.fieldId, t.value) }));
// Typed value storage — one row per (work item, field); only the matching column is set.
export const customFieldValues = pgTable("custom_field_values", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
    fieldId: uuid("field_id").notNull().references(() => customFieldDefinitions.id),
    valueText: text("value_text"),
    valueNumber: doublePrecision("value_number"),
    valueDate: date("value_date"),
    valueBool: boolean("value_bool"),
    valueUserId: uuid("value_user_id").references(() => users.id),
    valueOptionId: uuid("value_option_id").references(() => customFieldOptions.id),
    ...auditColumns,
}, (t) => ({ itemFieldUnique: uniqueIndex("custom_field_value_unique").on(t.workItemId, t.fieldId), byField: index("custom_field_value_field_idx").on(t.fieldId) }));
// Which roles may see a restricted field (field-level security).
export const customFieldVisibility = pgTable("custom_field_visibility", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    fieldId: uuid("field_id").notNull().references(() => customFieldDefinitions.id),
    roleKey: text("role_key").notNull(),
}, (t) => ({ unique: uniqueIndex("custom_field_visibility_unique").on(t.fieldId, t.roleKey) }));
// Attach fields to a custom type, optionally required for that type.
export const typeFields = pgTable("type_fields", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    typeId: uuid("type_id").notNull().references(() => workItemTypes.id),
    fieldId: uuid("field_id").notNull().references(() => customFieldDefinitions.id),
    required: boolean("required").default(false).notNull(),
}, (t) => ({ unique: uniqueIndex("type_fields_unique").on(t.typeId, t.fieldId) }));
// Scoped role assignments (foundation for the custom role builder; used now for field security).
export const userRoleAssignments = pgTable("user_role_assignments", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    roleKey: text("role_key").notNull(),
    scopeType: text("scope_type").default("organization").notNull(), // organization|project
    scopeId: uuid("scope_id"),
}, (t) => ({ byUser: index("user_role_assignments_user_idx").on(t.organizationId, t.userId) }));
//# sourceMappingURL=config.js.map