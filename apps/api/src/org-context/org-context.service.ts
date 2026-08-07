import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

/** Resolves & validates a user's membership in an organization. */
@Injectable()
export class OrgContextService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Organizations the user actually belongs to (for the switcher). */
  myOrganizations(userId: string) {
    return this.db.select({ id: schema.organizations.id, name: schema.organizations.name, slug: schema.organizations.slug })
      .from(schema.organizationMemberships)
      .innerJoin(schema.organizations, eq(schema.organizations.id, schema.organizationMemberships.organizationId))
      .where(and(
        eq(schema.organizationMemberships.userId, userId),
        eq(schema.organizationMemberships.status, "active"),
        isNull(schema.organizationMemberships.deletedAt),
      ));
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

  /** Hard gate: user must have an active membership in the requested org. */
  async assertMembership(userId: string, organizationId: string) {
    const [m] = await this.db.select().from(schema.organizationMemberships).where(and(
      eq(schema.organizationMemberships.userId, userId),
      eq(schema.organizationMemberships.organizationId, organizationId),
      eq(schema.organizationMemberships.status, "active"),
      isNull(schema.organizationMemberships.deletedAt),
    )).limit(1);
    if (!m) throw new AppError("FORBIDDEN", "Not a member of this organization");
    return m;
  }
}
