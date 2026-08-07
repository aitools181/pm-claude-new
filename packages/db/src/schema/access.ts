import { pgTable, uuid, text, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations, users } from "./identity.js";

/* ============================================================
 * TEAMS + RBAC  (all organization-scoped)
 * ============================================================ */

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  name: text("name").notNull(),
  ...auditColumns,
}, (t) => ({
  orgNameUnique: uniqueIndex("teams_org_name_unique").on(t.organizationId, t.name),
  byOrg: index("teams_org_idx").on(t.organizationId),
}));

export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  teamId: uuid("team_id").notNull().references(() => teams.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  ...auditColumns,
}, (t) => ({
  uniqueMember: uniqueIndex("team_members_unique").on(t.teamId, t.userId),
}));

// Default roles seeded per org (OA, WA, PA, TL, M, G, V). SA is instance-level.
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  key: text("key").notNull(),        // e.g. "organization_admin"
  name: text("name").notNull(),
  isSystem: text("is_system").default("true").notNull(),
  ...auditColumns,
}, (t) => ({
  orgKeyUnique: uniqueIndex("roles_org_key_unique").on(t.organizationId, t.key),
}));

// Capability registry — global catalogue of permission keys.
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),     // e.g. "project.create"
  description: text("description").notNull(),
});

export const rolePermissions = pgTable("role_permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  roleId: uuid("role_id").notNull().references(() => roles.id),
  permissionKey: text("permission_key").notNull().references(() => permissions.key),
}, (t) => ({
  uniquePair: uniqueIndex("role_permissions_unique").on(t.roleId, t.permissionKey),
}));
