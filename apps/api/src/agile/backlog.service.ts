import { Injectable, Inject } from "@nestjs/common";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { rankBetween } from "../work/rank.js";

@Injectable()
export class BacklogService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Product backlog: project items not currently in a sprint, ranked. */
  async list(organizationId: string, projectId: string) {
    const rows = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.sprintId), isNull(schema.workItems.deletedAt)))
      .orderBy(sql`${schema.workItems.backlogRank} asc nulls last`, schema.workItems.createdAt);
    return rows.map((r) => ({ id: r.id, key: r.key, title: r.title, status: r.status, statusCategory: r.statusCategory, storyPoints: r.storyPoints, backlogRank: r.backlogRank }));
  }

  private async rankOf(organizationId: string, id: string | null): Promise<string | null> {
    if (!id) return null;
    const [row] = await this.db.select({ b: schema.workItems.backlogRank }).from(schema.workItems)
      .where(and(eq(schema.workItems.id, id), eq(schema.workItems.organizationId, organizationId))).limit(1);
    return row ? row.b : null;
  }

  /** Move an item between two neighbours using a fractional rank (concurrent-safe). */
  async move(organizationId: string, workItemId: string, beforeId: string | null, afterId: string | null) {
    const before = await this.rankOf(organizationId, beforeId);
    const after = await this.rankOf(organizationId, afterId);
    const backlogRank = rankBetween(before, after);
    const [row] = await this.db.update(schema.workItems).set({ backlogRank })
      .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Work item not found");
    return { id: row.id, backlogRank };
  }

  async setPoints(organizationId: string, workItemId: string, storyPoints: number | null) {
    const [row] = await this.db.update(schema.workItems).set({ storyPoints })
      .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Work item not found");
    return { id: row.id, storyPoints };
  }
}
