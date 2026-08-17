import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, desc } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { canAccessWorkItem } from "./access.js";
import { NotificationsService } from "./notifications.service.js";

type Visibility = "all" | "internal" | "role_group" | "specific" | "inherit";

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

  async create(organizationId: string, authorUserId: string, workItemId: string, input: { body: string; parentCommentId?: string; mentionUserIds?: string[]; assignedToUserId?: string; visibility?: Visibility; visibilityRoleKey?: string; visibleToUserIds?: string[] }) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, authorUserId))) {
      throw new AppError("FORBIDDEN", "No access to this work item");
    }

    // SEC.D4 — a reply with no explicit visibility inherits the parent's scope.
    const visibility: Visibility = input.parentCommentId && !input.visibility ? "inherit" : (input.visibility ?? "all");
    if (visibility === "role_group" && !input.visibilityRoleKey) throw new AppError("VALIDATION", "A role-restricted comment needs a role key");

    const [comment] = await this.db.insert(schema.comments).values({
      organizationId, workItemId, authorUserId, body: input.body,
      parentCommentId: input.parentCommentId, assignedToUserId: input.assignedToUserId, createdBy: authorUserId,
      visibility, visibilityRoleKey: input.visibilityRoleKey ?? null,
    }).returning();

    if (visibility === "specific" && input.visibleToUserIds?.length) {
      await this.db.insert(schema.commentVisibleToUsers)
        .values([authorUserId, ...input.visibleToUserIds.filter((id) => id !== authorUserId)].map((userId) => ({ commentId: comment.id, userId })))
        .onConflictDoNothing();
    }

    // Mentions: record all; notify only those who both have work-item access
    // AND can actually see this comment's visibility scope ("inaccessible mention blocked").
    const mentionIds = parseMentionIds(input.body, input.mentionUserIds);
    for (const uid of mentionIds) {
      const hasItemAccess = await canAccessWorkItem(this.db, organizationId, workItemId, uid);
      const canSeeComment = hasItemAccess && await this.canViewComment(organizationId, comment.id, uid, visibility, input.visibilityRoleKey ?? null);
      await this.db.insert(schema.commentMentions)
        .values({ organizationId, commentId: comment.id, mentionedUserId: uid, notified: canSeeComment ? "true" : "false" })
        .onConflictDoNothing();
      if (canSeeComment && uid !== authorUserId) {
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

    // Notify watchers (except the author) who can see this comment's scope, deduped per comment.
    const watchers = await this.db.select().from(schema.workItemWatchers)
      .where(and(eq(schema.workItemWatchers.workItemId, workItemId), eq(schema.workItemWatchers.organizationId, organizationId)));
    for (const w of watchers) {
      if (w.userId === authorUserId) continue;
      if (!(await this.canViewComment(organizationId, comment.id, w.userId, visibility, input.visibilityRoleKey ?? null))) continue;
      await this.notifications.notify({
        organizationId, recipientUserId: w.userId, type: "comment", workItemId, commentId: comment.id,
        actorUserId: authorUserId, dedupeKey: `comment:${comment.id}:${w.userId}`,
      });
    }
    return comment;
  }

  /** SEC.D4 — resolves whether a viewer can see one comment given its (possibly inherited) visibility scope. */
  private async canViewComment(organizationId: string, commentId: string, viewerUserId: string, visibility: Visibility, visibilityRoleKey: string | null): Promise<boolean> {
    let effective = visibility; let roleKey = visibilityRoleKey;
    if (visibility === "inherit") {
      const [c] = await this.db.select({ parentCommentId: schema.comments.parentCommentId }).from(schema.comments).where(eq(schema.comments.id, commentId)).limit(1);
      if (c?.parentCommentId) {
        const [parent] = await this.db.select({ visibility: schema.comments.visibility, visibilityRoleKey: schema.comments.visibilityRoleKey }).from(schema.comments).where(eq(schema.comments.id, c.parentCommentId)).limit(1);
        effective = (parent?.visibility as Visibility) ?? "all"; roleKey = parent?.visibilityRoleKey ?? null;
      } else effective = "all";
    }
    if (effective === "all") return true;
    if (effective === "internal") {
      const [m] = await this.db.select({ accountType: schema.organizationMemberships.accountType }).from(schema.organizationMemberships)
        .where(and(eq(schema.organizationMemberships.organizationId, organizationId), eq(schema.organizationMemberships.userId, viewerUserId))).limit(1);
      return m?.accountType !== "guest";
    }
    if (effective === "role_group" && roleKey) {
      const [r] = await this.db.select({ id: schema.userRoleAssignments.id }).from(schema.userRoleAssignments)
        .where(and(eq(schema.userRoleAssignments.organizationId, organizationId), eq(schema.userRoleAssignments.userId, viewerUserId), eq(schema.userRoleAssignments.roleKey, roleKey))).limit(1);
      return Boolean(r);
    }
    if (effective === "specific") {
      const [v] = await this.db.select({ id: schema.commentVisibleToUsers.id }).from(schema.commentVisibleToUsers)
        .where(and(eq(schema.commentVisibleToUsers.commentId, commentId), eq(schema.commentVisibleToUsers.userId, viewerUserId))).limit(1);
      return Boolean(v);
    }
    return true;
  }

  async list(organizationId: string, workItemId: string, userId: string) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) {
      throw new AppError("FORBIDDEN", "No access to this work item");
    }
    const rows = await this.db.select().from(schema.comments)
      .where(and(eq(schema.comments.organizationId, organizationId), eq(schema.comments.workItemId, workItemId), isNull(schema.comments.deletedAt)))
      .orderBy(desc(schema.comments.createdAt));
    // SEC.D4 — filter by effective visibility (own comments always visible).
    const visible: (typeof rows)[number][] = [];
    for (const row of rows) {
      if (row.authorUserId === userId || await this.canViewComment(organizationId, row.id, userId, row.visibility as Visibility, row.visibilityRoleKey)) visible.push(row);
    }
    return visible;
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
