import { Injectable, Inject } from "@nestjs/common";
import { and, eq, desc, isNull, isNotNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { RealtimeGateway } from "../realtime/realtime.gateway.js";

@Injectable()
export class NotificationsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly realtime: RealtimeGateway) {}

  async notify(input: {
    organizationId: string; recipientUserId: string; type: string;
    workItemId?: string; commentId?: string; actorUserId?: string; data?: string; dedupeKey: string;
  }) {
    const rows = await this.db.insert(schema.notifications).values(input)
      .onConflictDoNothing({ target: schema.notifications.dedupeKey }).returning();
    if (rows[0]) this.realtime.emitToUser(input.recipientUserId, "notification", rows[0]);
  }

  async inbox(organizationId: string, userId: string, opts: { unreadOnly?: boolean; tab?: string; sort?: "newest" | "relevance" } = {}) {
    const conds = [eq(schema.notifications.organizationId, organizationId), eq(schema.notifications.recipientUserId, userId)];
    if (opts.unreadOnly) conds.push(isNull(schema.notifications.readAt));
    if (opts.tab === "bookmarks") conds.push(isNotNull(schema.notifications.bookmarkedAt));
    else if (opts.tab === "archive") conds.push(isNotNull(schema.notifications.archivedAt));
    else {
      conds.push(isNull(schema.notifications.archivedAt));
      if (opts.tab === "mentioned") conds.push(eq(schema.notifications.type, "mention"));
    }
    const rows = await this.db.select().from(schema.notifications).where(and(...conds)).orderBy(desc(schema.notifications.createdAt)).limit(250);
    if (opts.sort !== "relevance") return rows;
    const weight = (row: typeof rows[number]) => {
      const unread = row.readAt ? 0 : 100;
      const bookmarked = row.bookmarkedAt ? 25 : 0;
      const type = row.type === "mention" ? 40 : row.type === "assigned" ? 32 : row.type === "comment" ? 18 : 10;
      const ageHours = Math.max(0, (Date.now() - new Date(row.createdAt).getTime()) / 3_600_000);
      return unread + bookmarked + type + Math.max(0, 24 - ageHours / 6);
    };
    return rows.slice().sort((a, b) => weight(b) - weight(a) || +new Date(b.createdAt) - +new Date(a.createdAt));
  }
  async markRead(organizationId: string, userId: string, id: string) {
    await this.db.update(schema.notifications).set({ readAt: new Date() })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId)));
  }
  async markAllRead(organizationId: string, userId: string) {
    await this.db.update(schema.notifications).set({ readAt: new Date() })
      .where(and(eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId), isNull(schema.notifications.readAt), isNull(schema.notifications.archivedAt)));
  }
  async setBookmark(organizationId: string, userId: string, id: string, on: boolean) {
    const [row] = await this.db.update(schema.notifications).set({ bookmarkedAt: on ? new Date() : null })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Inbox item not found");
    return row;
  }
  async setArchive(organizationId: string, userId: string, id: string, on: boolean) {
    const [row] = await this.db.update(schema.notifications).set({ archivedAt: on ? new Date() : null, readAt: on ? new Date() : undefined })
      .where(and(eq(schema.notifications.id, id), eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Inbox item not found");
    return row;
  }
  async archiveAll(organizationId: string, userId: string) {
    const rows = await this.db.update(schema.notifications).set({ archivedAt: new Date(), readAt: new Date() })
      .where(and(eq(schema.notifications.recipientUserId, userId), eq(schema.notifications.organizationId, organizationId), isNull(schema.notifications.archivedAt))).returning({ id: schema.notifications.id });
    return { archived: rows.length };
  }

  async unreadCount(organizationId: string, userId: string): Promise<number> {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.notifications)
      .where(and(eq(schema.notifications.organizationId, organizationId), eq(schema.notifications.recipientUserId, userId), isNull(schema.notifications.readAt), isNull(schema.notifications.archivedAt)));
    return count;
  }
}
