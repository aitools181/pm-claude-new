import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { CAPABILITIES } from "./capabilities.js";

const ALL_CAPS = new Set<string>(Object.values(CAPABILITIES));

/**
 * The ONE place capabilities are computed. Both AuthzGuard and the permission
 * preview call this, so a preview can never disagree with an actual request.
 */
@Injectable()
export class PermissionResolver {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Roles assigned to the user at org scope, plus project scope when projectId matches. */
  private async assignedRoleKeys(organizationId: string, userId: string, projectId?: string): Promise<Set<string>> {
    const rows = await this.db.select({ roleKey: schema.userRoleAssignments.roleKey, scopeType: schema.userRoleAssignments.scopeType, scopeId: schema.userRoleAssignments.scopeId })
      .from(schema.userRoleAssignments)
      .where(and(eq(schema.userRoleAssignments.organizationId, organizationId), eq(schema.userRoleAssignments.userId, userId)));
    const keys = new Set<string>();
    for (const r of rows) {
      if (r.scopeType === "organization") keys.add(r.roleKey);
      else if (r.scopeType === "project" && projectId && r.scopeId === projectId) keys.add(r.roleKey);
    }
    return keys;
  }

  async resolveCapabilities(organizationId: string, userId: string, projectId?: string): Promise<Set<string>> {
    const roleKeys = await this.assignedRoleKeys(organizationId, userId, projectId);
    if (roleKeys.has("organization_admin")) return new Set(ALL_CAPS); // org admin holds everything
    if (roleKeys.size === 0) return new Set();

    const roles = await this.db.select({ id: schema.roles.id }).from(schema.roles)
      .where(and(eq(schema.roles.organizationId, organizationId), inArray(schema.roles.key, [...roleKeys])));
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length === 0) return new Set();

    const perms = await this.db.select({ key: schema.rolePermissions.permissionKey }).from(schema.rolePermissions)
      .where(and(eq(schema.rolePermissions.organizationId, organizationId), inArray(schema.rolePermissions.roleId, roleIds)));
    return new Set(perms.map((p) => p.key));
  }

  async can(organizationId: string, userId: string, capability: string, projectId?: string): Promise<boolean> {
    return (await this.resolveCapabilities(organizationId, userId, projectId)).has(capability);
  }
}
