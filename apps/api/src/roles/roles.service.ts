import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { Optional } from "@nestjs/common";
import { SessionService } from "../auth/session.service.js";
import { PermissionResolver } from "../authz/permission-resolver.js";
import { AuditService } from "../audit/audit.service.js";

@Injectable()
export class RolesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly resolver: PermissionResolver,
    private readonly audit: AuditService,
    @Optional() private readonly sessionSvc?: SessionService,
  ) {}

  list(organizationId: string) {
    return this.db.select().from(schema.roles).where(eq(schema.roles.organizationId, organizationId));
  }

  async create(organizationId: string, userId: string, input: { key: string; name: string; permissions: string[] }) {
    return this.db.transaction(async (tx) => {
      const [role] = await tx.insert(schema.roles).values({ organizationId, key: input.key, name: input.name, isSystem: "false", createdBy: userId }).returning();
      if (input.permissions.length) await tx.insert(schema.rolePermissions).values(input.permissions.map((p) => ({ organizationId, roleId: role.id, permissionKey: p }))).onConflictDoNothing();
      await this.audit.append({ scopeType: "organization", organizationId, actorUserId: userId, action: "role.created", targetType: "role", targetId: role.id, metadata: { permissions: input.permissions } });
      return role;
    });
  }

  async setPermissions(organizationId: string, userId: string, roleId: string, permissions: string[]) {
    const [role] = await this.db.select().from(schema.roles).where(and(eq(schema.roles.id, roleId), eq(schema.roles.organizationId, organizationId))).limit(1);
    if (!role) throw new AppError("NOT_FOUND", "Role not found");
    if (role.isSystem === "true") throw new AppError("VALIDATION", "System roles cannot be edited");
    await this.db.delete(schema.rolePermissions).where(and(eq(schema.rolePermissions.roleId, roleId), eq(schema.rolePermissions.organizationId, organizationId)));
    if (permissions.length) await this.db.insert(schema.rolePermissions).values(permissions.map((p) => ({ organizationId, roleId, permissionKey: p })));
    await this.audit.append({ scopeType: "organization", organizationId, actorUserId: userId, action: "role.permissions_changed", targetType: "role", targetId: roleId, metadata: { permissions } });
  }

  async assign(organizationId: string, userId: string, input: { targetUserId: string; roleKey: string; scopeType?: "organization" | "project"; scopeId?: string }) {
    await this.db.insert(schema.userRoleAssignments).values({
      organizationId, userId: input.targetUserId, roleKey: input.roleKey,
      scopeType: input.scopeType ?? "organization", scopeId: input.scopeId,
    });
    await this.audit.append({ scopeType: "organization", organizationId, actorUserId: userId, action: "role.assigned", targetType: "user", targetId: input.targetUserId, metadata: { roleKey: input.roleKey, scope: input.scopeType ?? "organization" } });
    // F02 sensitive-session invalidation: permission changes take effect only
    // after re-authentication, so stale sessions cannot keep old capabilities.
    if (this.sessionSvc && input.targetUserId !== userId) await this.sessionSvc.revokeAll(input.targetUserId).catch(() => {});
  }

  async unassign(organizationId: string, assignmentId: string, userId: string) {
    const [target] = await this.db.select({ userId: schema.userRoleAssignments.userId }).from(schema.userRoleAssignments)
      .where(and(eq(schema.userRoleAssignments.id, assignmentId), eq(schema.userRoleAssignments.organizationId, organizationId))).limit(1);
    await this.db.delete(schema.userRoleAssignments).where(and(eq(schema.userRoleAssignments.id, assignmentId), eq(schema.userRoleAssignments.organizationId, organizationId)));
    await this.audit.append({ scopeType: "organization", organizationId, actorUserId: userId, action: "role.unassigned", targetType: "assignment", targetId: assignmentId });
    if (this.sessionSvc && target?.userId && target.userId !== userId) await this.sessionSvc.revokeAll(target.userId).catch(() => {});
  }

  /** Permission preview — uses the SAME resolver the guard uses. */
  async preview(organizationId: string, targetUserId: string, projectId?: string) {
    const caps = await this.resolver.resolveCapabilities(organizationId, targetUserId, projectId);
    return { userId: targetUserId, projectId: projectId ?? null, capabilities: [...caps].sort() };
  }
}
