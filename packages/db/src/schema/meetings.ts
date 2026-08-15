import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { organizations, users } from "./identity.js";
import { workspaces, workItems } from "./work.js";

/* ============================================================
 * MEETINGS — Phase 10 (series, agenda, decisions, attendance, actions)
 * ============================================================ */

export const meetingSeries = pgTable("meeting_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  name: text("name").notNull(),
  cadence: text("cadence").default("adhoc").notNull(),   // adhoc|daily|weekly|monthly
  ownerUserId: uuid("owner_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  seriesId: uuid("series_id").references(() => meetingSeries.id),
  title: text("title").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  status: text("status").default("scheduled").notNull(), // scheduled|held|cancelled
  notes: text("notes"),
  transcript: text("transcript"), // F40: raw meeting capture / transcript text
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ bySeries: index("meetings_series_idx").on(t.organizationId, t.seriesId) }));

export const meetingAgendaItems = pgTable("meeting_agenda_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id),
  position: integer("position").default(0).notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  presenterUserId: uuid("presenter_user_id").references(() => users.id),
}, (t) => ({ byMeeting: index("agenda_meeting_idx").on(t.meetingId) }));

export const meetingDecisions = pgTable("meeting_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id),
  text: text("text").notNull(),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byMeeting: index("decisions_meeting_idx").on(t.meetingId) }));

export const meetingAttendance = pgTable("meeting_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  status: text("status").default("invited").notNull(),  // invited|attended|absent
}, (t) => ({ byMeeting: index("attendance_meeting_idx").on(t.meetingId, t.userId) }));

export const meetingActions = pgTable("meeting_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  meetingId: uuid("meeting_id").notNull().references(() => meetings.id),
  agendaItemId: uuid("agenda_item_id").references(() => meetingAgendaItems.id),
  title: text("title").notNull(),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id),
  dueDate: text("due_date"),
  status: text("status").default("open").notNull(),     // open|converted
  workItemId: uuid("work_item_id").references(() => workItems.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ byMeeting: index("actions_meeting_idx").on(t.meetingId) }));
