import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, desc } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "./access.js";
import { NotificationsService } from "./notifications.service.js";

/** Extract @<uuid> mentions. Real UI passes explicit userIds; we also parse the body defensively. */
function parseMentionIds(body: string, explicit?: string[]): string[] {
  const re = /@([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
  const found = new Set<string>(explicit ?? []);
  for (const m of body.matchAll(re)) found.add(m[1]);
  return [...found];
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  async create(organizationId: string, authorUserId: string, workItemId: string, input: { body: string; parentCommentId?: string; mentionUserIds?: string[]; assignedToUserId?: string }) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, authorUserId))) {
      throw new AppError("FORBIDDEN", "No access to this work item");
    }

    const [comment] = await this.db.insert(schema.comments).values({
      organizationId, workItemId, authorUserId, body: input.body,
      parentCommentId: input.parentCommentId, assignedToUserId: input.assignedToUserId, createdBy: authorUserId,
    }).returning();

    // Mentions: record all; notify ONLY those who actually have access.
    const mentionIds = parseMentionIds(input.body, input.mentionUserIds);
    for (const uid of mentionIds) {
      const authorised = await canAccessWorkItem(this.db, organizationId, workItemId, uid);
      await this.db.insert(schema.commentMentions)
        .values({ organizationId, commentId: comment.id, mentionedUserId: uid, notified: authorised ? "true" : "false" })
        .onConflictDoNothing();
      if (authorised && uid !== authorUserId) {
        await this.notifications.notify({
          organizationId, recipientUserId: uid, type: "mention", workItemId, commentId: comment.id,
          actorUserId: authorUserId, dedupeKey: `mention:${comment.id}:${uid}`,
        });
      }
    }

    // Action item assignment.
    if (input.assignedToUserId && await canAccessWorkItem(this.db, organizationId, workItemId, input.assignedToUserId)) {
      await this.notifications.notify({
        organizationId, recipientUserId: input.assignedToUserId, type: "assigned", workItemId, commentId: comment.id,
        actorUserId: authorUserId, dedupeKey: `assigned:${comment.id}:${input.assignedToUserId}`,
      });
    }

    // Notify watchers (except the author), deduped per comment.
    const watchers = await this.db.select().from(schema.workItemWatchers)
      .where(and(eq(schema.workItemWatchers.workItemId, workItemId), eq(schema.workItemWatchers.organizationId, organizationId)));
    for (const w of watchers) {
      if (w.userId === authorUserId) continue;
      await this.notifications.notify({
        organizationId, recipientUserId: w.userId, type: "comment", workItemId, commentId: comment.id,
        actorUserId: authorUserId, dedupeKey: `comment:${comment.id}:${w.userId}`,
      });
    }
    return comment;
  }

  async list(organizationId: string, workItemId: string, userId: string) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) {
      throw new AppError("FORBIDDEN", "No access to this work item");
    }
    return this.db.select().from(schema.comments)
      .where(and(eq(schema.comments.organizationId, organizationId), eq(schema.comments.workItemId, workItemId), isNull(schema.comments.deletedAt)))
      .orderBy(desc(schema.comments.createdAt));
  }

  async react(organizationId: string, commentId: string, userId: string, emoji: string) {
    await this.db.insert(schema.commentReactions).values({ organizationId, commentId, userId, emoji }).onConflictDoNothing();
  }
  async unreact(organizationId: string, commentId: string, userId: string, emoji: string) {
    await this.db.delete(schema.commentReactions).where(and(
      eq(schema.commentReactions.commentId, commentId), eq(schema.commentReactions.userId, userId), eq(schema.commentReactions.emoji, emoji), eq(schema.commentReactions.organizationId, organizationId)));
  }

  async remove(organizationId: string, commentId: string, userId: string) {
    const [c] = await this.db.select().from(schema.comments).where(and(eq(schema.comments.id, commentId), eq(schema.comments.organizationId, organizationId))).limit(1);
    if (!c) throw new AppError("NOT_FOUND", "Comment not found");
    if (c.authorUserId !== userId) throw new AppError("FORBIDDEN", "Only the author can delete this comment");
    await this.db.update(schema.comments).set({ deletedAt: new Date(), deletedBy: userId }).where(eq(schema.comments.id, commentId));
  }
}
