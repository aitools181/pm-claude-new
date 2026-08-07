import { pgTable, uuid, text, boolean, integer, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";

/* ============================================================
 * CHAT — Phase 13 (optional module: channels/DMs/threads)
 * ============================================================ */
export const chatChannels = pgTable("chat_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  kind: text("kind").default("channel").notNull(),      // channel|dm
  name: text("name").notNull(),
  isPrivate: boolean("is_private").default(false).notNull(),
  retentionDays: integer("retention_days"),             // null = keep forever
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("chat_channels_org_idx").on(t.organizationId) }));

export const chatChannelMembers = pgTable("chat_channel_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  channelId: uuid("channel_id").notNull().references(() => chatChannels.id),
  userId: uuid("user_id").notNull().references(() => users.id),
}, (t) => ({ byChannel: index("chat_members_channel_idx").on(t.channelId, t.userId) }));

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  channelId: uuid("channel_id").notNull().references(() => chatChannels.id),
  parentMessageId: uuid("parent_message_id"),           // thread root (self-ref, no FK to avoid cycle)
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdWorkItemId: uuid("created_work_item_id").references(() => workItems.id), // message-to-task link
  editedAt: timestamp("edited_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byChannel: index("chat_messages_channel_idx").on(t.channelId, t.createdAt), byThread: index("chat_messages_thread_idx").on(t.parentMessageId) }));
