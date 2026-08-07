import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { PlansService } from "../plans/plans.service.js";
import { canAccessProject } from "../collab/access.js";

@Injectable()
export class ProjectsService {
  constructor(@Inject(DB) private readonly db: Database, @Optional() private readonly plans?: PlansService) {}

  async create(organizationId: string, userId: string, input: { workspaceId: string; name: string; keyPrefix: string; privacy?: "workspace" | "private" }) {
    if (this.plans) await this.plans.assertWithinLimit(organizationId, "projects");
    const prefix = input.keyPrefix.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (!prefix) throw new AppError("VALIDATION", "Key prefix must contain letters or digits");
    return this.db.transaction(async (tx) => {
      const [proj] = await tx.insert(schema.projects).values({
        organizationId, workspaceId: input.workspaceId, name: input.name,
        keyPrefix: prefix, ownerUserId: userId, privacy: input.privacy ?? "workspace", createdBy: userId,
      }).returning();
      await tx.insert(schema.projectMembers).values({ organizationId, projectId: proj.id, userId, createdBy: userId });
      return proj;
    });
  }

  async get(organizationId: string, id: string) {
    const [proj] = await this.db.select().from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId), isNull(schema.projects.deletedAt))).limit(1);
    if (!proj) throw new AppError("NOT_FOUND", "Project not found");
    return proj;
  }

  /** List only projects visible to the current active organization member. */
  async list(organizationId: string, userId: string, workspaceId?: string) {
    const [member] = await this.db.select({ id: schema.organizationMemberships.id }).from(schema.organizationMemberships)
      .where(and(
        eq(schema.organizationMemberships.organizationId, organizationId),
        eq(schema.organizationMemberships.userId, userId),
        eq(schema.organizationMemberships.status, "active"),
        isNull(schema.organizationMemberships.deletedAt),
      )).limit(1);
    if (!member) return [];

    const conds = [eq(schema.projects.organizationId, organizationId), isNull(schema.projects.deletedAt)];
    if (workspaceId) conds.push(eq(schema.projects.workspaceId, workspaceId));
    const [rows, memberships] = await Promise.all([
      this.db.select().from(schema.projects).where(and(...conds)),
      this.db.select({ projectId: schema.projectMembers.projectId }).from(schema.projectMembers)
        .where(and(
          eq(schema.projectMembers.organizationId, organizationId),
          eq(schema.projectMembers.userId, userId),
          isNull(schema.projectMembers.deletedAt),
        )),
    ]);
    const memberProjects = new Set(memberships.map((row) => row.projectId));
    return rows.filter((project) => project.privacy !== "private" || memberProjects.has(project.id));
  }

  /** Optimistic update on status/health/dates. */
  async update(organizationId: string, id: string, userId: string, patch: Partial<{ status: string; health: string; startDate: string | null; dueDate: string | null; name: string; description: string | null; color: string; privacy: string }>, expectedVersion: number) {
    const [row] = await this.db.update(schema.projects)
      .set({ ...patch, updatedBy: userId, updatedAt: new Date(), version: sql`${schema.projects.version} + 1` })
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId), eq(schema.projects.version, expectedVersion)))
      .returning();
    if (!row) throw new AppError("CONFLICT", "Project was modified by someone else", { code: "version_mismatch" });
    return row;
  }

  async softDelete(organizationId: string, id: string, userId: string) {
    await this.db.update(schema.projects).set({ deletedAt: new Date(), deletedBy: userId })
      .where(and(eq(schema.projects.id, id), eq(schema.projects.organizationId, organizationId)));
  }

  /** Object-level access: active org members see workspace projects; private projects require membership. */
  async assertAccess(organizationId: string, projectId: string, userId: string) {
    const project = await this.get(organizationId, projectId);
    if (!(await canAccessProject(this.db, organizationId, projectId, userId))) {
      throw new AppError("FORBIDDEN", "You do not have access to this project");
    }
    return project;
  }
}
