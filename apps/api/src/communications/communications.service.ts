import { Injectable, Inject } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { sha256 } from "../common/crypto.js";
import { IntegrationService } from "../integrations/integration.service.js";

@Injectable()
export class CommunicationsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService, private readonly items: WorkItemsService, private readonly integrations: IntegrationService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "communications"); }

  async overview(org: string, userId: string) {
    await this.enabled(org);
    const [mailboxes, connections, clips, meetings] = await Promise.all([
      this.db.select().from(schema.mailboxes).where(eq(schema.mailboxes.organizationId, org)),
      this.db.select().from(schema.calendarConnections).where(and(eq(schema.calendarConnections.organizationId, org), eq(schema.calendarConnections.userId, userId))),
      this.db.select().from(schema.clips).where(eq(schema.clips.organizationId, org)).limit(100),
      this.db.select().from(schema.meetingCaptures).where(eq(schema.meetingCaptures.organizationId, org)).limit(100),
    ]);
    const visibleMailboxes = [];
    for (const m of mailboxes) if (!m.projectId || await canAccessProject(this.db, org, m.projectId, userId)) visibleMailboxes.push(m);
    return { mailboxes: visibleMailboxes, calendarConnections: connections, clips, meetings };
  }

  async createMailbox(org: string, userId: string, input: { integrationId?: string; projectId?: string; address: string; name: string; routingRules?: Record<string, unknown> }) {
    await this.enabled(org);
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access to project");
    const [row] = await this.db.insert(schema.mailboxes).values({ organizationId: org, integrationId: input.integrationId, projectId: input.projectId, address: input.address.toLowerCase(), name: input.name, routingRules: input.routingRules ?? {}, createdByUserId: userId }).returning();
    return row;
  }

  private verifySignature(secret: string, payload: string, signature: string) {
    const normalized = signature.replace(/^sha256=/, "");
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = Buffer.from(expected, "hex"), b = Buffer.from(normalized, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async receiveSignedEmail(integrationId: string, signature: string, payload: string) {
    const context = await this.integrations.getServerContext(integrationId);
    if (!this.verifySignature(context.secret, payload, signature)) throw new AppError("FORBIDDEN", "Invalid inbound email signature");
    let email: { mailboxId: string; externalMessageId: string; externalThreadId?: string; fromAddress: string; toAddresses: string[]; subject: string; bodyText?: string; attachments?: unknown[]; headers?: Record<string, string>; sentAt?: string; spf?: "pass" | "fail" | "unknown"; dkim?: "pass" | "fail" | "unknown" };
    try { email = JSON.parse(payload) as typeof email; }
    catch { throw new AppError("VALIDATION", "Inbound email payload must be valid JSON"); }
    if (!email.mailboxId || !email.externalMessageId || !email.fromAddress || !Array.isArray(email.toAddresses) || !email.subject) throw new AppError("VALIDATION", "Inbound email payload is incomplete");
    const [mailbox] = await this.db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.organizationId, context.organizationId), eq(schema.mailboxes.id, email.mailboxId), eq(schema.mailboxes.integrationId, integrationId))).limit(1);
    if (!mailbox) throw new AppError("NOT_FOUND", "Mailbox is not connected to this integration");
    return this.receiveEmail(context.organizationId, email);
  }

  async receiveEmail(org: string, input: { mailboxId: string; externalMessageId: string; externalThreadId?: string; fromAddress: string; toAddresses: string[]; subject: string; bodyText?: string; attachments?: unknown[]; headers?: Record<string, string>; sentAt?: string; spf?: "pass" | "fail" | "unknown"; dkim?: "pass" | "fail" | "unknown" }) {
    await this.enabled(org);
    const [mailbox] = await this.db.select().from(schema.mailboxes).where(and(eq(schema.mailboxes.organizationId, org), eq(schema.mailboxes.id, input.mailboxId), eq(schema.mailboxes.status, "active"))).limit(1);
    if (!mailbox) throw new AppError("NOT_FOUND", "Mailbox not found");
    const duplicate = await this.db.select().from(schema.emailMessages).where(and(eq(schema.emailMessages.organizationId, org), eq(schema.emailMessages.externalMessageId, input.externalMessageId))).limit(1).then((r) => r[0]);
    if (duplicate) return { duplicate: true, message: duplicate };
    const authenticity = input.spf === "pass" && input.dkim === "pass" ? "verified" : input.spf === "fail" || input.dkim === "fail" ? "failed" : "unknown";
    if (authenticity === "failed") throw new AppError("FORBIDDEN", "Email authenticity validation failed");
    let workItemId: string | null = null;
    const key = input.subject.match(/[A-Z][A-Z0-9]+-\d+/)?.[0];
    if (key) {
      const [item] = await this.db.select({ id: schema.workItems.id }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.key, key), isNull(schema.workItems.deletedAt))).limit(1);
      workItemId = item?.id ?? null;
    }
    let thread = input.externalThreadId ? await this.db.select().from(schema.emailThreads).where(and(eq(schema.emailThreads.organizationId, org), eq(schema.emailThreads.mailboxId, mailbox.id), eq(schema.emailThreads.externalThreadId, input.externalThreadId))).limit(1).then((r) => r[0]) : undefined;
    if (!thread) {
      if (!workItemId && mailbox.projectId) {
        const created = await this.items.create(org, mailbox.createdByUserId, { projectId: mailbox.projectId, title: input.subject, description: input.bodyText, typeKey: "request" });
        workItemId = created.id;
      }
      [thread] = await this.db.insert(schema.emailThreads).values({ organizationId: org, mailboxId: mailbox.id, workItemId, subject: input.subject, externalThreadId: input.externalThreadId, participants: [input.fromAddress, ...input.toAddresses] }).returning();
    }
    const [message] = await this.db.insert(schema.emailMessages).values({ organizationId: org, threadId: thread.id, direction: "inbound", externalMessageId: input.externalMessageId, fromAddress: input.fromAddress, toAddresses: input.toAddresses, bodyText: input.bodyText, attachments: input.attachments ?? [], authenticity, rawHeaders: { ...input.headers, redacted: true }, sentAt: input.sentAt ? new Date(input.sentAt) : new Date() }).returning();
    if (thread.workItemId) await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId: thread.workItemId, actorUserId: null, action: "email.received", data: input.subject });
    return { duplicate: false, thread, message, routedWorkItemId: thread.workItemId };
  }

  async thread(org: string, userId: string, id: string) {
    await this.enabled(org);
    const [thread] = await this.db.select().from(schema.emailThreads).where(and(eq(schema.emailThreads.organizationId, org), eq(schema.emailThreads.id, id))).limit(1);
    if (!thread || (thread.workItemId && !(await canAccessWorkItem(this.db, org, thread.workItemId, userId)))) throw new AppError("NOT_FOUND", "Email thread not found");
    const messages = await this.db.select().from(schema.emailMessages).where(and(eq(schema.emailMessages.organizationId, org), eq(schema.emailMessages.threadId, id)));
    return { thread, messages: messages.map((m) => ({ ...m, rawHeaders: undefined })) };
  }

  async reply(org: string, userId: string, id: string, input: { bodyText: string; attachments?: unknown[]; template?: string; signature?: string }) {
    await this.enabled(org);
    const data = await this.thread(org, userId, id);
    const body = [input.template, input.bodyText, input.signature].filter(Boolean).join("\n\n");
    const externalMessageId = `out-${sha256(`${id}:${Date.now()}:${userId}`).slice(0, 24)}`;
    const [message] = await this.db.insert(schema.emailMessages).values({ organizationId: org, threadId: id, direction: "outbound", externalMessageId, fromAddress: "platform", toAddresses: data.thread.participants, bodyText: body, attachments: input.attachments ?? [], authenticity: "internal", deliveryStatus: "queued", sentAt: new Date() }).returning();
    if (data.thread.workItemId) await this.db.insert(schema.activityEvents).values({ organizationId: org, workItemId: data.thread.workItemId, actorUserId: userId, action: "email.reply_queued", data: externalMessageId });
    return { message, audit: { actorUserId: userId, queuedAt: new Date().toISOString() } };
  }

  async connectCalendar(org: string, userId: string, input: { integrationId?: string; provider: "google" | "microsoft" | "caldav"; calendarExternalId: string }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.calendarConnections).values({ organizationId: org, integrationId: input.integrationId, userId, provider: input.provider, calendarExternalId: input.calendarExternalId }).returning();
    return row;
  }

  async syncCalendar(org: string, userId: string, connectionId: string, input: { syncToken?: string; events: Array<{ externalEventId: string; title: string; startAt: string; endAt: string; workItemId?: string; syncVersion?: string; source?: "external" | "platform" }> }) {
    await this.enabled(org);
    const [connection] = await this.db.select().from(schema.calendarConnections).where(and(eq(schema.calendarConnections.organizationId, org), eq(schema.calendarConnections.id, connectionId), eq(schema.calendarConnections.userId, userId), eq(schema.calendarConnections.status, "active"))).limit(1);
    if (!connection) throw new AppError("NOT_FOUND", "Calendar connection not found");
    const [session] = await this.db.insert(schema.communicationSyncSessions).values({ organizationId: org, kind: "calendar", connectionId, cursorBefore: connection.syncToken }).returning();
    let updated = 0; let conflicts = 0;
    for (const event of input.events) {
      if (event.workItemId && !(await canAccessWorkItem(this.db, org, event.workItemId, userId))) continue;
      const existing = await this.db.select().from(schema.calendarEventLinks).where(and(eq(schema.calendarEventLinks.connectionId, connectionId), eq(schema.calendarEventLinks.externalEventId, event.externalEventId))).limit(1).then((r) => r[0]);
      const incomingSource = event.source ?? "external";
      const conflict = existing && existing.syncVersion && event.syncVersion && existing.syncVersion !== event.syncVersion && existing.lastSource !== incomingSource
        ? { existing: { title: existing.title, startAt: existing.startAt, endAt: existing.endAt, version: existing.syncVersion }, incoming: event, resolutionRequired: true }
        : null;
      const values = { organizationId: org, connectionId, workItemId: event.workItemId, externalEventId: event.externalEventId, title: event.title, startAt: new Date(event.startAt), endAt: new Date(event.endAt), syncVersion: event.syncVersion, lastSource: incomingSource, conflict, updatedAt: new Date() };
      if (existing) await this.db.update(schema.calendarEventLinks).set(conflict ? { conflict, updatedAt: new Date() } : values).where(eq(schema.calendarEventLinks.id, existing.id)); else await this.db.insert(schema.calendarEventLinks).values(values);
      if (conflict) conflicts++; else updated++;
    }
    const next = input.syncToken ?? String(Date.now());
    await this.db.update(schema.calendarConnections).set({ syncToken: next, lastSyncAt: new Date() }).where(eq(schema.calendarConnections.id, connectionId));
    await this.db.update(schema.communicationSyncSessions).set({ status: conflicts ? "completed_with_conflicts" : "completed", cursorAfter: next, summary: { updated, conflicts }, finishedAt: new Date() }).where(eq(schema.communicationSyncSessions.id, session.id));
    return { sessionId: session.id, updated, conflicts, syncToken: next };
  }

  async resolveCalendarConflict(org: string, userId: string, eventLinkId: string, choice: "external" | "platform", replacement?: { title: string; startAt: string; endAt: string; syncVersion?: string }) {
    await this.enabled(org);
    const [link] = await this.db.select().from(schema.calendarEventLinks).where(and(eq(schema.calendarEventLinks.organizationId, org), eq(schema.calendarEventLinks.id, eventLinkId))).limit(1);
    if (!link || (link.workItemId && !(await canAccessWorkItem(this.db, org, link.workItemId, userId)))) throw new AppError("NOT_FOUND", "Calendar event not found");
    const incoming = (link.conflict as any)?.incoming;
    const selected = choice === "external" ? incoming : replacement;
    if (!selected) throw new AppError("VALIDATION", "Replacement values are required");
    const [row] = await this.db.update(schema.calendarEventLinks).set({ title: selected.title, startAt: new Date(selected.startAt), endAt: new Date(selected.endAt), syncVersion: selected.syncVersion, lastSource: choice, conflict: null, updatedAt: new Date() }).where(eq(schema.calendarEventLinks.id, eventLinkId)).returning();
    return row;
  }

  async createClip(org: string, userId: string, input: { projectId?: string; workItemId?: string; title: string; mediaRef: string; durationSeconds?: number; consent: Record<string, unknown>; retentionUntil?: string }) {
    await this.enabled(org);
    if (!Object.keys(input.consent).length) throw new AppError("VALIDATION", "Visible recording consent evidence is required");
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    if (input.workItemId && !(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access");
    const [row] = await this.db.insert(schema.clips).values({ organizationId: org, projectId: input.projectId, workItemId: input.workItemId, title: input.title, mediaRef: input.mediaRef, durationSeconds: input.durationSeconds ?? 0, consent: input.consent, retentionUntil: input.retentionUntil ? new Date(input.retentionUntil) : null, createdByUserId: userId }).returning();
    return row;
  }

  async addTranscript(org: string, clipId: string, input: { language?: string; segments: unknown[]; summary?: string; decisions?: unknown[]; proposedActions?: Array<{ title: string; ownerUserId?: string; dueDate?: string }> }) {
    await this.enabled(org);
    const [clip] = await this.db.select().from(schema.clips).where(and(eq(schema.clips.organizationId, org), eq(schema.clips.id, clipId))).limit(1);
    if (!clip) throw new AppError("NOT_FOUND", "Clip not found");
    const [row] = await this.db.insert(schema.transcripts).values({ organizationId: org, clipId, language: input.language ?? "en", segments: input.segments, summary: input.summary, decisions: input.decisions ?? [], proposedActions: input.proposedActions ?? [] }).returning();
    return row;
  }

  async createMeetingCapture(org: string, userId: string, input: { projectId?: string; title: string; startAt?: string; attendees?: unknown[]; transcriptId?: string; summary?: string }) {
    await this.enabled(org);
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    const [row] = await this.db.insert(schema.meetingCaptures).values({ organizationId: org, projectId: input.projectId, title: input.title, startAt: input.startAt ? new Date(input.startAt) : null, attendees: input.attendees ?? [], transcriptId: input.transcriptId, summary: input.summary, createdByUserId: userId }).returning();
    return row;
  }

  async reviewActions(org: string, userId: string, meetingId: string, input: { actions: Array<{ title: string; projectId: string; ownerUserId?: string; dueDate?: string; approved: boolean }> }) {
    await this.enabled(org);
    const [meeting] = await this.db.select().from(schema.meetingCaptures).where(and(eq(schema.meetingCaptures.organizationId, org), eq(schema.meetingCaptures.id, meetingId))).limit(1);
    if (!meeting) throw new AppError("NOT_FOUND", "Meeting capture not found");
    const created = [];
    for (const action of input.actions.filter((a) => a.approved)) {
      if (!(await canAccessProject(this.db, org, action.projectId, userId))) throw new AppError("FORBIDDEN", "No access to action project");
      const item = await this.items.create(org, userId, { projectId: action.projectId, title: action.title, primaryOwnerUserId: action.ownerUserId });
      if (action.dueDate) await this.db.update(schema.workItems).set({ dueDate: action.dueDate }).where(eq(schema.workItems.id, item.id));
      created.push(item);
    }
    await this.db.update(schema.meetingCaptures).set({ actionReviewStatus: "reviewed" }).where(eq(schema.meetingCaptures.id, meetingId));
    return { meetingId, created };
  }
}
