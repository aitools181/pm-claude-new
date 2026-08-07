import { Injectable, Inject } from "@nestjs/common";
import { and, eq, ilike, inArray, isNull, isNotNull, lte, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { WorkItemsService } from "../work/work-items.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { rankBetween } from "../work/rank.js";
import { sha256 } from "../common/crypto.js";
import { businessMinutesBetween, breachAt, type BusinessCalendar } from "./sla-engine.js";

@Injectable()
export class ServiceManagementService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService, private readonly items: WorkItemsService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "service_management"); }

  async overview(org: string, userId: string) {
    await this.enabled(org);
    const [projects, incidents, changes, alerts, schedules, schemas] = await Promise.all([
      this.db.select().from(schema.serviceProjects).where(eq(schema.serviceProjects.organizationId, org)),
      this.db.select().from(schema.incidents).where(eq(schema.incidents.organizationId, org)),
      this.db.select().from(schema.serviceChanges).where(eq(schema.serviceChanges.organizationId, org)),
      this.db.select().from(schema.serviceAlerts).where(eq(schema.serviceAlerts.organizationId, org)),
      this.db.select().from(schema.onCallSchedules).where(eq(schema.onCallSchedules.organizationId, org)),
      this.db.select().from(schema.assetSchemas).where(eq(schema.assetSchemas.organizationId, org)),
    ]);
    const visibleProjects = [];
    for (const p of projects) if (await canAccessProject(this.db, org, p.projectId, userId)) visibleProjects.push(p);
    return { projects: visibleProjects, incidents, changes, alerts, onCallSchedules: schedules, assetSchemas: schemas, metrics: { openIncidents: incidents.filter((i) => i.status !== "resolved").length, openChanges: changes.filter((c) => !["completed", "cancelled"].includes(c.status)).length, openAlerts: alerts.filter((a) => a.status === "open").length } };
  }

  async createServiceProject(org: string, userId: string, input: { projectId: string; key: string; name: string; portalEnabled?: boolean; customerAccess?: string }) {
    await this.enabled(org);
    if (!(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access to underlying project");
    const [row] = await this.db.insert(schema.serviceProjects).values({ organizationId: org, projectId: input.projectId, key: input.key.toUpperCase(), name: input.name, portalEnabled: input.portalEnabled ?? true, customerAccess: input.customerAccess ?? "invited" }).returning();
    return row;
  }

  async createRequestType(org: string, serviceProjectId: string, input: { name: string; description?: string; workItemTypeKey?: string; formSchema?: unknown[]; defaultPriority?: string }) {
    await this.enabled(org);
    const [sp] = await this.db.select().from(schema.serviceProjects).where(and(eq(schema.serviceProjects.organizationId, org), eq(schema.serviceProjects.id, serviceProjectId))).limit(1);
    if (!sp) throw new AppError("NOT_FOUND", "Service project not found");
    const [row] = await this.db.insert(schema.requestTypes).values({ organizationId: org, serviceProjectId, name: input.name, description: input.description, workItemTypeKey: input.workItemTypeKey ?? "request", formSchema: input.formSchema ?? [], defaultPriority: input.defaultPriority ?? "normal" }).returning();
    return row;
  }

  async catalogue(org: string) {
    await this.enabled(org);
    const projects = await this.db.select().from(schema.serviceProjects).where(and(eq(schema.serviceProjects.organizationId, org), eq(schema.serviceProjects.portalEnabled, true)));
    const requestTypes = await this.db.select().from(schema.requestTypes).where(and(eq(schema.requestTypes.organizationId, org), eq(schema.requestTypes.active, true)));
    return projects.map((p) => ({ ...p, requestTypes: requestTypes.filter((r) => r.serviceProjectId === p.id) }));
  }

  async submitRequest(org: string, userId: string, requestTypeId: string, input: { title: string; description?: string; priority?: string }) {
    await this.enabled(org);
    const [rt] = await this.db.select().from(schema.requestTypes).where(and(eq(schema.requestTypes.organizationId, org), eq(schema.requestTypes.id, requestTypeId), eq(schema.requestTypes.active, true))).limit(1);
    if (!rt) throw new AppError("NOT_FOUND", "Request type not found");
    const [sp] = await this.db.select().from(schema.serviceProjects).where(and(eq(schema.serviceProjects.organizationId, org), eq(schema.serviceProjects.id, rt.serviceProjectId))).limit(1);
    if (!sp) throw new AppError("NOT_FOUND", "Service project not found");
    const item = await this.items.create(org, userId, { projectId: sp.projectId, title: input.title, description: input.description, priority: input.priority ?? rt.defaultPriority, typeKey: rt.workItemTypeKey });
    const definitions = await this.db.select().from(schema.slaDefinitions).where(and(eq(schema.slaDefinitions.organizationId, org), eq(schema.slaDefinitions.serviceProjectId, sp.id), eq(schema.slaDefinitions.active, true)));
    for (const def of definitions) await this.startSla(org, item.id, def.id, new Date());
    return item;
  }

  async createQueue(org: string, userId: string, serviceProjectId: string, input: { name: string; wql: string }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.serviceQueues).values({ organizationId: org, serviceProjectId, name: input.name, wql: input.wql, rank: rankBetween(null, null), createdByUserId: userId }).returning();
    return row;
  }

  async queueItems(org: string, userId: string, queueId: string) {
    await this.enabled(org);
    const [queue] = await this.db.select().from(schema.serviceQueues).where(and(eq(schema.serviceQueues.organizationId, org), eq(schema.serviceQueues.id, queueId))).limit(1);
    if (!queue) throw new AppError("NOT_FOUND", "Queue not found");
    const [sp] = await this.db.select().from(schema.serviceProjects).where(eq(schema.serviceProjects.id, queue.serviceProjectId)).limit(1);
    if (!sp || !(await canAccessProject(this.db, org, sp.projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    const words = queue.wql.toLowerCase();
    const status = /status\s*=\s*([\w -]+)/i.exec(queue.wql)?.[1]?.trim();
    const rows = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.owningProjectId, sp.projectId), isNull(schema.workItems.deletedAt), status ? ilike(schema.workItems.status, status) : undefined, words.includes("overdue") ? and(isNotNull(schema.workItems.dueDate), lte(schema.workItems.dueDate, new Date().toISOString().slice(0, 10))) : undefined)).limit(500);
    return rows;
  }

  async createSla(org: string, serviceProjectId: string, input: { name: string; metric: "first_response" | "resolution" | "custom"; targetMinutes: number; startCondition?: Record<string, unknown>; pauseCondition?: Record<string, unknown>; stopCondition?: Record<string, unknown>; calendar?: BusinessCalendar }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.slaDefinitions).values({ organizationId: org, serviceProjectId, name: input.name, metric: input.metric, targetMinutes: input.targetMinutes, startCondition: input.startCondition ?? {}, pauseCondition: input.pauseCondition ?? {}, stopCondition: input.stopCondition ?? {}, calendar: input.calendar ?? { timezone: "UTC", weekdays: [1,2,3,4,5], startHour: 9, endHour: 17 } }).returning();
    return row;
  }

  private async startSla(org: string, workItemId: string, definitionId: string, startedAt: Date) {
    const [def] = await this.db.select().from(schema.slaDefinitions).where(and(eq(schema.slaDefinitions.organizationId, org), eq(schema.slaDefinitions.id, definitionId))).limit(1);
    if (!def) throw new AppError("NOT_FOUND", "SLA definition not found");
    const breach = breachAt(startedAt, def.targetMinutes, def.calendar as BusinessCalendar);
    await this.db.insert(schema.slaClocks).values({ organizationId: org, workItemId, slaDefinitionId: definitionId, startedAt, breachAt: breach, history: [{ at: startedAt.toISOString(), action: "started", definitionVersion: def.version }] }).onConflictDoNothing();
  }

  async updateSlaClock(org: string, userId: string, clockId: string, action: "pause" | "resume" | "stop" | "refresh") {
    await this.enabled(org);
    const [clock] = await this.db.select().from(schema.slaClocks).where(and(eq(schema.slaClocks.organizationId, org), eq(schema.slaClocks.id, clockId))).limit(1);
    if (!clock || !(await canAccessWorkItem(this.db, org, clock.workItemId, userId))) throw new AppError("NOT_FOUND", "SLA clock not found");
    const [def] = await this.db.select().from(schema.slaDefinitions).where(eq(schema.slaDefinitions.id, clock.slaDefinitionId)).limit(1);
    const now = new Date(); const history = [...(clock.history as unknown[]), { at: now.toISOString(), action }];
    let status = clock.status, pausedAt = clock.pausedAt, stoppedAt = clock.stoppedAt, pausedMinutes = clock.pausedMinutes;
    if (action === "pause" && status === "running") { status = "paused"; pausedAt = now; }
    if (action === "resume" && status === "paused") { status = "running"; if (pausedAt) pausedMinutes += Math.floor((now.getTime() - pausedAt.getTime()) / 60_000); pausedAt = null; }
    if (action === "stop") { status = "stopped"; stoppedAt = now; }
    const end = stoppedAt ?? now;
    const elapsedMinutes = Math.max(0, businessMinutesBetween(clock.startedAt, end, (def?.calendar ?? {}) as BusinessCalendar) - pausedMinutes);
    const [row] = await this.db.update(schema.slaClocks).set({ status, pausedAt, stoppedAt, elapsedMinutes, pausedMinutes, history }).where(eq(schema.slaClocks.id, clockId)).returning();
    return { ...row, breached: elapsedMinutes > (def?.targetMinutes ?? 0), remainingMinutes: Math.max(0, (def?.targetMinutes ?? 0) - elapsedMinutes) };
  }

  async createIncident(org: string, userId: string, input: { workItemId: string; severity?: string; commanderUserId?: string; responders?: string[]; stakeholderMessage?: string }) {
    await this.enabled(org);
    if (!(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access");
    const [row] = await this.db.insert(schema.incidents).values({ organizationId: org, workItemId: input.workItemId, severity: input.severity ?? "sev3", commanderUserId: input.commanderUserId ?? userId, responders: input.responders ?? [], stakeholderMessage: input.stakeholderMessage, timeline: [{ at: new Date().toISOString(), actorUserId: userId, event: "incident_declared" }] }).returning();
    return row;
  }

  async updateIncident(org: string, userId: string, id: string, input: { status?: string; stakeholderMessage?: string; timelineEvent?: string; postIncidentReview?: Record<string, unknown> }) {
    await this.enabled(org);
    const [incident] = await this.db.select().from(schema.incidents).where(and(eq(schema.incidents.organizationId, org), eq(schema.incidents.id, id))).limit(1);
    if (!incident || !(await canAccessWorkItem(this.db, org, incident.workItemId, userId))) throw new AppError("NOT_FOUND", "Incident not found");
    const timeline = input.timelineEvent ? [...(incident.timeline as unknown[]), { at: new Date().toISOString(), actorUserId: userId, event: input.timelineEvent }] : incident.timeline;
    const [row] = await this.db.update(schema.incidents).set({ status: input.status ?? incident.status, stakeholderMessage: input.stakeholderMessage ?? incident.stakeholderMessage, timeline, postIncidentReview: input.postIncidentReview ?? incident.postIncidentReview, resolvedAt: input.status === "resolved" ? new Date() : incident.resolvedAt }).where(eq(schema.incidents.id, id)).returning();
    return row;
  }

  async createChange(org: string, userId: string, input: { workItemId?: string; title: string; changeType?: string; riskScore?: number; plannedStart?: string; plannedEnd?: string; rollbackPlan?: string; deploymentLinks?: unknown[] }) {
    await this.enabled(org);
    if (input.workItemId && !(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access");
    const [row] = await this.db.insert(schema.serviceChanges).values({ organizationId: org, workItemId: input.workItemId, title: input.title, changeType: input.changeType ?? "normal", riskScore: Math.max(0, Math.min(100, input.riskScore ?? 0)), plannedStart: input.plannedStart ? new Date(input.plannedStart) : null, plannedEnd: input.plannedEnd ? new Date(input.plannedEnd) : null, rollbackPlan: input.rollbackPlan, deploymentLinks: input.deploymentLinks ?? [], createdByUserId: userId }).returning();
    return row;
  }

  async approveChange(org: string, userId: string, id: string, decision: "approve" | "reject", reason?: string) {
    await this.enabled(org);
    const [change] = await this.db.select().from(schema.serviceChanges).where(and(eq(schema.serviceChanges.organizationId, org), eq(schema.serviceChanges.id, id))).limit(1);
    if (!change) throw new AppError("NOT_FOUND", "Change not found");
    const approvals = [...(change.cabApprovals as unknown[]), { userId, decision, reason, at: new Date().toISOString() }];
    const [row] = await this.db.update(schema.serviceChanges).set({ cabApprovals: approvals, status: decision === "approve" ? "approved" : "rejected" }).where(eq(schema.serviceChanges.id, id)).returning();
    return row;
  }

  async ingestAlert(org: string, input: { source: string; externalId: string; title: string; severity: string; fingerprint?: string; raw?: Record<string, unknown> }) {
    await this.enabled(org);
    const fingerprint = input.fingerprint ?? sha256(`${input.source}:${input.title}:${input.severity}`);
    const [byExternal] = await this.db.select().from(schema.serviceAlerts).where(and(eq(schema.serviceAlerts.organizationId, org), eq(schema.serviceAlerts.source, input.source), eq(schema.serviceAlerts.externalId, input.externalId))).limit(1);
    if (byExternal) {
      const [row] = await this.db.update(schema.serviceAlerts).set({ occurrences: byExternal.occurrences + 1, lastSeenAt: new Date(), raw: input.raw ?? byExternal.raw }).where(eq(schema.serviceAlerts.id, byExternal.id)).returning(); return { alert: row, deduplicated: true };
    }
    const [similar] = await this.db.select().from(schema.serviceAlerts).where(and(eq(schema.serviceAlerts.organizationId, org), eq(schema.serviceAlerts.fingerprint, fingerprint), eq(schema.serviceAlerts.status, "open"))).limit(1);
    if (similar) { const [row] = await this.db.update(schema.serviceAlerts).set({ occurrences: similar.occurrences + 1, lastSeenAt: new Date() }).where(eq(schema.serviceAlerts.id, similar.id)).returning(); return { alert: row, deduplicated: true }; }
    const [row] = await this.db.insert(schema.serviceAlerts).values({ organizationId: org, source: input.source, externalId: input.externalId, fingerprint, title: input.title, severity: input.severity, raw: input.raw ?? {} }).returning();
    return { alert: row, deduplicated: false };
  }

  async createOnCall(org: string, input: { name: string; timezone?: string; rotations: unknown[]; escalationPolicy?: unknown[] }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.onCallSchedules).values({ organizationId: org, name: input.name, timezone: input.timezone ?? "UTC", rotations: input.rotations, escalationPolicy: input.escalationPolicy ?? [] }).returning();
    return row;
  }

  async currentOnCall(org: string, id: string, at = new Date()) {
    await this.enabled(org);
    const [schedule] = await this.db.select().from(schema.onCallSchedules).where(and(eq(schema.onCallSchedules.organizationId, org), eq(schema.onCallSchedules.id, id))).limit(1);
    if (!schedule) throw new AppError("NOT_FOUND", "On-call schedule not found");
    const rotations = schedule.rotations as Array<{ userIds?: string[]; startsAt?: string; intervalHours?: number }>;
    const rotation = rotations[0];
    if (!rotation?.userIds?.length) return { scheduleId: id, userId: null };
    const start = new Date(rotation.startsAt ?? schedule.createdAt).getTime(); const interval = Math.max(1, rotation.intervalHours ?? 168) * 3_600_000;
    const index = Math.floor(Math.max(0, at.getTime() - start) / interval) % rotation.userIds.length;
    return { scheduleId: id, userId: rotation.userIds[index], at: at.toISOString(), escalationPolicy: schedule.escalationPolicy };
  }

  async createAssetSchema(org: string, input: { name: string; objectTypes?: unknown[]; fieldDefinitions?: unknown[] }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.assetSchemas).values({ organizationId: org, name: input.name, objectTypes: input.objectTypes ?? [], fieldDefinitions: input.fieldDefinitions ?? [] }).returning();
    return row;
  }

  async upsertAsset(org: string, input: { schemaId: string; objectType: string; key: string; name: string; status?: string; attributes?: Record<string, unknown>; sensitive?: boolean }) {
    await this.enabled(org);
    const existing = await this.db.select().from(schema.configurationItems).where(and(eq(schema.configurationItems.organizationId, org), eq(schema.configurationItems.schemaId, input.schemaId), eq(schema.configurationItems.key, input.key))).limit(1).then((r) => r[0]);
    const values = { organizationId: org, schemaId: input.schemaId, objectType: input.objectType, key: input.key, name: input.name, status: input.status ?? "active", attributes: input.attributes ?? {}, sensitive: input.sensitive ?? false, updatedAt: new Date() };
    if (existing) return (await this.db.update(schema.configurationItems).set(values).where(eq(schema.configurationItems.id, existing.id)).returning())[0];
    return (await this.db.insert(schema.configurationItems).values(values).returning())[0];
  }

  async relateAssets(org: string, input: { fromItemId: string; toItemId: string; relationType: string }) {
    await this.enabled(org);
    const [row] = await this.db.insert(schema.serviceRelations).values({ organizationId: org, ...input }).onConflictDoNothing().returning();
    return row ?? input;
  }

  async impact(org: string, userId: string, assetId: string) {
    await this.enabled(org);
    const items = await this.db.select().from(schema.configurationItems).where(eq(schema.configurationItems.organizationId, org));
    const byId = new Map(items.map((i) => [i.id, i]));
    const relations = await this.db.select().from(schema.serviceRelations).where(eq(schema.serviceRelations.organizationId, org));
    const seen = new Set<string>(); const queue = [assetId]; const nodes: unknown[] = []; const edges: unknown[] = [];
    while (queue.length && seen.size < 1000) {
      const id = queue.shift()!; if (seen.has(id)) continue; seen.add(id);
      const asset = byId.get(id); if (!asset) continue;
      nodes.push(asset.sensitive ? { id: asset.id, key: asset.key, name: "Restricted configuration item", sensitive: true } : asset);
      for (const rel of relations.filter((r) => r.fromItemId === id || r.toItemId === id)) { edges.push(rel); queue.push(rel.fromItemId === id ? rel.toItemId : rel.fromItemId); }
    }
    return { root: assetId, nodes, edges };
  }
}
