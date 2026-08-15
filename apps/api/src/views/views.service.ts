import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, or, ilike, inArray, desc, ne } from "drizzle-orm";
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

  /** Tasks I created and delegated: reporter is me, owner is someone else or unassigned. Access-filtered. */
  async delegated(organizationId: string, userId: string) {
    const rows = await this.db.select().from(schema.workItems).where(and(
      eq(schema.workItems.organizationId, organizationId),
      isNull(schema.workItems.deletedAt),
      eq(schema.workItems.reporterUserId, userId),
      or(isNull(schema.workItems.primaryOwnerUserId), ne(schema.workItems.primaryOwnerUserId, userId)),
    )).orderBy(desc(schema.workItems.updatedAt)).limit(100);

    const visible = [];
    for (const it of rows) if (await canAccessWorkItem(this.db, organizationId, it.id, userId)) visible.push(it);

    const ownerIds = [...new Set(visible.map((r) => r.primaryOwnerUserId).filter((v): v is string => Boolean(v)))];
    const owners = ownerIds.length
      ? await this.db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, ownerIds))
      : [];
    const nameById = new Map(owners.map((u) => [u.id, u.displayName]));
    return visible.map((it) => ({ ...it, ownerDisplayName: it.primaryOwnerUserId ? nameById.get(it.primaryOwnerUserId) ?? null : null }));
  }

  /**
   * Per-member workload counts for the Home People widget.
   * Returns only aggregate numbers keyed by userId — no titles or keys — so
   * project-level access filtering is not required for this signal.
   */
  async peopleOverview(organizationId: string) {
    const rows = await this.db.select({
      ownerId: schema.workItems.primaryOwnerUserId,
      statusCategory: schema.workItems.statusCategory,
      dueDate: schema.workItems.dueDate,
    }).from(schema.workItems)
      .where(and(eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt)))
      .limit(5000);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const stats = new Map<string, { overdue: number; completed: number; upcoming: number }>();
    for (const row of rows) {
      if (!row.ownerId) continue;
      const entry = stats.get(row.ownerId) ?? { overdue: 0, completed: 0, upcoming: 0 };
      if (row.statusCategory === "done") entry.completed += 1;
      else if (row.dueDate && new Date(`${row.dueDate}T00:00:00`) < today) entry.overdue += 1;
      else entry.upcoming += 1;
      stats.set(row.ownerId, entry);
    }
    return [...stats.entries()].map(([userId, s]) => ({ userId, ...s }));
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
