import { index, pgTable, uuid, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { users, organizations } from "./identity.js";

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

/**
 * F01: time-bound, reasoned support access. A platform administrator may only
 * enter an organization they are not a member of while an unrevoked,
 * unexpired grant exists. Start and end are audited at instance scope.
 */
export const supportAccessGrants = pgTable("support_access_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  platformAdminUserId: uuid("platform_admin_user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: uuid("revoked_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  byAdminOrg: index("support_access_admin_org_idx").on(t.platformAdminUserId, t.organizationId),
  byOrg: index("support_access_org_idx").on(t.organizationId),
}));
