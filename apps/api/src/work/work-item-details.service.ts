import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "../collab/access.js";

@Injectable()
export class WorkItemDetailsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private async assertAccess(org: string, userId: string, workItemId: string) {
    if (!(await canAccessWorkItem(this.db, org, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
  }

  async listChecklistItems(org: string, userId: string, workItemId: string) {
    await this.assertAccess(org, userId, workItemId);
    const lists = await this.db.select().from(schema.checklists).where(and(
      eq(schema.checklists.organizationId, org),
      eq(schema.checklists.workItemId, workItemId),
      isNull(schema.checklists.deletedAt),
    ));
    if (!lists.length) return [];
    const items = await this.db.select().from(schema.checklistItems)
      .where(and(eq(schema.checklistItems.organizationId, org), inArray(schema.checklistItems.checklistId, lists.map((row) => row.id))));
    const titles = new Map(lists.map((row) => [row.id, row.title]));
    return items.sort((a, b) => a.rank.localeCompare(b.rank)).map((row) => ({ ...row, checklistTitle: titles.get(row.checklistId) ?? "Checklist" }));
  }

  async addChecklistItem(org: string, userId: string, workItemId: string, text: string) {
    await this.assertAccess(org, userId, workItemId);
    return this.db.transaction(async (tx) => {
      let [list] = await tx.select().from(schema.checklists).where(and(
        eq(schema.checklists.organizationId, org), eq(schema.checklists.workItemId, workItemId), isNull(schema.checklists.deletedAt),
      )).limit(1);
      if (!list) [list] = await tx.insert(schema.checklists).values({ organizationId: org, workItemId, title: "Checklist", createdBy: userId }).returning();
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(schema.checklistItems).where(eq(schema.checklistItems.checklistId, list.id));
      const [item] = await tx.insert(schema.checklistItems).values({
        organizationId: org, checklistId: list.id, text: text.trim(), rank: `r${String(count + 1).padStart(8, "0")}`,
      }).returning();
      await tx.insert(schema.activityEvents).values({ organizationId: org, workItemId, actorUserId: userId, action: "work_item.checklist_item_added", data: JSON.stringify({ checklistItemId: item.id }) });
      return item;
    });
  }

  async updateChecklistItem(org: string, userId: string, workItemId: string, itemId: string, patch: { text?: string; done?: boolean }) {
    await this.assertAccess(org, userId, workItemId);
    const [owned] = await this.db.select({ id: schema.checklistItems.id }).from(schema.checklistItems)
      .innerJoin(schema.checklists, eq(schema.checklists.id, schema.checklistItems.checklistId))
      .where(and(eq(schema.checklistItems.id, itemId), eq(schema.checklistItems.organizationId, org), eq(schema.checklists.workItemId, workItemId))).limit(1);
    if (!owned) throw new AppError("NOT_FOUND", "Checklist item not found");
    const update: { text?: string; done?: boolean } = {};
    if (patch.text !== undefined) update.text = patch.text.trim();
    if (patch.done !== undefined) update.done = patch.done;
    const [row] = await this.db.update(schema.checklistItems).set(update).where(eq(schema.checklistItems.id, itemId)).returning();
    await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId, actorUserId: userId, action: "work_item.checklist_item_updated", data: JSON.stringify({ checklistItemId: itemId, patch: Object.keys(update) }) });
    return row;
  }

  async removeChecklistItem(org: string, userId: string, workItemId: string, itemId: string) {
    await this.assertAccess(org, userId, workItemId);
    const [row] = await this.db.select({ id: schema.checklistItems.id }).from(schema.checklistItems)
      .innerJoin(schema.checklists, eq(schema.checklists.id, schema.checklistItems.checklistId))
      .where(and(eq(schema.checklistItems.id, itemId), eq(schema.checklistItems.organizationId, org), eq(schema.checklists.workItemId, workItemId))).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Checklist item not found");
    await this.db.delete(schema.checklistItems).where(eq(schema.checklistItems.id, itemId));
    await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId, actorUserId: userId, action: "work_item.checklist_item_removed", data: JSON.stringify({ checklistItemId: itemId }) });
  }

  async listTags(org: string, userId: string, workItemId: string) {
    await this.assertAccess(org, userId, workItemId);
    return this.db.select({ id: schema.tags.id, name: schema.tags.name }).from(schema.workItemTags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.workItemTags.tagId))
      .where(and(eq(schema.tags.organizationId, org), eq(schema.workItemTags.workItemId, workItemId)));
  }

  async addTag(org: string, userId: string, workItemId: string, rawName: string) {
    await this.assertAccess(org, userId, workItemId);
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!name) throw new AppError("VALIDATION", "Tag name is required");
    return this.db.transaction(async (tx) => {
      let [tag] = await tx.select().from(schema.tags).where(and(eq(schema.tags.organizationId, org), eq(schema.tags.name, name))).limit(1);
      if (!tag) [tag] = await tx.insert(schema.tags).values({ organizationId: org, name }).returning();
      await tx.insert(schema.workItemTags).values({ workItemId, tagId: tag.id }).onConflictDoNothing();
      await tx.insert(schema.activityEvents).values({ organizationId: org, workItemId, actorUserId: userId, action: "work_item.tag_added", data: JSON.stringify({ tagId: tag.id, name }) });
      return tag;
    });
  }

  async removeTag(org: string, userId: string, workItemId: string, tagId: string) {
    await this.assertAccess(org, userId, workItemId);
    await this.db.delete(schema.workItemTags).where(and(eq(schema.workItemTags.workItemId, workItemId), eq(schema.workItemTags.tagId, tagId)));
    await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId, actorUserId: userId, action: "work_item.tag_removed", data: JSON.stringify({ tagId }) });
  }
}
