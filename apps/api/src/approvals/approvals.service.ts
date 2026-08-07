import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

type StageSpec = { name: string; rule: "any" | "all"; approverUserIds: string[]; dueHours?: number };

@Injectable()
export class ApprovalsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  private event(tx: any, organizationId: string, requestId: string, type: string, actorUserId?: string, data?: string) {
    return tx.insert(schema.approvalEvents).values({ organizationId, requestId, type, actorUserId: actorUserId ?? null, data: data ?? null });
  }

  // ---- definitions ----
  createDefinition(organizationId: string, userId: string, input: { name: string; mode?: "sequential" | "parallel"; stages: StageSpec[]; lockedFields?: string[]; reapprovalPolicy?: "none" | "on_locked_change"; escalationUserId?: string }) {
    if (!input.stages?.length) throw new AppError("VALIDATION", "At least one stage is required");
    return this.db.insert(schema.approvalDefinitions).values({
      organizationId, name: input.name, mode: input.mode ?? "sequential", stages: input.stages,
      lockedFields: input.lockedFields ?? [], reapprovalPolicy: input.reapprovalPolicy ?? "none",
      escalationUserId: input.escalationUserId ?? null, createdByUserId: userId,
    }).returning().then((r) => r[0]);
  }
  listDefinitions(organizationId: string) {
    return this.db.select().from(schema.approvalDefinitions).where(eq(schema.approvalDefinitions.organizationId, organizationId));
  }

  // ---- start ----
  async start(organizationId: string, userId: string, input: { workItemId: string; definitionId?: string; mode?: "sequential" | "parallel"; stages?: StageSpec[]; lockedFields?: string[]; reapprovalPolicy?: "none" | "on_locked_change"; escalationUserId?: string }) {
    let mode = input.mode ?? "sequential", stages = input.stages, lockedFields = input.lockedFields ?? [], reapprovalPolicy = input.reapprovalPolicy ?? "none", escalationUserId = input.escalationUserId ?? null;
    if (input.definitionId) {
      const [def] = await this.db.select().from(schema.approvalDefinitions).where(and(eq(schema.approvalDefinitions.id, input.definitionId), eq(schema.approvalDefinitions.organizationId, organizationId))).limit(1);
      if (!def) throw new AppError("NOT_FOUND", "Definition not found");
      mode = def.mode as any; stages = def.stages as StageSpec[]; lockedFields = def.lockedFields as string[]; reapprovalPolicy = def.reapprovalPolicy as any; escalationUserId = def.escalationUserId;
    }
    if (!stages?.length) throw new AppError("VALIDATION", "No stages provided");

    return this.db.transaction(async (tx) => {
      const [req] = await tx.insert(schema.approvalRequests).values({
        organizationId, definitionId: input.definitionId ?? null, workItemId: input.workItemId,
        mode, lockedFields, reapprovalPolicy, escalationUserId, currentStageIndex: 0,
        createdByUserId: userId,
      }).returning();
      for (let i = 0; i < stages!.length; i++) {
        const s = stages![i];
        const status = mode === "parallel" ? "active" : (i === 0 ? "active" : "pending");
        const dueAt = s.dueHours ? new Date(Date.now() + s.dueHours * 3600_000) : null;
        const [stage] = await tx.insert(schema.approvalStages).values({ organizationId, requestId: req.id, index: i, name: s.name, rule: s.rule, status, dueAt, round: 1 }).returning();
        if (s.approverUserIds?.length) await tx.insert(schema.approvalDecisions).values(s.approverUserIds.map((a) => ({ organizationId, stageId: stage.id, approverUserId: a })));
      }
      await this.event(tx, organizationId, req.id, "started", userId);
      return req;
    });
  }

  // ---- decide ----
  async decide(organizationId: string, actingUserId: string, stageId: string, decision: "approved" | "rejected", comment?: string) {
    const [stage] = await this.db.select().from(schema.approvalStages).where(and(eq(schema.approvalStages.id, stageId), eq(schema.approvalStages.organizationId, organizationId))).limit(1);
    if (!stage) throw new AppError("NOT_FOUND", "Stage not found");
    const [req] = await this.db.select().from(schema.approvalRequests).where(eq(schema.approvalRequests.id, stage.requestId)).limit(1);
    if (req.status !== "pending") throw new AppError("CONFLICT", `Request is ${req.status}`);
    if (stage.status !== "active") throw new AppError("CONFLICT", "Stage is not active");

    const slots = await this.db.select().from(schema.approvalDecisions).where(eq(schema.approvalDecisions.stageId, stageId));
    const slot = slots.find((s) => !s.decision && (s.approverUserId === actingUserId || s.delegateToUserId === actingUserId));
    if (!slot) throw new AppError("FORBIDDEN", "You have no pending decision on this stage");

    return this.db.transaction(async (tx) => {
      await tx.update(schema.approvalDecisions).set({ decision, decidedByUserId: actingUserId, comment: comment ?? null, decidedAt: new Date() }).where(eq(schema.approvalDecisions.id, slot.id));
      await this.event(tx, organizationId, req.id, `decision.${decision}`, actingUserId, stage.name);
      const after = slots.map((s) => (s.id === slot.id ? { ...s, decision } : s));

      if (decision === "rejected") {
        await tx.update(schema.approvalStages).set({ status: "rejected" }).where(eq(schema.approvalStages.id, stageId));
        await tx.update(schema.approvalRequests).set({ status: "rejected", decidedAt: new Date() }).where(eq(schema.approvalRequests.id, req.id));
        await this.event(tx, organizationId, req.id, "rejected", actingUserId);
        return { requestStatus: "rejected", stageStatus: "rejected" };
      }
      const approvedCount = after.filter((s) => s.decision === "approved").length;
      const stageApproved = stage.rule === "any" ? approvedCount >= 1 : after.every((s) => s.decision === "approved");
      if (!stageApproved) return { requestStatus: "pending", stageStatus: "active" };

      await tx.update(schema.approvalStages).set({ status: "approved" }).where(eq(schema.approvalStages.id, stageId));
      await this.event(tx, organizationId, req.id, "stage.approved", actingUserId, stage.name);

      if (req.mode === "sequential") {
        const [next] = await tx.select().from(schema.approvalStages).where(and(eq(schema.approvalStages.requestId, req.id), eq(schema.approvalStages.index, stage.index + 1))).limit(1);
        if (next) {
          await tx.update(schema.approvalStages).set({ status: "active" }).where(eq(schema.approvalStages.id, next.id));
          await tx.update(schema.approvalRequests).set({ currentStageIndex: stage.index + 1 }).where(eq(schema.approvalRequests.id, req.id));
          return { requestStatus: "pending", stageStatus: "approved" };
        }
      } else {
        const remaining = await tx.select().from(schema.approvalStages).where(and(eq(schema.approvalStages.requestId, req.id), inArray(schema.approvalStages.status, ["pending", "active"])));
        if (remaining.length) return { requestStatus: "pending", stageStatus: "approved" };
      }
      await tx.update(schema.approvalRequests).set({ status: "approved", decidedAt: new Date() }).where(eq(schema.approvalRequests.id, req.id));
      await this.event(tx, organizationId, req.id, "approved", actingUserId);
      return { requestStatus: "approved", stageStatus: "approved" };
    });
  }

  // ---- delegation ----
  async delegate(organizationId: string, fromUserId: string, stageId: string, toUserId: string) {
    const [slot] = await this.db.select().from(schema.approvalDecisions)
      .where(and(eq(schema.approvalDecisions.stageId, stageId), eq(schema.approvalDecisions.approverUserId, fromUserId), isNull(schema.approvalDecisions.decision))).limit(1);
    if (!slot) throw new AppError("NOT_FOUND", "No pending decision to delegate");
    const [row] = await this.db.update(schema.approvalDecisions).set({ delegateToUserId: toUserId }).where(eq(schema.approvalDecisions.id, slot.id)).returning();
    const [stage] = await this.db.select().from(schema.approvalStages).where(eq(schema.approvalStages.id, stageId)).limit(1);
    await this.event(this.db, organizationId, stage.requestId, "delegated", fromUserId, toUserId);
    return row;
  }

  // ---- escalation ----
  /** Add the request's escalation approver to any overdue active stage. Returns affected stage count. */
  async escalateOverdue(organizationId: string, now: Date = new Date()) {
    const overdue = await this.db.select().from(schema.approvalStages)
      .where(and(eq(schema.approvalStages.organizationId, organizationId), eq(schema.approvalStages.status, "active"), lt(schema.approvalStages.dueAt, now)));
    let affected = 0;
    for (const stage of overdue) {
      const [req] = await this.db.select().from(schema.approvalRequests).where(eq(schema.approvalRequests.id, stage.requestId)).limit(1);
      if (!req || req.status !== "pending" || !req.escalationUserId) continue;
      const existing = await this.db.select().from(schema.approvalDecisions).where(and(eq(schema.approvalDecisions.stageId, stage.id), eq(schema.approvalDecisions.approverUserId, req.escalationUserId)));
      if (existing.length === 0) {
        await this.db.insert(schema.approvalDecisions).values({ organizationId, stageId: stage.id, approverUserId: req.escalationUserId });
        await this.event(this.db, organizationId, req.id, "escalated", undefined, stage.name);
        affected++;
      }
    }
    return { escalated: affected };
  }

  // ---- field lock + reapproval ----
  async isFieldLocked(organizationId: string, workItemId: string, field: string): Promise<boolean> {
    const reqs = await this.db.select().from(schema.approvalRequests)
      .where(and(eq(schema.approvalRequests.organizationId, organizationId), eq(schema.approvalRequests.workItemId, workItemId), inArray(schema.approvalRequests.status, ["pending", "approved"])));
    return reqs.some((r) => (r.lockedFields as string[]).includes(field));
  }

  /** If an approved request locks a changed field and policy=on_locked_change, reopen for reapproval. */
  async onTargetChange(organizationId: string, workItemId: string, changedFields: string[]) {
    const reqs = await this.db.select().from(schema.approvalRequests)
      .where(and(eq(schema.approvalRequests.organizationId, organizationId), eq(schema.approvalRequests.workItemId, workItemId), eq(schema.approvalRequests.status, "approved")));
    let reopened = 0;
    for (const req of reqs) {
      if (req.reapprovalPolicy !== "on_locked_change") continue;
      const locked = req.lockedFields as string[];
      if (!changedFields.some((f) => locked.includes(f))) continue;
      await this.db.transaction(async (tx) => {
        const stages = await tx.select().from(schema.approvalStages).where(eq(schema.approvalStages.requestId, req.id));
        for (const st of stages) {
          const status = req.mode === "parallel" ? "active" : (st.index === 0 ? "active" : "pending");
          await tx.update(schema.approvalStages).set({ status, round: req.round + 1 }).where(eq(schema.approvalStages.id, st.id));
          await tx.update(schema.approvalDecisions).set({ decision: null, decidedByUserId: null, comment: null, decidedAt: null, delegateToUserId: null }).where(eq(schema.approvalDecisions.stageId, st.id));
        }
        await tx.update(schema.approvalRequests).set({ status: "pending", currentStageIndex: 0, round: req.round + 1, decidedAt: null }).where(eq(schema.approvalRequests.id, req.id));
        await this.event(tx, organizationId, req.id, "reapproval_triggered", undefined, changedFields.filter((f) => locked.includes(f)).join(","));
      });
      reopened++;
    }
    return { reopened };
  }

  // ---- reads ----
  async get(organizationId: string, requestId: string) {
    const [req] = await this.db.select().from(schema.approvalRequests).where(and(eq(schema.approvalRequests.id, requestId), eq(schema.approvalRequests.organizationId, organizationId))).limit(1);
    if (!req) throw new AppError("NOT_FOUND", "Request not found");
    const stages = await this.db.select().from(schema.approvalStages).where(eq(schema.approvalStages.requestId, requestId)).orderBy(schema.approvalStages.index);
    const decisions = await this.db.select().from(schema.approvalDecisions).where(inArray(schema.approvalDecisions.stageId, stages.map((s) => s.id)));
    return { request: req, stages: stages.map((s) => ({ ...s, approvers: decisions.filter((d) => d.stageId === s.id) })) };
  }
  history(organizationId: string, requestId: string) {
    return this.db.select().from(schema.approvalEvents).where(and(eq(schema.approvalEvents.organizationId, organizationId), eq(schema.approvalEvents.requestId, requestId))).orderBy(schema.approvalEvents.at);
  }
  /** Pending decisions for a user (direct or delegated) on currently active stages. */
  async queue(organizationId: string, userId: string) {
    const active = await this.db.select().from(schema.approvalStages).where(and(eq(schema.approvalStages.organizationId, organizationId), eq(schema.approvalStages.status, "active")));
    if (!active.length) return [];
    const slots = await this.db.select().from(schema.approvalDecisions).where(inArray(schema.approvalDecisions.stageId, active.map((s) => s.id)));
    const stageById = new Map(active.map((s) => [s.id, s]));
    return slots.filter((d) => !d.decision && (d.approverUserId === userId || d.delegateToUserId === userId))
      .map((d) => ({ stageId: d.stageId, requestId: stageById.get(d.stageId)!.requestId, stageName: stageById.get(d.stageId)!.name, delegated: d.delegateToUserId === userId }));
  }
}
