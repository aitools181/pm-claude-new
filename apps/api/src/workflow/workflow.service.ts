import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { conditionPasses, validatorReason, applyPostAction } from "./rules.js";
import { AuditService } from "../audit/audit.service.js";
import { WorkItemsService } from "../work/work-items.service.js";

@Injectable()
export class WorkflowService {
  constructor(@Inject(DB) private readonly db: Database, private readonly workItems: WorkItemsService, @Optional() private readonly audit?: AuditService) {}

  // ---------- Reads (for the editor UI) ----------
  listWorkflows(organizationId: string) {
    return this.db.select().from(schema.workflows).where(eq(schema.workflows.organizationId, organizationId));
  }
  async getWorkflow(organizationId: string, id: string) {
    const [wf] = await this.db.select().from(schema.workflows).where(and(eq(schema.workflows.id, id), eq(schema.workflows.organizationId, organizationId))).limit(1);
    const versions = await this.db.select().from(schema.workflowVersions).where(eq(schema.workflowVersions.workflowId, id)).orderBy(schema.workflowVersions.versionNo);
    return { workflow: wf, versions };
  }
  async getVersion(organizationId: string, versionId: string) {
    const statuses = await this.db.select().from(schema.workflowStatuses).where(eq(schema.workflowStatuses.versionId, versionId)).orderBy(schema.workflowStatuses.rank);
    const transitions = await this.db.select().from(schema.workflowTransitions).where(eq(schema.workflowTransitions.versionId, versionId));
    const rules = transitions.length
      ? await this.db.select().from(schema.transitionRules).where(eq(schema.transitionRules.organizationId, organizationId))
      : [];
    return { statuses, transitions, rules: rules.filter((r) => transitions.some((t) => t.id === r.transitionId)) };
  }

  // ---------- Authoring (draft only) ----------
  async create(organizationId: string, userId: string, name: string) {
    return this.db.transaction(async (tx) => {
      const [wf] = await tx.insert(schema.workflows).values({ organizationId, name, createdBy: userId }).returning();
      const [ver] = await tx.insert(schema.workflowVersions).values({ organizationId, workflowId: wf.id, versionNo: 1, status: "draft", createdBy: userId }).returning();
      return { workflow: wf, version: ver };
    });
  }

  private async assertDraft(versionId: string) {
    const [v] = await this.db.select().from(schema.workflowVersions).where(eq(schema.workflowVersions.id, versionId)).limit(1);
    if (!v) throw new AppError("NOT_FOUND", "Workflow version not found");
    if (v.status !== "draft") throw new AppError("CONFLICT", "This workflow version is published and immutable");
    return v;
  }

  async addStatus(organizationId: string, versionId: string, input: { key: string; name: string; category?: string; isInitial?: boolean; rank?: number }) {
    await this.assertDraft(versionId);
    const [s] = await this.db.insert(schema.workflowStatuses).values({ organizationId, versionId, key: input.key, name: input.name, category: input.category ?? "todo", isInitial: input.isInitial ?? false, rank: input.rank ?? 0 }).returning();
    return s;
  }

  async addTransition(organizationId: string, versionId: string, input: { name: string; fromStatusId?: string | null; toStatusId: string }) {
    await this.assertDraft(versionId);
    const [t] = await this.db.insert(schema.workflowTransitions).values({ organizationId, versionId, name: input.name, fromStatusId: input.fromStatusId ?? null, toStatusId: input.toStatusId }).returning();
    return t;
  }

  async addRule(organizationId: string, transitionId: string, ruleType: "condition" | "validator" | "post_action", kind: string, config?: unknown) {
    const [tr] = await this.db.select({ v: schema.workflowTransitions.versionId }).from(schema.workflowTransitions).where(eq(schema.workflowTransitions.id, transitionId)).limit(1);
    if (!tr) throw new AppError("NOT_FOUND", "Transition not found");
    await this.assertDraft(tr.v);
    const [r] = await this.db.insert(schema.transitionRules).values({ organizationId, transitionId, ruleType, kind, config }).returning();
    return r;
  }

