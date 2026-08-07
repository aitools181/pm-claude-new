import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, lte, isNull, isNotNull, inArray } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "../collab/access.js";

@Injectable()
export class CalendarViewService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Items with a due date in [from, to], access-filtered. Scope: a project, or "me" (assigned). */
  async range(organizationId: string, userId: string, scope: { projectId?: string; mine?: boolean }, from: string, to: string) {
    const conds = [eq(schema.workItems.organizationId, organizationId), isNull(schema.workItems.deletedAt), isNotNull(schema.workItems.dueDate), gte(schema.workItems.dueDate, from), lte(schema.workItems.dueDate, to)];
    if (scope.projectId) conds.push(eq(schema.workItems.owningProjectId, scope.projectId));

    let rows = await this.db.select().from(schema.workItems).where(and(...conds));
    if (scope.mine) {
      const assigned = new Set((await this.db.select({ id: schema.workItemAssignees.workItemId }).from(schema.workItemAssignees).where(and(eq(schema.workItemAssignees.organizationId, organizationId), eq(schema.workItemAssignees.userId, userId)))).map((r) => r.id));
      rows = rows.filter((r) => assigned.has(r.id) || r.primaryOwnerUserId === userId);
    }
    const visible = [];
    for (const r of rows) if (await canAccessWorkItem(this.db, organizationId, r.id, userId)) visible.push({ id: r.id, key: r.key, title: r.title, startDate: r.startDate, dueDate: r.dueDate, statusCategory: r.statusCategory });
    return visible;
  }

  /** RFC-5545 ICS (all-day VEVENTs) for the same access-filtered items. */
  async ics(organizationId: string, userId: string, scope: { projectId?: string; mine?: boolean }, from: string, to: string) {
    const items = await this.range(organizationId, userId, scope, from, to);
    const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PM Platform//EN", "CALSCALE:GREGORIAN"];
    for (const it of items) {
      lines.push("BEGIN:VEVENT", `UID:${it.id}@pm-platform`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${it.dueDate!.replace(/-/g, "")}`, `SUMMARY:${esc(it.key + " " + it.title)}`, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
}
