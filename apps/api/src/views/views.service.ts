import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, or, ilike, inArray, desc } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "../collab/access.js";

@Injectable()
export class ViewsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Work assigned to me or owned by me, across the org (access-filtered). */
  async myWork(organizationId: string, userId: string) {
    const assignedIds = (await this.db.select({ id: schema.workItemAssignees.workItemId }).from(schema.workItemAssignees)
      .where(and(eq(schema.workItemAssignees.organizationId, organizationId), eq(schema.workItemAssignees.userId, userId)))).map((r) => r.id);

    const rows = await this.db.select().from(schema.workItems).where(and(
      eq(schema.workItems.organizationId, organizationId),
      isNull(schema.workItems.deletedAt),
      or(eq(schema.workItems.primaryOwnerUserId, userId), assignedIds.length ? inArray(schema.workItems.id, assignedIds) : eq(schema.workItems.primaryOwnerUserId, userId)),
    )).orderBy(desc(schema.workItems.updatedAt)).limit(200);

    const visible = [];
    for (const it of rows) if (await canAccessWorkItem(this.db, organizationId, it.id, userId)) visible.push(it);
    return visible;
  }

  /**
   * Global search MVP across projects, work items, comments.
   * Returns ONLY authorised results; respects soft-deletes.
   */
  async search(organizationId: string, userId: string, q: string) {
    const like = `%${q}%`;

    const projectRows = await this.db.select().from(schema.projects)
      .where(and(eq(schema.projects.organizationId, organizationId), isNull(schema.projects.deletedAt), ilike(schema.projects.name, like))).limit(20);
    const projects = [];
    for (const p of projectRows) {
      if (p.privacy === "workspace") { projects.push(p); continue; }
      const [m] = await this.db.select().from(schema.projectMembers).where(and(eq(schema.projectMembers.projectId, p.id), eq(schema.projectMembers.userId, userId))).limit(1);
      if (m) projects.push(p);
    }

    const itemRows = await this.db.select().from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt), or(ilike(schema.workItems.title, like), ilike(schema.workItems.key, like)))).limit(50);
    const workItems = [];
    for (const it of itemRows) if (await canAccessWorkItem(this.db, organizationId, it.id, userId)) workItems.push(it);

    const commentRows = await this.db.select().from(schema.comments)
      .where(and(eq(schema.comments.organizationId, organizationId), isNull(schema.comments.deletedAt), ilike(schema.comments.body, like))).limit(50);
    const comments = [];
    for (const c of commentRows) if (await canAccessWorkItem(this.db, organizationId, c.workItemId, userId)) comments.push(c);

    return { projects, workItems: workItems.slice(0, 25), comments: comments.slice(0, 25) };
  }
}
