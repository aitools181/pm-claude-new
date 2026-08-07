import { pgTable, uuid, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { organizations } from "./identity.js";
/* ============================================================
 * IMPORT / EXPORT
 * ============================================================ */
export const mappingProfiles = pgTable("mapping_profiles", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    entityType: text("entity_type").notNull(),
    mapping: jsonb("mapping").notNull(), // { targetField: sourceColumn }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const importJobs = pgTable("import_jobs", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    entityType: text("entity_type").notNull(),
    status: text("status").default("dry_run").notNull(), // dry_run|completed|failed
    total: integer("total").default(0).notNull(),
    inserted: integer("inserted").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    errorReport: jsonb("error_report"), // [{ row, message }]
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
export const exportJobs = pgTable("export_jobs", {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    scopeType: text("scope_type").notNull(), // project|workspace|organization
    scopeId: uuid("scope_id"),
    status: text("status").default("completed").notNull(),
    manifest: jsonb("manifest"), // { files: [{ name, count, sha256, bytes }] }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("export_jobs_org_idx").on(t.organizationId) }));
//# sourceMappingURL=portability.js.map