import { Injectable, Inject, Optional, forwardRef } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { PlansService } from "../plans/plans.service.js";
import { WorkItemsService } from "./work-items.service.js";
import { canAccessProject } from "../collab/access.js";

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Optional() private readonly plans?: PlansService,
    @Optional() @Inject(forwardRef(() => WorkItemsService)) private readonly items?: WorkItemsService,
  ) {}

  async create(organizationId: string, userId: string, input: { workspaceId: string; name: string; keyPrefix: string; privacy?: "workspace" | "private" }) {
    if (this.plans) await this.plans.assertWithinLimit(organizationId, "projects", userId);
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
  async update(organizationId: string, id: string, userId: string, patch: Partial<{ status: string; health: string; startDate: string | null; dueDate: string | null; name: string; description: string | null; color: string; privacy: string; icon: string; wipLimits: Record<string, { limit: number; warnOnly: boolean }> | null }>, expectedVersion: number) {
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

  /**
   * Duplicate a project: metadata, sections, root tasks and one level of subtasks.
   * Comments, attachments and automation are intentionally not copied.
   * A fresh key prefix is derived because (org, keyPrefix) is unique.
   */
  async duplicate(organizationId: string, userId: string, sourceId: string, name?: string) {
    if (!this.items) throw new AppError("INTERNAL", "Work item service unavailable");
    if (!(await canAccessProject(this.db, organizationId, sourceId, userId))) throw new AppError("FORBIDDEN", "You do not have access to this project");
    const src = await this.get(organizationId, sourceId);

    const taken = new Set((await this.db.select({ keyPrefix: schema.projects.keyPrefix }).from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId))).map((r) => r.keyPrefix));
    const base = src.keyPrefix.replace(/[0-9]+$/, "") || src.keyPrefix;
    let prefix = src.keyPrefix; let n = 2;
    while (taken.has(prefix)) { prefix = `${base}${n}`.slice(0, 8); n += 1; }

    const created = await this.create(organizationId, userId, {
      workspaceId: src.workspaceId, name: (name?.trim() || `${src.name} (copy)`), keyPrefix: prefix,
      privacy: (src.privacy === "private" ? "private" : "workspace"),
    });
    await this.update(organizationId, created.id, userId, {
      description: src.description ?? null, color: src.color ?? undefined, icon: src.icon ?? undefined,
      health: src.health, startDate: src.startDate ?? null, dueDate: src.dueDate ?? null,
    }, created.version);

    const srcSections = await this.db.select().from(schema.sections)
      .where(and(eq(schema.sections.organizationId, organizationId), eq(schema.sections.projectId, sourceId), isNull(schema.sections.deletedAt)));
    const sectionMap = new Map<string, string>();
    for (const s of srcSections) {
      const [row] = await this.db.insert(schema.sections).values({ organizationId, projectId: created.id, name: s.name, rank: s.rank, createdBy: userId }).returning();
      sectionMap.set(s.id, row.id);
    }

    const types = await this.db.select({ id: schema.workItemTypes.id, key: schema.workItemTypes.key }).from(schema.workItemTypes)
      .where(eq(schema.workItemTypes.organizationId, organizationId));
    const typeKeyById = new Map(types.map((t) => [t.id, t.key]));

    const srcItems = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, sourceId), isNull(schema.workItems.deletedAt)));
    const placements = await this.db.select({ workItemId: schema.workItemPlacements.workItemId, sectionId: schema.workItemPlacements.sectionId })
      .from(schema.workItemPlacements)
      .where(and(eq(schema.workItemPlacements.organizationId, organizationId), eq(schema.workItemPlacements.projectId, sourceId), eq(schema.workItemPlacements.isOwning, true)));
    const sectionOf = new Map(placements.map((p) => [p.workItemId, p.sectionId]));
    const roots = srcItems.filter((it) => !it.parentId);
    const childrenOf = (pid: string) => srcItems.filter((it) => it.parentId === pid);

    const copyExtras = async (newId: string, from: typeof srcItems[number]) => {
      await this.db.update(schema.workItems).set({
        startDate: from.startDate, dueDate: from.dueDate, estimateMinutes: from.estimateMinutes,
        storyPoints: from.storyPoints, progress: from.progress, updatedBy: userId, updatedAt: new Date(),
      }).where(and(eq(schema.workItems.id, newId), eq(schema.workItems.organizationId, organizationId)));
    };

    let copied = 0;
    for (const root of roots) {
      const typeKey = typeKeyById.get(root.typeId) ?? "task";
      const srcSection = sectionOf.get(root.id);
      const newRoot = await this.items.create(organizationId, userId, {
        projectId: created.id, title: root.title, typeKey: typeKey === "subtask" ? "task" : typeKey,
        sectionId: srcSection ? sectionMap.get(srcSection) : undefined,
        primaryOwnerUserId: root.primaryOwnerUserId ?? undefined,
        priority: root.priority, status: root.status, description: root.description ?? undefined,
      });
      await copyExtras(newRoot.id, root); copied += 1;
      for (const child of childrenOf(root.id)) {
        const newChild = await this.items.create(organizationId, userId, {
          projectId: created.id, title: child.title, typeKey: "subtask", parentId: newRoot.id,
          primaryOwnerUserId: child.primaryOwnerUserId ?? undefined,
          priority: child.priority, status: child.status, description: child.description ?? undefined,
        });
        await copyExtras(newChild.id, child); copied += 1;
      }
    }
    return { ...created, copiedItems: copied, copiedSections: srcSections.length };
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
