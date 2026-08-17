import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex, jsonb, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";

/* ============================================================
 * DATA RETENTION — Phase 12 (retention policy for recycle-bin purge)
 * ============================================================ */
export const retentionPolicies = pgTable("retention_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  entity: text("entity").default("work_item").notNull(),   // work_item (extendable)
  retentionDays: integer("retention_days").default(30).notNull(),
  autoPurge: boolean("auto_purge").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniq: uniqueIndex("retention_policies_unique").on(t.organizationId, t.entity) }));

/**
 * X01.4 — Undo/Redo. A session-scoped compensating-transaction stack: every
 * reversible mutation (soft delete, bulk edit, status/move/assign, archive,
 * template apply) records enough pre-image to construct its inverse.
 * `undoneAt` marks it consumed; a redo is only valid immediately after an
 * undo, before any newer action — enforced in the service, not here.
 */
export const reversibleActions = pgTable("reversible_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  actionType: text("action_type").notNull(), // soft_delete|bulk_edit|status_change|move|assign|archive|template_apply
  targetType: text("target_type").notNull(), // work_item|project
  targetIds: jsonb("target_ids").notNull(),  // string[]
  preImage: jsonb("pre_image").notNull(),    // enough state to compensate
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
  redoneAt: timestamp("redone_at", { withTimezone: true }),
}, (t) => ({
  byUser: index("reversible_actions_user_idx").on(t.organizationId, t.userId, t.createdAt),
}));
