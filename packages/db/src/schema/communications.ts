import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { projects, workItems } from "./work.js";
import { integrations } from "./integrations.js";

export const mailboxes = pgTable("communication_mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  integrationId: uuid("integration_id").references(() => integrations.id),
  projectId: uuid("project_id").references(() => projects.id),
  address: text("address").notNull(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(),
  routingRules: jsonb("routing_rules").default({}).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("communication_mailboxes_address_unique").on(t.organizationId, t.address) }));

export const emailThreads = pgTable("communication_email_threads", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  mailboxId: uuid("mailbox_id").notNull().references(() => mailboxes.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  subject: text("subject").notNull(),
  externalThreadId: text("external_thread_id"),
  participants: jsonb("participants").default([]).notNull(),
  status: text("status").default("open").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byItem: index("communication_email_threads_item_idx").on(t.workItemId) }));

export const emailMessages = pgTable("communication_email_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  threadId: uuid("thread_id").notNull().references(() => emailThreads.id),
  direction: text("direction").notNull(),
  externalMessageId: text("external_message_id").notNull(),
  fromAddress: text("from_address").notNull(),
  toAddresses: jsonb("to_addresses").default([]).notNull(),
  bodyText: text("body_text"),
  attachments: jsonb("attachments").default([]).notNull(),
  authenticity: text("authenticity").default("unknown").notNull(),
  deliveryStatus: text("delivery_status").default("received").notNull(),
  rawHeaders: jsonb("raw_headers").default({}).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
}, (t) => ({ unique: uniqueIndex("communication_email_messages_external_unique").on(t.organizationId, t.externalMessageId) }));

export const calendarConnections = pgTable("calendar_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  integrationId: uuid("integration_id").references(() => integrations.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  provider: text("provider").notNull(),
  calendarExternalId: text("calendar_external_id").notNull(),
  syncToken: text("sync_token"),
  status: text("status").default("active").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
}, (t) => ({ unique: uniqueIndex("calendar_connections_unique").on(t.organizationId, t.userId, t.provider, t.calendarExternalId) }));

export const calendarEventLinks = pgTable("calendar_event_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  connectionId: uuid("connection_id").notNull().references(() => calendarConnections.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  externalEventId: text("external_event_id").notNull(),
  title: text("title").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  syncVersion: text("sync_version"),
  lastSource: text("last_source").default("external").notNull(),
  conflict: jsonb("conflict"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ unique: uniqueIndex("calendar_event_links_unique").on(t.connectionId, t.externalEventId) }));

export const clips = pgTable("communication_clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").references(() => projects.id),
  workItemId: uuid("work_item_id").references(() => workItems.id),
  title: text("title").notNull(),
  mediaRef: text("media_ref").notNull(),
  durationSeconds: integer("duration_seconds").default(0).notNull(),
  consent: jsonb("consent").default({}).notNull(),
  retentionUntil: timestamp("retention_until", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byItem: index("communication_clips_item_idx").on(t.workItemId) }));

export const transcripts = pgTable("communication_transcripts", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  clipId: uuid("clip_id").references(() => clips.id),
  language: text("language").default("en").notNull(),
  segments: jsonb("segments").default([]).notNull(),
  summary: text("summary"),
  decisions: jsonb("decisions").default([]).notNull(),
  proposedActions: jsonb("proposed_actions").default([]).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byClip: index("communication_transcripts_clip_idx").on(t.clipId) }));

export const communicationSyncSessions = pgTable("communication_sync_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  kind: text("kind").notNull(),
  connectionId: uuid("connection_id"),
  status: text("status").default("running").notNull(),
  cursorBefore: text("cursor_before"),
  cursorAfter: text("cursor_after"),
  summary: jsonb("summary").default({}).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => ({ byOrgKind: index("communication_sync_sessions_idx").on(t.organizationId, t.kind, t.startedAt) }));

export const meetingCaptures = pgTable("meeting_captures", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  projectId: uuid("project_id").references(() => projects.id),
  title: text("title").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }),
  attendees: jsonb("attendees").default([]).notNull(),
  transcriptId: uuid("transcript_id").references(() => transcripts.id),
  summary: text("summary"),
  actionReviewStatus: text("action_review_status").default("pending").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byOrg: index("meeting_captures_org_idx").on(t.organizationId, t.createdAt) }));
