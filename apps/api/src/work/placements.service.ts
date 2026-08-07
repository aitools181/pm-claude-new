import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { rankBetween } from "./rank.js";
import { canAccessWorkItem } from "../collab/access.js";
import { ProjectsService } from "./projects.service.js";

@Injectable()
export class PlacementsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly projects: ProjectsService) {}

  /**
   * Link a work item into another project (same org). Permission INTERSECTION:
   * the actor must have access to BOTH the source item and the target project.
   * Linking never grants access — viewers still need access to the owning project.
   */
  async link(organizationId: string, userId: string, workItemId: string, targetProjectId: string) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to the work item");
    await this.projects.assertAccess(organizationId, targetProjectId, userId); // access to target project

    const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");
    if (item.owningProjectId === targetProjectId) throw new AppError("VALIDATION", "Already in its owning project");

    try {
      const [placement] = await this.db.insert(schema.workItemPlacements)
        .values({ organizationId, workItemId, projectId: targetProjectId, rank: rankBetween(null, null), isOwning: false, createdBy: userId })
        .returning();
      await this.db.insert(schema.activityEvents).values({ organizationId, workItemId, projectId: targetProjectId, actorUserId: userId, action: "work_item.linked", data: "linking does not grant access" });
      return placement;
    } catch {
      throw new AppError("CONFLICT", "Already linked to that project");
    }
  }

  async unlink(organizationId: string, userId: string, placementId: string) {
    const [p] = await this.db.select().from(schema.workItemPlacements).where(and(eq(schema.workItemPlacements.id, placementId), eq(schema.workItemPlacements.organizationId, organizationId))).limit(1);
    if (!p) throw new AppError("NOT_FOUND", "Placement not found");
    if (p.isOwning) throw new AppError("VALIDATION", "The owning placement cannot be removed");
    await this.db.delete(schema.workItemPlacements).where(eq(schema.workItemPlacements.id, placementId));
    await this.db.insert(schema.activityEvents).values({ organizationId, workItemId: p.workItemId, projectId: p.projectId, actorUserId: userId, action: "work_item.unlinked" });
  }
}
