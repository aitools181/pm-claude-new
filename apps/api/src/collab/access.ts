import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";

/** True iff the user is an active org member AND can see the work item's owning project. */
export async function canAccessWorkItem(db: Database, organizationId: string, workItemId: string, userId: string): Promise<boolean> {
  const [wi] = await db.select({ owningProjectId: schema.workItems.owningProjectId })
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
  if (proj.privacy === "workspace") return true;

  const [pm] = await db.select().from(schema.projectMembers).where(and(
    eq(schema.projectMembers.organizationId, organizationId),
    eq(schema.projectMembers.projectId, wi.owningProjectId),
    eq(schema.projectMembers.userId, userId),
    isNull(schema.projectMembers.deletedAt),
  )).limit(1);
  return !!pm;
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
