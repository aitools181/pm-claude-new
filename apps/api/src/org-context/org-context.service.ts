import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { seedOrgDefaults } from "../seed/defaults.js";
import { Optional } from "@nestjs/common";
import { PlatformAdminService } from "../platform/platform-admin.service.js";

/** Resolves & validates a user's membership in an organization. */
@Injectable()
export class OrgContextService {
  constructor(@Inject(DB) private readonly db: Database, @Optional() private readonly platform?: PlatformAdminService) {}

  /** Organizations the user actually belongs to (for the switcher),
   *  plus any org reachable through an active support-access grant. */
  async myOrganizations(userId: string) {
    const memberOf = await this.db.select({ id: schema.organizations.id, name: schema.organizations.name, slug: schema.organizations.slug })
      .from(schema.organizationMemberships)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMemberships.organizationId))
      .where(and(
        eq(schema.organizationMemberships.userId, userId),
        eq(schema.organizationMemberships.status, "active"),
        isNull(schema.organizationMemberships.deletedAt),
      ));
    const support = this.platform ? await this.platform.supportAccessOrganizations(userId) : [];
    const known = new Set(memberOf.map((o) => o.id));
    return [...memberOf, ...support.filter((o) => !known.has(o.id)).map((o) => ({ ...o, supportAccess: true }))];
  }

  listMembers(organizationId: string) {
    return this.db.select({ userId: schema.users.id, displayName: schema.users.displayName, email: schema.users.email })
      .from(schema.organizationMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.organizationMemberships.userId))
      .where(and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        eq(schema.organizationMemberships.status, "active"),
        isNull(schema.organizationMemberships.deletedAt),
      ));
  }

  /** Create an additional organization owned by an existing user (multi-org). */
  async createOrganization(userId: string, input: { name: string; slug: string }) {
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!slug) throw new AppError("VALIDATION", "A valid organization slug is required");
    const [clash] = await this.db.select().from(schema.organizations).where(eq(schema.organizations.slug, slug)).limit(1);
    if (clash) throw new AppError("CONFLICT", "That organization slug is already taken");
    return this.db.transaction(async (tx) => {
      const [org] = await tx.insert(schema.organizations).values({ name: input.name, slug, createdBy: userId }).returning();
      await tx.insert(schema.organizationSettings).values({ organizationId: org.id });
      await tx.insert(schema.organizationMemberships).values({ organizationId: org.id, userId, createdBy: userId });
      await seedOrgDefaults(tx as unknown as Database, org.id, userId);
      await tx.insert(schema.userRoleAssignments).values({ organizationId: org.id, userId, roleKey: "organization_admin", scopeType: "organization" });
      const [ws] = await tx.insert(schema.workspaces).values({ organizationId: org.id, name: "General", createdBy: userId }).returning();
      await tx.insert(schema.workspaceMembers).values({ organizationId: org.id, workspaceId: ws.id, userId, createdBy: userId });
      return { id: org.id, name: org.name, slug: org.slug };
    });
  }

  /** Hard gate: user must have an active membership in the requested org.
   *  F01 exception: a platform admin with an ACTIVE support-access grant may
   *  enter without membership (grant start/end is audited). Suspended orgs
   *  stay closed to members but remain reachable through support access. */
  async assertMembership(userId: string, organizationId: string) {
    const [m] = await this.db.select().from(schema.organizationMemberships).where(and(
      eq(schema.organizationMemberships.userId, userId),
      eq(schema.organizationMemberships.organizationId, organizationId),
      eq(schema.organizationMemberships.status, "active"),
      isNull(schema.organizationMemberships.deletedAt),
    )).limit(1);
    if (!m) {
      if (this.platform && await this.platform.hasActiveSupportAccess(userId, organizationId)) {
        return { supportAccess: true } as const;
      }
      throw new AppError("FORBIDDEN", "Not a member of this organization");
    }
    // A suspended/archived organization is closed to all normal access.
    const [org] = await this.db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
    if (org && org.status !== "active") {
      if (this.platform && await this.platform.hasActiveSupportAccess(userId, organizationId)) return { supportAccess: true } as const;
      throw new AppError("FORBIDDEN", `This organization is ${org.status}`, { code: "organization_suspended" });
    }
    return m;
  }
}