  // ---------- Validate / Publish ----------
  async validate(versionId: string): Promise<{ ok: boolean; issues: string[] }> {
    const statuses = await this.db.select().from(schema.workflowStatuses).where(eq(schema.workflowStatuses.versionId, versionId));
    const transitions = await this.db.select().from(schema.workflowTransitions).where(eq(schema.workflowTransitions.versionId, versionId));
    const issues: string[] = [];
    if (statuses.length === 0) issues.push("At least one status is required");
    const initials = statuses.filter((s) => s.isInitial);
    if (initials.length !== 1) issues.push("Exactly one initial status is required");
    const ids = new Set(statuses.map((s) => s.id));
    for (const t of transitions) {
      if (t.fromStatusId && !ids.has(t.fromStatusId)) issues.push(`Transition "${t.name}" has an invalid source status`);
      if (!ids.has(t.toStatusId)) issues.push(`Transition "${t.name}" has an invalid target status`);
    }
    return { ok: issues.length === 0, issues };
  }

  async publish(organizationId: string, userId: string, versionId: string) {
    const v = await this.assertDraft(versionId);
    const check = await this.validate(versionId);
    if (!check.ok) throw new AppError("VALIDATION", "Workflow is not valid", check.issues);
    await this.db.update(schema.workflowVersions).set({ status: "published", publishedAt: new Date(), publishedBy: userId }).where(eq(schema.workflowVersions.id, versionId));
    await this.db.update(schema.workflows).set({ publishedVersionId: versionId, updatedBy: userId, updatedAt: new Date() }).where(eq(schema.workflows.id, v.workflowId));
    await this.audit?.append({ scopeType: "organization", organizationId, actorUserId: userId, action: "workflow.published", targetType: "workflow_version", targetId: versionId });
    return { published: true };
  }

  // ---------- Versioning + migration ----------
  /** Clone the published version's statuses/transitions into a fresh draft for editing. */
  async newDraftVersion(organizationId: string, userId: string, workflowId: string) {
    const [wf] = await this.db.select().from(schema.workflows).where(eq(schema.workflows.id, workflowId)).limit(1);
    if (!wf?.publishedVersionId) throw new AppError("VALIDATION", "Nothing published to branch from");
    const src = wf.publishedVersionId;
    return this.db.transaction(async (tx) => {
      const nextNo = (await tx.select().from(schema.workflowVersions).where(eq(schema.workflowVersions.workflowId, workflowId))).length + 1;
      const [ver] = await tx.insert(schema.workflowVersions).values({ organizationId, workflowId, versionNo: nextNo, status: "draft", createdBy: userId }).returning();
      const statuses = await tx.select().from(schema.workflowStatuses).where(eq(schema.workflowStatuses.versionId, src));
      const idMap = new Map<string, string>();
      for (const s of statuses) {
        const [ns] = await tx.insert(schema.workflowStatuses).values({ organizationId, versionId: ver.id, key: s.key, name: s.name, category: s.category, isInitial: s.isInitial, rank: s.rank }).returning();
        idMap.set(s.id, ns.id);
      }
      const trs = await tx.select().from(schema.workflowTransitions).where(eq(schema.workflowTransitions.versionId, src));
      for (const t of trs) await tx.insert(schema.workflowTransitions).values({ organizationId, versionId: ver.id, name: t.name, fromStatusId: t.fromStatusId ? idMap.get(t.fromStatusId) : null, toStatusId: idMap.get(t.toStatusId)! });
      return ver;
    });
  }

  /** Preview how currently-bound items map to a new version's statuses (by key). */
  async migrationPreview(workflowId: string, newVersionId: string) {
    const newStatuses = await this.db.select().from(schema.workflowStatuses).where(eq(schema.workflowStatuses.versionId, newVersionId));
    const keySet = new Set(newStatuses.map((s) => s.key));
    const items = await this.db.select({ state: schema.workItemWorkflowState, curKey: schema.workflowStatuses.key })
      .from(schema.workItemWorkflowState)
      .innerJoin(schema.workflowStatuses, eq(schema.workflowStatuses.id, schema.workItemWorkflowState.currentStatusId))
      .where(eq(schema.workItemWorkflowState.workflowId, workflowId));
    return items.map((i) => ({ workItemId: i.state.workItemId, currentKey: i.curKey, mapsCleanly: keySet.has(i.curKey), targetKey: keySet.has(i.curKey) ? i.curKey : null }));
  }

