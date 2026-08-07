import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";

const DAY_MS = 86_400_000;

@Injectable()
export class ChatService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly modules: ModulesService,
    @Optional() private readonly workItems?: WorkItemsService,
  ) {}

  private enabled(org: string) { return this.modules.assertEnabled(org, "chat"); }

  private async loadChannel(org: string, channelId: string) {
    const [c] = await this.db.select().from(schema.chatChannels).where(and(eq(schema.chatChannels.id, channelId), eq(schema.chatChannels.organizationId, org))).limit(1);
    if (!c) throw new AppError("NOT_FOUND", "Channel not found");
    return c;
  }
  private async isMember(channelId: string, userId: string) {
    const [m] = await this.db.select().from(schema.chatChannelMembers).where(and(eq(schema.chatChannelMembers.channelId, channelId), eq(schema.chatChannelMembers.userId, userId))).limit(1);
    return !!m;
  }
  /** Public channels are open to org members; private/DM require membership. */
  private async assertAccess(channel: typeof schema.chatChannels.$inferSelect, userId: string) {
    if (channel.isPrivate || channel.kind === "dm") { if (!(await this.isMember(channel.id, userId))) throw new AppError("FORBIDDEN", "Not a member of this channel"); }
  }

  async createChannel(org: string, userId: string, input: { kind?: "channel" | "dm"; name: string; isPrivate?: boolean; retentionDays?: number; memberIds?: string[] }) {
    await this.enabled(org);
    const [channel] = await this.db.insert(schema.chatChannels).values({ organizationId: org, kind: input.kind ?? "channel", name: input.name, isPrivate: input.isPrivate ?? false, retentionDays: input.retentionDays ?? null, createdByUserId: userId }).returning();
    const members = Array.from(new Set([userId, ...(input.memberIds ?? [])]));
    await this.db.insert(schema.chatChannelMembers).values(members.map((uid) => ({ organizationId: org, channelId: channel.id, userId: uid })));
    return channel;
  }

  async listChannels(org: string, userId: string) {
    await this.enabled(org);
    const memberChannelIds = (await this.db.select({ id: schema.chatChannelMembers.channelId }).from(schema.chatChannelMembers).where(eq(schema.chatChannelMembers.userId, userId))).map((r) => r.id);
    return this.db.select().from(schema.chatChannels).where(and(eq(schema.chatChannels.organizationId, org),
      or(eq(schema.chatChannels.isPrivate, false), memberChannelIds.length ? sql`${schema.chatChannels.id} = ANY(${memberChannelIds})` : sql`false`))).orderBy(asc(schema.chatChannels.createdAt));
  }

  async postMessage(org: string, userId: string, channelId: string, input: { body: string; parentMessageId?: string }) {
    await this.enabled(org);
    const channel = await this.loadChannel(org, channelId);
    await this.assertAccess(channel, userId);
    const [msg] = await this.db.insert(schema.chatMessages).values({ organizationId: org, channelId, authorUserId: userId, body: input.body, parentMessageId: input.parentMessageId ?? null }).returning();
    return msg;
  }

  async listMessages(org: string, userId: string, channelId: string) {
    await this.enabled(org);
    const channel = await this.loadChannel(org, channelId);
    await this.assertAccess(channel, userId);
    return this.db.select().from(schema.chatMessages).where(and(eq(schema.chatMessages.channelId, channelId), isNull(schema.chatMessages.deletedAt))).orderBy(asc(schema.chatMessages.createdAt));
  }

  /** Convert a chat message into an authorised work item (requires channel access). */
  async messageToTask(org: string, userId: string, messageId: string, input: { projectId: string; title?: string }) {
    await this.enabled(org);
    if (!this.workItems) throw new AppError("VALIDATION", "Work item service unavailable");
    const [msg] = await this.db.select().from(schema.chatMessages).where(and(eq(schema.chatMessages.id, messageId), eq(schema.chatMessages.organizationId, org))).limit(1);
    if (!msg) throw new AppError("NOT_FOUND", "Message not found");
    const channel = await this.loadChannel(org, msg.channelId);
    await this.assertAccess(channel, userId); // authorisation: only channel members may convert
    const title = (input.title ?? msg.body).slice(0, 200);
    const item = await this.workItems.create(org, userId, { projectId: input.projectId, title });
    await this.db.update(schema.chatMessages).set({ createdWorkItemId: item.id }).where(eq(schema.chatMessages.id, messageId));
    return { messageId, workItem: item };
  }

  /** Retention: purge messages in channels older than their channel retention window. */
  async purgeExpired(org: string, now: Date = new Date()) {
    const channels = await this.db.select().from(schema.chatChannels).where(and(eq(schema.chatChannels.organizationId, org), sql`${schema.chatChannels.retentionDays} IS NOT NULL`));
    let purged = 0;
    for (const c of channels) {
      const cutoff = new Date(now.getTime() - (c.retentionDays as number) * DAY_MS);
      const res = await this.db.delete(schema.chatMessages).where(and(eq(schema.chatMessages.channelId, c.id), lt(schema.chatMessages.createdAt, cutoff))).returning({ id: schema.chatMessages.id });
      purged += res.length;
    }
    return { purged };
  }
}
