import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { SessionGuard } from "../auth/guards/session.guard.js";
import { OrgContextGuard } from "../org-context/org-context.guard.js";
import { CommentsService } from "./comments.service.js";
import { WatchersService } from "./watchers.service.js";
import { NotificationsService } from "./notifications.service.js";

type Ctx = Request & { userId: string; organizationId: string };
const createComment = z.object({ body: z.string().min(1), parentCommentId: z.string().uuid().optional(), mentionUserIds: z.array(z.string().uuid()).optional(), assignedToUserId: z.string().uuid().optional() });
const reactDto = z.object({ emoji: z.string().min(1).max(16) });

@Controller()
@UseGuards(SessionGuard, OrgContextGuard)
export class CollabController {
  constructor(
    private readonly comments: CommentsService,
    private readonly watchers: WatchersService,
    private readonly notifications: NotificationsService,
  ) {}

  @Post("work-items/:id/comments")
  addComment(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(createComment)) b: z.infer<typeof createComment>) {
    return this.comments.create(r.organizationId, r.userId, id, b);
  }
  @Get("work-items/:id/comments")
  listComments(@Req() r: Ctx, @Param("id") id: string) { return this.comments.list(r.organizationId, id, r.userId); }

  @Post("comments/:id/reactions")
  react(@Req() r: Ctx, @Param("id") id: string, @Body(new ZodPipe(reactDto)) b: { emoji: string }) {
    return this.comments.react(r.organizationId, id, r.userId, b.emoji).then(() => ({ ok: true }));
  }
  @Delete("comments/:id/reactions/:emoji")
  unreact(@Req() r: Ctx, @Param("id") id: string, @Param("emoji") emoji: string) {
    return this.comments.unreact(r.organizationId, id, r.userId, decodeURIComponent(emoji)).then(() => ({ ok: true }));
  }
  @Delete("comments/:id")
  removeComment(@Req() r: Ctx, @Param("id") id: string) { return this.comments.remove(r.organizationId, id, r.userId).then(() => ({ ok: true })); }

  @Post("work-items/:id/watch")
  watch(@Req() r: Ctx, @Param("id") id: string) { return this.watchers.watch(r.organizationId, id, r.userId).then(() => ({ ok: true })); }
  @Delete("work-items/:id/watch")
  unwatch(@Req() r: Ctx, @Param("id") id: string) { return this.watchers.unwatch(r.organizationId, id, r.userId).then(() => ({ ok: true })); }

  @Get("notifications")
  inbox(@Req() r: Ctx, @Query("unread") unread?: string, @Query("tab") tab?: string) { return this.notifications.inbox(r.organizationId, r.userId, { unreadOnly: unread === "true", tab }); }
  @Get("notifications/unread-count")
  async count(@Req() r: Ctx) { return { count: await this.notifications.unreadCount(r.organizationId, r.userId) }; }
  @Post("notifications/:id/read")
  read(@Req() r: Ctx, @Param("id") id: string) { return this.notifications.markRead(r.organizationId, r.userId, id).then(() => ({ ok: true })); }

  @Post("notifications/:id/bookmark")
  bookmark(@Req() r: Ctx, @Param("id") id: string) { return this.notifications.setBookmark(r.organizationId, r.userId, id, true); }
  @Delete("notifications/:id/bookmark")
  unbookmark(@Req() r: Ctx, @Param("id") id: string) { return this.notifications.setBookmark(r.organizationId, r.userId, id, false); }
  @Post("notifications/:id/archive")
  archive(@Req() r: Ctx, @Param("id") id: string) { return this.notifications.setArchive(r.organizationId, r.userId, id, true); }
  @Delete("notifications/:id/archive")
  unarchive(@Req() r: Ctx, @Param("id") id: string) { return this.notifications.setArchive(r.organizationId, r.userId, id, false); }

  @Post("notifications/read-all")
  readAll(@Req() r: Ctx) { return this.notifications.markAllRead(r.organizationId, r.userId).then(() => ({ ok: true })); }
}
