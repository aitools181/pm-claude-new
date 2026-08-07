import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { WorkItemsService } from "../work/work-items.service.js";

@Injectable()
export class MeetingService {
  constructor(@Inject(DB) private readonly db: Database, @Optional() private readonly workItems?: WorkItemsService) {}

  // ---- series ----
  createSeries(organizationId: string, userId: string, input: { name: string; cadence?: string; workspaceId?: string }) {
    return this.db.insert(schema.meetingSeries).values({ organizationId, name: input.name, cadence: input.cadence ?? "adhoc", workspaceId: input.workspaceId ?? null, ownerUserId: userId }).returning().then((r) => r[0]);
  }
  listSeries(organizationId: string) { return this.db.select().from(schema.meetingSeries).where(eq(schema.meetingSeries.organizationId, organizationId)).orderBy(schema.meetingSeries.createdAt); }

  // ---- meetings ----
  createMeeting(organizationId: string, input: { title: string; seriesId?: string; scheduledAt?: string }) {
    return this.db.insert(schema.meetings).values({ organizationId, title: input.title, seriesId: input.seriesId ?? null, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null }).returning().then((r) => r[0]);
  }
  listMeetings(organizationId: string, seriesId?: string) {
    const conds = [eq(schema.meetings.organizationId, organizationId)];
    if (seriesId) conds.push(eq(schema.meetings.seriesId, seriesId));
    return this.db.select().from(schema.meetings).where(and(...conds)).orderBy(asc(schema.meetings.scheduledAt));
  }
  private async loadMeeting(organizationId: string, id: string) {
    const [m] = await this.db.select().from(schema.meetings).where(and(eq(schema.meetings.id, id), eq(schema.meetings.organizationId, organizationId))).limit(1);
    if (!m) throw new AppError("NOT_FOUND", "Meeting not found");
    return m;
  }
  async get(organizationId: string, id: string) {
    const meeting = await this.loadMeeting(organizationId, id);
    const [agenda, decisions, attendance, actions] = await Promise.all([
      this.db.select().from(schema.meetingAgendaItems).where(eq(schema.meetingAgendaItems.meetingId, id)).orderBy(asc(schema.meetingAgendaItems.position)),
      this.db.select().from(schema.meetingDecisions).where(eq(schema.meetingDecisions.meetingId, id)).orderBy(asc(schema.meetingDecisions.at)),
      this.db.select().from(schema.meetingAttendance).where(eq(schema.meetingAttendance.meetingId, id)),
      this.db.select().from(schema.meetingActions).where(eq(schema.meetingActions.meetingId, id)).orderBy(asc(schema.meetingActions.createdAt)),
    ]);
    return { meeting, agenda, decisions, attendance, actions };
  }
  async setStatus(organizationId: string, id: string, status: string) {
    await this.loadMeeting(organizationId, id);
    const [row] = await this.db.update(schema.meetings).set({ status }).where(eq(schema.meetings.id, id)).returning();
    return row;
  }
  async updateNotes(organizationId: string, id: string, notes: string) {
    await this.loadMeeting(organizationId, id);
    const [row] = await this.db.update(schema.meetings).set({ notes }).where(eq(schema.meetings.id, id)).returning();
    return row;
  }

  // ---- agenda / decisions / attendance ----
  async addAgendaItem(organizationId: string, meetingId: string, input: { title: string; notes?: string; presenterUserId?: string; position?: number }) {
    await this.loadMeeting(organizationId, meetingId);
    return this.db.insert(schema.meetingAgendaItems).values({ organizationId, meetingId, title: input.title, notes: input.notes ?? null, presenterUserId: input.presenterUserId ?? null, position: input.position ?? 0 }).returning().then((r) => r[0]);
  }
  async addDecision(organizationId: string, meetingId: string, userId: string, text: string) {
    await this.loadMeeting(organizationId, meetingId);
    return this.db.insert(schema.meetingDecisions).values({ organizationId, meetingId, text, decidedByUserId: userId }).returning().then((r) => r[0]);
  }
  async setAttendance(organizationId: string, meetingId: string, userId: string, status: string) {
    await this.loadMeeting(organizationId, meetingId);
    const [existing] = await this.db.select().from(schema.meetingAttendance).where(and(eq(schema.meetingAttendance.meetingId, meetingId), eq(schema.meetingAttendance.userId, userId))).limit(1);
    if (existing) { const [row] = await this.db.update(schema.meetingAttendance).set({ status }).where(eq(schema.meetingAttendance.id, existing.id)).returning(); return row; }
    return this.db.insert(schema.meetingAttendance).values({ organizationId, meetingId, userId, status }).returning().then((r) => r[0]);
  }

  // ---- actions ----
  async addAction(organizationId: string, meetingId: string, input: { title: string; assigneeUserId?: string; dueDate?: string; agendaItemId?: string }) {
    await this.loadMeeting(organizationId, meetingId);
    return this.db.insert(schema.meetingActions).values({ organizationId, meetingId, title: input.title, assigneeUserId: input.assigneeUserId ?? null, dueDate: input.dueDate ?? null, agendaItemId: input.agendaItemId ?? null }).returning().then((r) => r[0]);
  }

  /** Convert an action item into a linked work item (carries title, assignee and due date). */
  async convertAction(organizationId: string, userId: string, actionId: string, input: { projectId: string }) {
    if (!this.workItems) throw new AppError("VALIDATION", "Work item service unavailable");
    const [action] = await this.db.select().from(schema.meetingActions).where(and(eq(schema.meetingActions.id, actionId), eq(schema.meetingActions.organizationId, organizationId))).limit(1);
    if (!action) throw new AppError("NOT_FOUND", "Action not found");
    if (action.status === "converted") throw new AppError("CONFLICT", "Action already converted");
    const item = await this.workItems.create(organizationId, userId, { projectId: input.projectId, title: action.title, primaryOwnerUserId: action.assigneeUserId ?? undefined });
    if (action.dueDate) await this.db.update(schema.workItems).set({ dueDate: action.dueDate }).where(eq(schema.workItems.id, item.id));
    await this.db.update(schema.meetingActions).set({ status: "converted", workItemId: item.id }).where(eq(schema.meetingActions.id, actionId));
    return { action: { id: action.id, status: "converted", workItemId: item.id }, workItem: item };
  }
}
