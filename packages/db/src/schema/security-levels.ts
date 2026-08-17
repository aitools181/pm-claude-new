import { pgTable, uuid, text, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects } from "./work.js";

/* ============================================================
 * SEC.D1 — Item Security Level scheme
 *
 * Per-project ordered security levels. A level restricts a work item's
 * visibility beyond ordinary project membership: only users explicitly
 * granted the level (directly, or via an org role) can see items at that
 * level, plus the item's own primary owner and reporter (so nobody can be
 * locked out of their own work). This is enforced at the single shared
 * `canAccessWorkItem` choke point, which ~26 modules already call for
 * reads, search, notifications, AI context and counts — so one enforcement
 * point closes the gap everywhere at once rather than needing to touch
 * every read path individually.
 * ============================================================ */

export const securityLevels = pgTable("security_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  rank: integer("rank").default(0).notNull(), // display order only; access is grant-based, not hierarchical
}, (t) => ({
  byProject: index("security_levels_project_idx").on(t.projectId),
  uniqueName: uniqueIndex("security_levels_project_name_unique").on(t.projectId, t.name),
}));

/** Who can see items at a given level: an individual user, or anyone holding an org role key. */
export const securityLevelGrants = pgTable("security_level_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  securityLevelId: uuid("security_level_id").notNull().references(() => securityLevels.id),
  granteeType: text("grantee_type").notNull(), // user|role
  userId: uuid("user_id").references(() => users.id),
  roleKey: text("role_key"),
}, (t) => ({
  byLevel: index("security_level_grants_level_idx").on(t.securityLevelId),
}));
