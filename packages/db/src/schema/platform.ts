import { pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./identity.js";

/* ============================================================
 * PLATFORM ADMINISTRATION — instance-level (not org-scoped).
 * Deliberately a separate table: instance authority must never be
 * grantable through organization roles or IdP group mapping.
 * ============================================================ */
export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  grantedByUserId: uuid("granted_by_user_id").references(() => users.id), // null = bootstrap
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  userUnique: uniqueIndex("platform_admins_user_unique").on(t.userId),
}));