  async migrate(organizationId: string, workflowId: string, newVersionId: string, mapping: Record<string, string> = {}) {
    const preview = await this.migrationPreview(workflowId, newVersionId);
    const newStatuses = await this.db.select().from(schema.workflowStatuses).where(eq(schema.workflowStatuses.versionId, newVersionId));
    const byKey = new Map(newStatuses.map((s) => [s.key, s]));
    for (const p of preview) {
      const targetKey = p.mapsCleanly ? p.currentKey : mapping[p.currentKey];
      const target = targetKey ? byKey.get(targetKey) : undefined;
      if (!target) throw new AppError("VALIDATION", `No mapping for status "${p.currentKey}"`);
      await this.db.update(schema.workItemWorkflowState).set({ versionId: newVersionId, currentStatusId: target.id, updatedAt: new Date() }).where(eq(schema.workItemWorkflowState.workItemId, p.workItemId));
    }
  }

  // ---------- Runtime ----------
  async bindItem(organizationId: string, workflowId: string, workItemId: string) {
    const [wf] = await this.db.select().from(schema.workflows).where(eq(schema.workflows.id, workflowId)).limit(1);
    if (!wf?.publishedVersionId) throw new AppError("VALIDATION", "Workflow has no published version");
    const [initial] = await this.db.select().from(schema.workflowStatuses).where(and(eq(schema.workflowStatuses.versionId, wf.publishedVersionId), eq(schema.workflowStatuses.isInitial, true))).limit(1);
    await this.db.insert(schema.workItemWorkflowState).values({ organizationId, workItemId, workflowId, versionId: wf.publishedVersionId, currentStatusId: initial.id })
      .onConflictDoNothing({ target: schema.workItemWorkflowState.workItemId });
    await this.syncItemStatus(workItemId, initial.id);
    return { statusKey: initial.key };
  }

  async availableActions(organizationId: string, userId: string, workItemId: string) {
    const state = await this.state(organizationId, workItemId);
    const transitions = await this.db.select().from(schema.workflowTransitions)
      .where(eq(schema.workflowTransitions.versionId, state.versionId));
    const fromCurrent = transitions.filter((t) => t.fromStatusId === null || t.fromStatusId === state.currentStatusId);

    const offered = [];
    for (const t of fromCurrent) {
      const conds = await this.rules(t.id, "condition");
      let ok = true;
      for (const c of conds) if (!(await conditionPasses(this.db, organizationId, userId, workItemId, c))) { ok = false; break; }
      if (ok) offered.push({ transitionId: t.id, name: t.name, toStatusId: t.toStatusId });
    }
    return offered;
  }

