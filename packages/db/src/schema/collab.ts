import { primaryKey, integer, pgTable, uuid, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { auditColumns } from "./_common.js";
import { organizations, users } from "./identity.js";
import { workItems } from "./work.js";

/* ============================================================
 * COMMENTS / MENTIONS / REACTIONS
 * ============================================================ */
export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workItemId: uuid("work_item_id").notNull().references(() => workItems.id),
  parentCommentId: uuid("parent_comment_id"),           // thread root = null
  authorUserId: uuid("author_user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id), // action item
  ...auditColumns,
}, (t) => ({
  byItem: index("comments_item_idx").on(t.workItemId, t.createdAt),
  byParent: index("comments_parent_idx").on(t.parentCommentId),
}));

export const commentMentions = pgTable("comment_mentions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  commentId: uuid("comment_id").notNull().references(() => comments.id),
  mentionedUserId: uuid("mentioned_user_id").notNull().references(() => users.id),
  notified: text("notified").default("false").notNull(),  // whether an authorised notification was sent
}, (t) => ({ unique: uniqueIndex("comment_mentions_unique").on(t.commentId, t.mentionedUserId) }));

export const commentReactions = pgTable("comment_reactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  commentId: uuid("comment_id").notNull().references(() => comments.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  emoji: text("emoji").notNull(),
}, (t) => ({ unique: uniqueIndex("comment_reactions_unique").on(t.commentId, t.userId, t.emoji) }));

/* ============================================================
 * NOTIFICATIONS (inbox) + PREFERENCES
 * dedupe_key makes delivery idempotent (realtime reconnect safe).
 * ============================================================ */
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  recipientUserId: uuid("recipient_user_id").notNull().references(() => users.id),
  type: text("type").notNull(),                          // mention|assigned|comment|watch
  workItemId: uuid("work_item_id"),
  commentId: uuid("comment_id"),
  actorUserId: uuid("actor_user_id").references(() => users.id),
  data: text("data"),
  dedupeKey: text("dedupe_key").notNull(),
  readAt: timestamp("read_at", { withTimezone: true }),
  bookmarkedAt: timestamp("bookmarked_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  dedupeUnique: uniqueIndex("notifications_dedupe_unique").on(t.dedupeKey),
  byRecipient: index("notifications_recipient_idx").on(t.recipientUserId, t.readAt),
}));

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  channel: text("channel").default("inbox").notNull(),   // inbox|email
  enabled: text("enabled").default("true").notNull(),
}, (t) => ({ unique: uniqueIndex("notification_prefs_unique").on(t.userId, t.type, t.channel) }));

/** F23: per-user delivery behaviour — digest schedule and quiet hours. */
export const notificationDeliverySettings = pgTable("notification_delivery_settings", {
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  digestFrequency: text("digest_frequency").default("off").notNull(), // off|daily|weekly
  digestHour: integer("digest_hour").default(9).notNull(),
  quietFrom: integer("quiet_from"),
  quietTo: integer("quiet_to"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.userId] }) }));

/** F23: emails held back by quiet hours or batched into a digest. */
export const notificationDigestQueue = pgTable("notification_digest_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  queuedReason: text("queued_reason").notNull(), // digest|quiet_hours
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  flushedAt: timestamp("flushed_at", { withTimezone: true }),
}, (t) => ({ byUser: index("notif_digest_queue_user_idx").on(t.organizationId, t.userId, t.flushedAt) }));
