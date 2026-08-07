import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { rankBetween } from "../work/rank.js";
import { sha256 } from "../common/crypto.js";

@Injectable()
export class ProductivityService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService, private readonly items: WorkItemsService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "productivity"); }

  async home(org: string, userId: string) {
    await this.enabled(org);
    const now = new Date(); const week = new Date(now.getTime() + 7 * 86_400_000);
    const [notes, reminders, maps, devices, assigned] = await Promise.all([
      this.db.select().from(schema.personalNotes).where(and(eq(schema.personalNotes.organizationId, org), eq(schema.personalNotes.userId, userId), or(isNull(schema.personalNotes.retentionUntil), gte(schema.personalNotes.retentionUntil, now)))).limit(50),
      this.db.select().from(schema.reminders).where(and(eq(schema.reminders.organizationId, org), or(eq(schema.reminders.userId, userId), eq(schema.reminders.delegatedToUserId, userId)), eq(schema.reminders.status, "open"), lte(schema.reminders.dueAt, week))).limit(100),
      this.db.select().from(schema.mindMaps).where(and(eq(schema.mindMaps.organizationId, org), or(eq(schema.mindMaps.ownerUserId, userId), eq(schema.mindMaps.shared, true)))).limit(50),
      this.db.select().from(schema.deviceRegistrations).where(and(eq(schema.deviceRegistrations.organizationId, org), eq(schema.deviceRegistrations.userId, userId))),
      this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.primaryOwnerUserId, userId), isNull(schema.workItems.deletedAt))).limit(100),
    ]);
    return { notes, reminders, mindMaps: maps, devices, assigned: assigned.filter((i) => i.statusCategory !== "done"), today: reminders.filter((r) => r.dueAt.toDateString() === now.toDateString()), overdue: reminders.filter((r) => r.dueAt < now) };
  }

  async createNote(org: string, userId: string, input: { title: string; body?: string; pinned?: boolean; shared?: boolean; retentionUntil?: string }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.personalNotes).values({ organizationId: org, userId, title: input.title, body: input.body ?? "", pinned: input.pinned ?? false, shared: input.shared ?? false, retentionUntil: input.retentionUntil ? new Date(input.retentionUntil) : null }).returning();
    return row;
  }

  async updateNote(org: string, userId: string, id: string, patch: { title?: string; body?: string; pinned?: boolean; shared?: boolean }) {
    await this.enabled(org);
    const [row] = await this.db.update(schema.personalNotes).set({ ...patch, updatedAt: new Date() }).where(and(eq(schema.personalNotes.organizationId, org), eq(schema.personalNotes.id, id), eq(schema.personalNotes.userId, userId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Note not found"); return row;
  }

  async noteToTask(org: string, userId: string, id: string, projectId: string, selectedText?: string) {
    await this.enabled(org);
    const [note] = await this.db.select().from(schema.personalNotes).where(and(eq(schema.personalNotes.organizationId, org), eq(schema.personalNotes.id, id), eq(schema.personalNotes.userId, userId))).limit(1);
    if (!note) throw new AppError("NOT_FOUND", "Note not found");
    if (!(await canAccessProject(this.db, org, projectId, userId))) throw new AppError("FORBIDDEN", "No access to project");
    return this.items.create(org, userId, { projectId, title: selectedText?.trim() || note.title, description: selectedText ? `From note ${note.title}\n\n${selectedText}` : note.body });
  }

  async createReminder(org: string, userId: string, input: { title: string; dueAt: string; timezone?: string; recurrence?: string; workItemId?: string; delegatedToUserId?: string }) {
    await this.enabled(org);
    if (input.workItemId && !(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access to work item");
    const [row] = await this.db.insert(schema.reminders).values({ organizationId: org, userId, title: input.title, dueAt: new Date(input.dueAt), timezone: input.timezone ?? "UTC", recurrence: input.recurrence, workItemId: input.workItemId, delegatedToUserId: input.delegatedToUserId }).returning();
    return row;
  }

  async reminderAction(org: string, userId: string, id: string, input: { action: "snooze" | "complete" | "reopen"; until?: string }) {
    await this.enabled(org);
    const [reminder] = await this.db.select().from(schema.reminders).where(and(eq(schema.reminders.organizationId, org), eq(schema.reminders.id, id), or(eq(schema.reminders.userId, userId), eq(schema.reminders.delegatedToUserId, userId)))).limit(1);
    if (!reminder) throw new AppError("NOT_FOUND", "Reminder not found");
    let dueAt = reminder.dueAt, snoozedUntil = reminder.snoozedUntil, status = reminder.status;
    if (input.action === "snooze") { if (!input.until) throw new AppError("VALIDATION", "Snooze time is required"); snoozedUntil = new Date(input.until); dueAt = snoozedUntil; }
    if (input.action === "reopen") status = "open";
    if (input.action === "complete") {
      status = "completed";
      if (reminder.recurrence) {
        const next = this.nextOccurrence(reminder.dueAt, reminder.recurrence);
        await this.db.insert(schema.reminders).values({ organizationId: org, userId: reminder.userId, workItemId: reminder.workItemId, title: reminder.title, dueAt: next, timezone: reminder.timezone, recurrence: reminder.recurrence, delegatedToUserId: reminder.delegatedToUserId });
      }
    }
    const [row] = await this.db.update(schema.reminders).set({ dueAt, snoozedUntil, status }).where(eq(schema.reminders.id, id)).returning();
    return row;
  }

  private nextOccurrence(from: Date, recurrence: string) {
    const d = new Date(from); const match = /^(daily|weekly|monthly)(?::(\d+))?$/.exec(recurrence); const n = Number(match?.[2] ?? 1);
    if (match?.[1] === "weekly") d.setUTCDate(d.getUTCDate() + 7 * n); else if (match?.[1] === "monthly") d.setUTCMonth(d.getUTCMonth() + n); else d.setUTCDate(d.getUTCDate() + n);
    return d;
  }

  async reminderToTask(org: string, userId: string, id: string, projectId: string) {
    await this.enabled(org);
    const [reminder] = await this.db.select().from(schema.reminders).where(and(eq(schema.reminders.organizationId, org), eq(schema.reminders.id, id), eq(schema.reminders.userId, userId))).limit(1);
    if (!reminder) throw new AppError("NOT_FOUND", "Reminder not found");
    const item = await this.items.create(org, userId, { projectId, title: reminder.title });
    await this.db.update(schema.workItems).set({ dueDate: reminder.dueAt.toISOString().slice(0, 10) }).where(eq(schema.workItems.id, item.id));
    await this.db.update(schema.reminders).set({ workItemId: item.id }).where(eq(schema.reminders.id, id));
    return item;
  }

  async createMindMap(org: string, userId: string, input: { name: string; projectId?: string; sourceType?: string; sourceId?: string; shared?: boolean; generateFromProject?: boolean }) {
    await this.enabled(org);
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    const [map] = await this.db.insert(schema.mindMaps).values({ organizationId: org, ownerUserId: userId, projectId: input.projectId, name: input.name, sourceType: input.sourceType ?? (input.generateFromProject ? "project" : "free"), sourceId: input.sourceId, shared: input.shared ?? false }).returning();
    if (input.generateFromProject && input.projectId) {
      const work = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.owningProjectId, input.projectId), isNull(schema.workItems.deletedAt))).limit(500);
      const rootByItem = new Map<string, string>();
      for (let i = 0; i < work.length; i++) {
        const item = work[i]; const parentNodeId = item.parentId ? rootByItem.get(item.parentId) : undefined;
        const [node] = await this.db.insert(schema.mindMapNodes).values({ organizationId: org, mindMapId: map.id, parentNodeId, workItemId: item.id, label: item.title, x: (i % 6) * 220, y: Math.floor(i / 6) * 120, rank: rankBetween(null, null) }).returning();
        rootByItem.set(item.id, node.id);
      }
    }
    return this.mindMap(org, userId, map.id);
  }

  async mindMap(org: string, userId: string, id: string) {
    await this.enabled(org);
    const [map] = await this.db.select().from(schema.mindMaps).where(and(eq(schema.mindMaps.organizationId, org), eq(schema.mindMaps.id, id), or(eq(schema.mindMaps.ownerUserId, userId), eq(schema.mindMaps.shared, true)))).limit(1);
    if (!map) throw new AppError("NOT_FOUND", "Mind map not found");
    const nodes = await this.db.select().from(schema.mindMapNodes).where(and(eq(schema.mindMapNodes.organizationId, org), eq(schema.mindMapNodes.mindMapId, id)));
    const visible = [];
    for (const n of nodes) if (!n.workItemId || await canAccessWorkItem(this.db, org, n.workItemId, userId)) visible.push(n);
    return { map, nodes: visible };
  }

  async addMindMapNode(org: string, userId: string, mapId: string, input: { parentNodeId?: string; workItemId?: string; label: string; x?: number; y?: number; style?: Record<string, unknown> }) {
    await this.mindMap(org, userId, mapId);
    if (input.workItemId && !(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access");
    const [row] = await this.db.insert(schema.mindMapNodes).values({ organizationId: org, mindMapId: mapId, parentNodeId: input.parentNodeId, workItemId: input.workItemId, label: input.label, x: input.x ?? 0, y: input.y ?? 0, style: input.style ?? {}, rank: rankBetween(null, null) }).returning();
    return row;
  }

  async nodeToTask(org: string, userId: string, nodeId: string, projectId: string) {
    await this.enabled(org);
    const [node] = await this.db.select().from(schema.mindMapNodes).where(and(eq(schema.mindMapNodes.organizationId, org), eq(schema.mindMapNodes.id, nodeId))).limit(1);
    if (!node) throw new AppError("NOT_FOUND", "Node not found");
    await this.mindMap(org, userId, node.mindMapId);
    const item = await this.items.create(org, userId, { projectId, title: node.label });
    await this.db.update(schema.mindMapNodes).set({ workItemId: item.id }).where(eq(schema.mindMapNodes.id, nodeId));
    return item;
  }

  async setLocation(org: string, userId: string, input: { workItemId: string; latitude: number; longitude: number; label?: string; precision?: string; sensitive?: boolean }) {
    await this.enabled(org);
    if (!(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access");
    const existing = await this.db.select().from(schema.locationProjections).where(and(eq(schema.locationProjections.organizationId, org), eq(schema.locationProjections.workItemId, input.workItemId))).limit(1).then((r) => r[0]);
    const values = { organizationId: org, ...input, updatedAt: new Date() };
    if (existing) return (await this.db.update(schema.locationProjections).set(values).where(eq(schema.locationProjections.id, existing.id)).returning())[0];
    return (await this.db.insert(schema.locationProjections).values(values).returning())[0];
  }

  async mapView(org: string, userId: string, input: { minLat?: number; maxLat?: number; minLng?: number; maxLng?: number }) {
    await this.enabled(org);
    const rows = await this.db.select().from(schema.locationProjections).where(and(eq(schema.locationProjections.organizationId, org), input.minLat != null ? gte(schema.locationProjections.latitude, input.minLat) : undefined, input.maxLat != null ? lte(schema.locationProjections.latitude, input.maxLat) : undefined, input.minLng != null ? gte(schema.locationProjections.longitude, input.minLng) : undefined, input.maxLng != null ? lte(schema.locationProjections.longitude, input.maxLng) : undefined)).limit(1000);
    const results = [];
    for (const loc of rows) if (await canAccessWorkItem(this.db, org, loc.workItemId, userId)) results.push(loc.sensitive ? { ...loc, latitude: Math.round(loc.latitude * 10) / 10, longitude: Math.round(loc.longitude * 10) / 10, label: "Restricted location", precision: "approximate" } : loc);
    return { locations: results };
  }

  async capture(org: string, userId: string, input: { targetType: "task" | "idea" | "doc" | "inbox"; targetId?: string; projectId?: string; url: string; title?: string; selectedText?: string; screenshotRef?: string }) {
    await this.enabled(org);
    let targetId = input.targetId;
    if (input.targetType === "task") {
      if (!input.projectId) throw new AppError("VALIDATION", "Project is required for task capture");
      const task = await this.items.create(org, userId, { projectId: input.projectId, title: input.title ?? input.url, description: `${input.selectedText ?? ""}\n\nSource: ${input.url}` }); targetId = task.id;
    }
    const [row] = await this.db.insert(schema.browserCaptures).values({ organizationId: org, userId, targetType: input.targetType, targetId, url: input.url, title: input.title, selectedText: input.selectedText, screenshotRef: input.screenshotRef, status: targetId ? "converted" : "captured" }).returning();
    return row;
  }

  async registerDevice(org: string, userId: string, input: { deviceId: string; platform: string; pushToken?: string; clientVersion?: string }) {
    await this.enabled(org);
    const existing = await this.db.select().from(schema.deviceRegistrations).where(and(eq(schema.deviceRegistrations.organizationId, org), eq(schema.deviceRegistrations.userId, userId), eq(schema.deviceRegistrations.deviceId, input.deviceId))).limit(1).then((r) => r[0]);
    const values = { organizationId: org, userId, deviceId: input.deviceId, platform: input.platform, pushTokenHash: input.pushToken ? sha256(input.pushToken) : null, clientVersion: input.clientVersion, status: "active", lastSeenAt: new Date(), revokedAt: null };
    if (existing) return (await this.db.update(schema.deviceRegistrations).set(values).where(eq(schema.deviceRegistrations.id, existing.id)).returning())[0];
    return (await this.db.insert(schema.deviceRegistrations).values(values).returning())[0];
  }

  async revokeDevice(org: string, userId: string, deviceId: string) {
    await this.enabled(org);
    await this.db.update(schema.deviceRegistrations).set({ status: "revoked", revokedAt: new Date(), pushTokenHash: null }).where(and(eq(schema.deviceRegistrations.organizationId, org), eq(schema.deviceRegistrations.userId, userId), eq(schema.deviceRegistrations.deviceId, deviceId)));
    await this.db.update(schema.offlineQueue).set({ status: "revoked", processedAt: new Date() }).where(and(eq(schema.offlineQueue.organizationId, org), eq(schema.offlineQueue.userId, userId), eq(schema.offlineQueue.deviceId, deviceId), eq(schema.offlineQueue.status, "pending")));
    return { deviceId, revoked: true, cachePurgeRequired: true };
  }

  async queueOffline(org: string, userId: string, input: { deviceId: string; operationKey: string; action: string; payload: Record<string, unknown>; baseVersion?: number }) {
    await this.enabled(org);
    const [device] = await this.db.select().from(schema.deviceRegistrations).where(and(eq(schema.deviceRegistrations.organizationId, org), eq(schema.deviceRegistrations.userId, userId), eq(schema.deviceRegistrations.deviceId, input.deviceId), eq(schema.deviceRegistrations.status, "active"))).limit(1);
    if (!device) throw new AppError("FORBIDDEN", "Device is not active");
    const [row] = await this.db.insert(schema.offlineQueue).values({ organizationId: org, userId, ...input }).onConflictDoNothing().returning();
    return row ?? { operationKey: input.operationKey, duplicate: true };
  }

  async replayOffline(org: string, userId: string, deviceId: string) {
    await this.enabled(org);
    const pending = await this.db.select().from(schema.offlineQueue).where(and(eq(schema.offlineQueue.organizationId, org), eq(schema.offlineQueue.userId, userId), eq(schema.offlineQueue.deviceId, deviceId), eq(schema.offlineQueue.status, "pending")));
    const results = [];
    for (const op of pending) {
      try {
        if (op.action === "work_item.update") {
          const payload = op.payload as any;
          const [current] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, payload.id))).limit(1);
          if (!current || (op.baseVersion != null && current.version !== op.baseVersion)) {
            const conflict = { code: "VERSION_CONFLICT", currentVersion: current?.version, baseVersion: op.baseVersion };
            await this.db.update(schema.offlineQueue).set({ status: "conflict", conflict, processedAt: new Date() }).where(eq(schema.offlineQueue.id, op.id)); results.push({ id: op.id, status: "conflict", conflict }); continue;
          }
          await this.items.update(org, payload.id, userId, current.version, payload.patch ?? {});
        }
        await this.db.update(schema.offlineQueue).set({ status: "completed", processedAt: new Date() }).where(eq(schema.offlineQueue.id, op.id)); results.push({ id: op.id, status: "completed" });
      } catch (error) { const conflict = { code: "REPLAY_FAILED", message: error instanceof Error ? error.message : "Failed" }; await this.db.update(schema.offlineQueue).set({ status: "conflict", conflict, processedAt: new Date() }).where(eq(schema.offlineQueue.id, op.id)); results.push({ id: op.id, status: "conflict", conflict }); }
    }
    return { deviceId, results };
  }
}