  async transition(organizationId: string, userId: string, workItemId: string, transitionId: string) {
    const state = await this.state(organizationId, workItemId);
    const [t] = await this.db.select().from(schema.workflowTransitions).where(and(eq(schema.workflowTransitions.id, transitionId), eq(schema.workflowTransitions.versionId, state.versionId))).limit(1);
    if (!t) throw new AppError("VALIDATION", "That transition is not part of this item's workflow");
    if (t.fromStatusId !== null && t.fromStatusId !== state.currentStatusId) throw new AppError("VALIDATION", "That transition is not available from the current status");

    // Conditions (offer gate).
    for (const c of await this.rules(t.id, "condition")) {
      if (!(await conditionPasses(this.db, organizationId, userId, workItemId, c))) {
        throw new AppError("FORBIDDEN", c.kind === "role" ? `Transition requires role "${(c.config as any)?.roleKey}"` : "You do not meet the conditions for this transition");
      }
    }
    // Validators (success gate) — precise reasons.
    for (const v of await this.rules(t.id, "validator")) {
      const reason = await validatorReason(this.db, organizationId, workItemId, v);
      if (reason) throw new AppError("VALIDATION", reason);
    }
    await this.workItems.assertAccess(organizationId, workItemId, userId);
    const [targetStatus] = await this.db.select().from(schema.workflowStatuses).where(and(eq(schema.workflowStatuses.id, t.toStatusId), eq(schema.workflowStatuses.versionId, state.versionId))).limit(1);
    if (!targetStatus) throw new AppError("VALIDATION", "Transition target status does not exist");
    const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.id, workItemId), isNull(schema.workItems.deletedAt))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");
    if (targetStatus.category === "done") {
      const [openChildren] = await this.db.select({ count: count() }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.parentId, workItemId), isNull(schema.workItems.deletedAt), sql`${schema.workItems.statusCategory} <> 'done'`));
      if (Number(openChildren?.count ?? 0) > 0) throw new AppError("VALIDATION", "Complete the open subtasks before completing this task", { code: "WORK_ITEM_OPEN_CHILDREN" });
    }
    const postActions = await this.rules(t.id, "post_action");
    return this.db.transaction(async (tx) => {
      const [stateUpdated] = await tx.update(schema.workItemWorkflowState).set({ currentStatusId: t.toStatusId, updatedAt: new Date() }).where(and(eq(schema.workItemWorkflowState.workItemId, workItemId), eq(schema.workItemWorkflowState.currentStatusId, state.currentStatusId))).returning({ id: schema.workItemWorkflowState.id });
      if (!stateUpdated) throw new AppError("CONFLICT", "Workflow state changed; reload available transitions", { code: "WORK_ITEM_VERSION_CONFLICT" });
      const [updated] = await tx.update(schema.workItems).set({ status: targetStatus.name, statusCategory: targetStatus.category, version: sql`${schema.workItems.version} + 1`, updatedBy: userId, updatedAt: new Date() }).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.id, workItemId), eq(schema.workItems.version, item.version), isNull(schema.workItems.deletedAt))).returning();
      if (!updated) throw new AppError("CONFLICT", "Work item changed during transition", { code: "WORK_ITEM_VERSION_CONFLICT" });
      if (item.statusCategory !== targetStatus.category) await tx.insert(schema.workItemStatusHistory).values({ organizationId, workItemId, projectId: item.owningProjectId, fromCategory: item.statusCategory, toCategory: targetStatus.category });
      for (const action of postActions) await applyPostAction(tx as unknown as Database, organizationId, userId, workItemId, action);
      await tx.insert(schema.activityEvents).values({ organizationId, workItemId, projectId: item.owningProjectId, actorUserId: userId, action: "workflow.transitioned", data: JSON.stringify({ transition: t.name, fromStatusId: state.currentStatusId, toStatusId: t.toStatusId }) });
      return { toStatusId: t.toStatusId, status: targetStatus.name, statusCategory: targetStatus.category, version: updated.version };
    });
  }

  // ---------- helpers ----------
  private async state(organizationId: string, workItemId: string) {
    const [s] = await this.db.select().from(schema.workItemWorkflowState).where(and(eq(schema.workItemWorkflowState.organizationId, organizationId), eq(schema.workItemWorkflowState.workItemId, workItemId))).limit(1);
    if (!s) throw new AppError("VALIDATION", "Work item is not bound to a workflow");
    return s;
  }
  private rules(transitionId: string, ruleType: string) {
    return this.db.select().from(schema.transitionRules).where(and(eq(schema.transitionRules.transitionId, transitionId), eq(schema.transitionRules.ruleType, ruleType)));
  }
  private async syncItemStatus(workItemId: string, statusId: string) {
    const [st] = await this.db.select().from(schema.workflowStatuses).where(eq(schema.workflowStatuses.id, statusId)).limit(1);
    if (st) await this.db.update(schema.workItems).set({ status: st.name, statusCategory: st.category }).where(eq(schema.workItems.id, workItemId));
  }
}
