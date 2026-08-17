import { and, eq, isNull, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";

/** True iff the user is an active org member AND can see the work item's owning project. */
export async function canAccessWorkItem(db: Database, organizationId: string, workItemId: string, userId: string): Promise<boolean> {
  const [wi] = await db.select({ owningProjectId: schema.workItems.owningProjectId, securityLevelId: schema.workItems.securityLevelId, primaryOwnerUserId: schema.workItems.primaryOwnerUserId, reporterUserId: schema.workItems.reporterUserId })
    .from(schema.workItems)
    .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId))).limit(1);
  if (!wi) return false;

  const [member] = await db.select().from(schema.organizationMemberships).where(and(
    eq(schema.organizationMemberships.organizationId, organizationId),
    eq(schema.organizationMemberships.userId, userId),
    eq(schema.organizationMemberships.status, "active"),
    isNull(schema.organizationMemberships.deletedAt),
  )).limit(1);
  if (!member) return false;

  const [proj] = await db.select({ privacy: schema.projects.privacy })
    .from(schema.projects).where(and(
      eq(schema.projects.id, wi.owningProjectId),
      eq(schema.projects.organizationId, organizationId),
      isNull(schema.projects.deletedAt),
    )).limit(1);
  if (!proj) return false;

  let hasProjectAccess = proj.privacy === "workspace";
  if (!hasProjectAccess) {
    const [pm] = await db.select().from(schema.projectMembers).where(and(
      eq(schema.projectMembers.organizationId, organizationId),
      eq(schema.projectMembers.projectId, wi.owningProjectId),
      eq(schema.projectMembers.userId, userId),
      isNull(schema.projectMembers.deletedAt),
    )).limit(1);
    hasProjectAccess = !!pm;
  }
  if (!hasProjectAccess) return false;

  // SEC.D1 — an item's security level, if set, restricts visibility further
  // than plain project access: only the item's own owner/reporter (so nobody
  // is ever locked out of their own work) or someone explicitly granted that
  // level (by user, or by holding a granted org role) can see it.
  if (wi.securityLevelId) {
    if (wi.primaryOwnerUserId === userId || wi.reporterUserId === userId) return true;
    const [userGrant] = await db.select({ id: schema.securityLevelGrants.id }).from(schema.securityLevelGrants)
      .where(and(eq(schema.securityLevelGrants.securityLevelId, wi.securityLevelId), eq(schema.securityLevelGrants.granteeType, "user"), eq(schema.securityLevelGrants.userId, userId))).limit(1);
    if (userGrant) return true;
    const roleGrants = await db.select({ roleKey: schema.securityLevelGrants.roleKey }).from(schema.securityLevelGrants)
      .where(and(eq(schema.securityLevelGrants.securityLevelId, wi.securityLevelId), eq(schema.securityLevelGrants.granteeType, "role")));
    if (roleGrants.length) {
      const roleKeys = roleGrants.map((g) => g.roleKey).filter((k): k is string => Boolean(k));
      if (roleKeys.length) {
        const [myRole] = await db.select({ id: schema.userRoleAssignments.id }).from(schema.userRoleAssignments)
          .where(and(eq(schema.userRoleAssignments.organizationId, organizationId), eq(schema.userRoleAssignments.userId, userId), or(...roleKeys.map((k) => eq(schema.userRoleAssignments.roleKey, k))))).limit(1);
        if (myRole) return true;
      }
    }
    return false; // has a level, but this user isn't granted it and isn't owner/reporter
  }

  return true;
}

/** True iff the user is an active org member AND can see the project. */
export async function canAccessProject(db: Database, organizationId: string, projectId: string, userId: string): Promise<boolean> {
  const { and, eq, isNull } = await import("drizzle-orm");
  const { schema } = await import("@pm/db");
  const [member] = await db.select().from(schema.organizationMemberships).where(and(
    eq(schema.organizationMemberships.organizationId, organizationId),
    eq(schema.organizationMemberships.userId, userId),
    eq(schema.organizationMemberships.status, "active"),
    isNull(schema.organizationMemberships.deletedAt),
  )).limit(1);
  if (!member) return false;
  const [proj] = await db.select({ privacy: schema.projects.privacy }).from(schema.projects)
    .where(and(
      eq(schema.projects.id, projectId),
      eq(schema.projects.organizationId, organizationId),
      isNull(schema.projects.deletedAt),
    )).limit(1);
  if (!proj) return false;
  if (proj.privacy === "workspace") return true;
  const [pm] = await db.select().from(schema.projectMembers).where(and(
    eq(schema.projectMembers.organizationId, organizationId),
    eq(schema.projectMembers.projectId, projectId),
    eq(schema.projectMembers.userId, userId),
    isNull(schema.projectMembers.deletedAt),
  )).limit(1);
  return !!pm;
}
