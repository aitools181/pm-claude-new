import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";

/** Resolves which custom fields a user may see. Restricted fields need a matching role. */
@Injectable()
export class FieldSecurityService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async userRoleKeys(organizationId: string, userId: string): Promise<Set<string>> {
    const rows = await this.db.select({ roleKey: schema.userRoleAssignments.roleKey })
      .from(schema.userRoleAssignments)
      .where(and(eq(schema.userRoleAssignments.organizationId, organizationId), eq(schema.userRoleAssignments.userId, userId)));
    return new Set(rows.map((r) => r.roleKey));
  }

  /** Set of field ids the user may see. */
  async visibleFieldIds(organizationId: string, userId: string): Promise<Set<string>> {
    const roles = await this.userRoleKeys(organizationId, userId);
    const isOrgAdmin = roles.has("organization_admin");

    const defs = await this.db.select().from(schema.customFieldDefinitions)
      .where(and(eq(schema.customFieldDefinitions.organizationId, organizationId), isNull(schema.customFieldDefinitions.archivedAt)));
    const restricted = defs.filter((d) => d.visibility === "restricted").map((d) => d.id);

    const allowedByRole = new Set<string>();
    if (restricted.length && !isOrgAdmin) {
      const vis = await this.db.select().from(schema.customFieldVisibility)
        .where(eq(schema.customFieldVisibility.organizationId, organizationId));
      for (const v of vis) if (roles.has(v.roleKey)) allowedByRole.add(v.fieldId);
    }

    const visible = new Set<string>();
    for (const d of defs) {
      if (d.visibility === "all" || isOrgAdmin || allowedByRole.has(d.id)) visible.add(d.id);
    }
    return visible;
  }
}
