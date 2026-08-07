import { schema, type Database } from "@pm/db";
import { CAPABILITIES } from "../authz/capabilities.js";

/** Default roles per the Permission Matrix (SA is instance-level, not org-seeded). */
export const DEFAULT_ROLES = [
  { key: "organization_admin", name: "Organization Administrator" },
  { key: "workspace_admin", name: "Workspace Administrator" },
  { key: "project_admin", name: "Project Administrator" },
  { key: "team_leader", name: "Team Leader" },
  { key: "member", name: "Member" },
  { key: "guest", name: "Guest" },
  { key: "viewer", name: "Viewer" },
] as const;

const ALL_CAPS = Object.values(CAPABILITIES).map((key) => ({
  key, description: key,
}));

/** Seeds capability registry (global) + default roles for one organization. */
export async function seedOrgDefaults(db: Database, organizationId: string, creatorUserId: string) {
  await db.insert(schema.permissions).values(ALL_CAPS).onConflictDoNothing();

  const roleRows = await db.insert(schema.roles).values(
    DEFAULT_ROLES.map((r) => ({
      organizationId, key: r.key, name: r.name, isSystem: "true", createdBy: creatorUserId,
    })),
  ).returning();

  const oa = roleRows.find((r) => r.key === "organization_admin");
  if (oa) {
    await db.insert(schema.rolePermissions).values(
      ALL_CAPS.map((c) => ({ organizationId, roleId: oa.id, permissionKey: c.key })),
    ).onConflictDoNothing();
  }

  await db.insert(schema.workItemTypes).values([
    { organizationId, key: "task", name: "Task", icon: "check-square", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "subtask", name: "Subtask", icon: "corner-down-right", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "bug", name: "Bug", icon: "bug", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "story", name: "Story", icon: "book-open", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "epic", name: "Epic", icon: "layers", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "initiative", name: "Initiative", icon: "flag", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "request", name: "Request", icon: "inbox", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "milestone", name: "Milestone", icon: "diamond", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "risk", name: "Risk", icon: "alert-triangle", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "incident", name: "Incident", icon: "siren", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "approval", name: "Approval", icon: "badge-check", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "idea", name: "Idea", icon: "lightbulb", isSystem: true, createdBy: creatorUserId },
    { organizationId, key: "experiment", name: "Experiment", icon: "flask", isSystem: true, createdBy: creatorUserId },
  ]).onConflictDoNothing();

  return roleRows;
}
