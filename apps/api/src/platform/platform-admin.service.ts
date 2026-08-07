import { Injectable, Inject } from "@nestjs/common";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { OPTIONAL_MODULES, type OptionalModule } from "../modules/modules.service.js";

const ORG_STATUSES = ["active", "suspended", "archived"] as const;

/**
 * Instance-level administration.
 *
 * Deliberate boundary: a platform administrator manages the INSTANCE
 * (organizations, modules, platform flags, other admins) — it does not grant
 * read access to any organization's work item content. Everything exposed here
 * is metadata or aggregate counts, and every mutation is audited at instance scope.
 */
@Injectable()
export class PlatformAdminService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async isPlatformAdmin(userId: string): Promise<boolean> {
    const [row] = await this.db.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.userId, userId)).limit(1);
    return Boolean(row);
  }
  async assertPlatformAdmin(userId: string) {
    if (!(await this.isPlatformAdmin(userId))) throw new AppError("FORBIDDEN", "Platform administrator access required", { code: "not_platform_admin" });
  }

  private audit(actorUserId: string | null, action: string, targetType?: string, targetId?: string, metadata?: unknown) {
    return this.db.insert(schema.auditEvents).values({ scopeType: "instance", organizationId: null, actorUserId, action, targetType, targetId, metadata: metadata ?? null });
  }

  // ---- admin roster ----
  listAdmins() {
    return this.db.select({ id: schema.platformAdmins.id, userId: schema.users.id, email: schema.users.email, displayName: schema.users.displayName, createdAt: schema.platformAdmins.createdAt, note: schema.platformAdmins.note })
      .from(schema.platformAdmins).innerJoin(schema.users, eq(schema.users.id, schema.platformAdmins.userId))
      .orderBy(schema.platformAdmins.createdAt);
  }

  /** Bootstrap the very first administrator (used by first-run setup). */
  async bootstrap(userId: string) {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.platformAdmins);
    if (count > 0) return { bootstrapped: false };
    await this.db.insert(schema.platformAdmins).values({ userId, note: "instance owner (first-run setup)" }).onConflictDoNothing();
    await this.audit(userId, "platform.admin_bootstrapped", "user", userId);
    return { bootstrapped: true };
  }

  async grantAdmin(actorUserId: string, email: string, note?: string) {
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase())).limit(1);
    if (!user) throw new AppError("NOT_FOUND", "No user with that email address");
    const [existing] = await this.db.select().from(schema.platformAdmins).where(eq(schema.platformAdmins.userId, user.id)).limit(1);
    if (existing) throw new AppError("CONFLICT", "That user is already a platform administrator");
    const [row] = await this.db.insert(schema.platformAdmins).values({ userId: user.id, grantedByUserId: actorUserId, note }).returning();
    await this.audit(actorUserId, "platform.admin_granted", "user", user.id, { email: user.email });
    return row;
  }

  /** Revoking the final administrator would lock the instance out permanently. */
  async revokeAdmin(actorUserId: string, userId: string) {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.platformAdmins);
    if (count <= 1) throw new AppError("CONFLICT", "Cannot revoke the last platform administrator", { code: "last_admin" });
    const deleted = await this.db.delete(schema.platformAdmins).where(eq(schema.platformAdmins.userId, userId)).returning();
    if (!deleted.length) throw new AppError("NOT_FOUND", "That user is not a platform administrator");
    await this.audit(actorUserId, "platform.admin_revoked", "user", userId);
    return { revoked: true };
  }

  // ---- organizations (metadata + counts only; never work item content) ----
  async listOrganizations() {
    const orgs = await this.db.select({ id: schema.organizations.id, name: schema.organizations.name, slug: schema.organizations.slug, status: schema.organizations.status, createdAt: schema.organizations.createdAt })
      .from(schema.organizations).orderBy(schema.organizations.createdAt);
    const out = [];
    for (const o of orgs) {
      const [{ members }] = await this.db.select({ members: sql<number>`count(*)::int` }).from(schema.organizationMemberships)
        .where(and(eq(schema.organizationMemberships.organizationId, o.id), eq(schema.organizationMemberships.status, "active"), isNull(schema.organizationMemberships.deletedAt)));
      const [{ projects }] = await this.db.select({ projects: sql<number>`count(*)::int` }).from(schema.projects)
        .where(and(eq(schema.projects.organizationId, o.id), isNull(schema.projects.deletedAt)));
      const [{ items }] = await this.db.select({ items: sql<number>`count(*)::int` }).from(schema.workItems)
        .where(and(eq(schema.workItems.organizationId, o.id), isNull(schema.workItems.deletedAt)));
      out.push({ ...o, members, projects, workItems: items });
    }
    return out;
  }

  async setOrganizationStatus(actorUserId: string, organizationId: string, status: string) {
    if (!ORG_STATUSES.includes(status as (typeof ORG_STATUSES)[number])) throw new AppError("VALIDATION", "Unknown organization status");
    const [org] = await this.db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
    if (!org) throw new AppError("NOT_FOUND", "Organization not found");
    const [row] = await this.db.update(schema.organizations).set({ status, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(schema.organizations.id, organizationId)).returning();
    await this.audit(actorUserId, "platform.organization_status_changed", "organization", organizationId, { from: org.status, to: status });
    return { id: row.id, name: row.name, status: row.status };
  }

  // ---- module / feature flags ----
  private moduleKey(m: string) { return `module:${m}`; }

  /** Modules enabled per organization (drives what each tenant can use). */
  async organizationModules(organizationId: string) {
    const rows = await this.db.select().from(schema.featureFlags).where(eq(schema.featureFlags.organizationId, organizationId));
    const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
    return Object.fromEntries(OPTIONAL_MODULES.map((m) => [m, byKey.get(this.moduleKey(m)) ?? false]));
  }

  async setOrganizationModule(actorUserId: string, organizationId: string, module: string, enabled: boolean) {
    if (!OPTIONAL_MODULES.includes(module as OptionalModule)) throw new AppError("VALIDATION", "Unknown module");
    const key = this.moduleKey(module);
    const [existing] = await this.db.select().from(schema.featureFlags).where(and(eq(schema.featureFlags.organizationId, organizationId), eq(schema.featureFlags.key, key))).limit(1);
    if (existing) await this.db.update(schema.featureFlags).set({ enabled, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(schema.featureFlags.id, existing.id));
    else await this.db.insert(schema.featureFlags).values({ organizationId, key, enabled, createdBy: actorUserId, updatedBy: actorUserId });
    await this.audit(actorUserId, "platform.module_toggled", "organization", organizationId, { module, enabled });
    return { organizationId, module, enabled };
  }

  /** Platform-wide flags live on the null-organization scope. */
  listPlatformFlags() {
    return this.db.select().from(schema.featureFlags).where(isNull(schema.featureFlags.organizationId)).orderBy(schema.featureFlags.key);
  }
  async setPlatformFlag(actorUserId: string, key: string, enabled: boolean) {
    const [existing] = await this.db.select().from(schema.featureFlags).where(and(isNull(schema.featureFlags.organizationId), eq(schema.featureFlags.key, key))).limit(1);
    if (existing) await this.db.update(schema.featureFlags).set({ enabled, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(schema.featureFlags.id, existing.id));
    else await this.db.insert(schema.featureFlags).values({ organizationId: null, key, enabled, createdBy: actorUserId, updatedBy: actorUserId });
    await this.audit(actorUserId, "platform.flag_set", "flag", key, { enabled });
    return { key, enabled };
  }

  // ---- instance overview + audit ----
  async stats() {
    const [{ orgs }] = await this.db.select({ orgs: sql<number>`count(*)::int` }).from(schema.organizations);
    const [{ activeOrgs }] = await this.db.select({ activeOrgs: sql<number>`count(*)::int` }).from(schema.organizations).where(eq(schema.organizations.status, "active"));
    const [{ users }] = await this.db.select({ users: sql<number>`count(*)::int` }).from(schema.users);
    const [{ projects }] = await this.db.select({ projects: sql<number>`count(*)::int` }).from(schema.projects).where(isNull(schema.projects.deletedAt));
    const [{ items }] = await this.db.select({ items: sql<number>`count(*)::int` }).from(schema.workItems).where(isNull(schema.workItems.deletedAt));
    const [{ admins }] = await this.db.select({ admins: sql<number>`count(*)::int` }).from(schema.platformAdmins);
    return { organizations: orgs, activeOrganizations: activeOrgs, users, projects, workItems: items, platformAdmins: admins };
  }

  auditLog(limit = 100) {
    return this.db.select({ id: schema.auditEvents.id, action: schema.auditEvents.action, actorUserId: schema.auditEvents.actorUserId, targetType: schema.auditEvents.targetType, targetId: schema.auditEvents.targetId, metadata: schema.auditEvents.metadata, createdAt: schema.auditEvents.createdAt })
      .from(schema.auditEvents).where(eq(schema.auditEvents.scopeType, "instance")).orderBy(desc(schema.auditEvents.createdAt)).limit(Math.min(limit, 200));
  }
}
