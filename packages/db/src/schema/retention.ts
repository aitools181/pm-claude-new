import { pgTable, uuid, text, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations } from "./identity.js";

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
