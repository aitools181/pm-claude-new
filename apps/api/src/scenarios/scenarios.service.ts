import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { canAccessProject, canAccessWorkItem } from "../collab/access.js";
import { sha256 } from "../common/crypto.js";
import { autoSchedule, type ScenarioItem } from "./scenario-engine.js";

@Injectable()
export class ScenariosService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "scenarios"); }

  async list(org: string, userId: string) {
    await this.enabled(org);
    const rows = await this.db.select().from(schema.planningScenarios).where(eq(schema.planningScenarios.organizationId, org));
    const visible = [];
    for (const row of rows) if (!row.projectId || await canAccessProject(this.db, org, row.projectId, userId)) visible.push(row);
    return visible;
  }

  private async projectItems(org: string, projectId: string) {
    return this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.owningProjectId, projectId), isNull(schema.workItems.deletedAt)));
  }

  async create(org: string, userId: string, input: { name: string; description?: string; projectId?: string; portfolioId?: string; objective?: string }) {
    await this.enabled(org);
    if (!input.projectId && !input.portfolioId) throw new AppError("VALIDATION", "A project or portfolio is required");
    if (input.projectId && !(await canAccessProject(this.db, org, input.projectId, userId))) throw new AppError("FORBIDDEN", "No access to project");
    let projectIds: string[] = input.projectId ? [input.projectId] : [];
    if (input.portfolioId) {
      const links = await this.db.select({ projectId: schema.portfolioProjects.projectId }).from(schema.portfolioProjects).where(and(eq(schema.portfolioProjects.organizationId, org), eq(schema.portfolioProjects.portfolioId, input.portfolioId)));
      projectIds = links.map((l) => l.projectId);
    }
    const items: unknown[] = [];
    for (const projectId of projectIds) {
      if (!(await canAccessProject(this.db, org, projectId, userId))) continue;
      items.push(...await this.projectItems(org, projectId));
    }
    const baseSnapshot = { generatedAt: new Date().toISOString(), projectIds, items };
    const baseVersionHash = sha256(JSON.stringify(baseSnapshot));
    const [row] = await this.db.insert(schema.planningScenarios).values({ organizationId: org, name: input.name, description: input.description, projectId: input.projectId, portfolioId: input.portfolioId, objective: input.objective ?? "earliest_delivery", baseSnapshot, baseVersionHash, createdByUserId: userId }).returning();
    return row;
  }

  private async scenario(org: string, id: string) {
    const [row] = await this.db.select().from(schema.planningScenarios).where(and(eq(schema.planningScenarios.organizationId, org), eq(schema.planningScenarios.id, id))).limit(1);
    if (!row) throw new AppError("NOT_FOUND", "Scenario not found");
    return row;
  }

  async detail(org: string, userId: string, id: string) {
    await this.enabled(org);
    const scenario = await this.scenario(org, id);
    if (scenario.projectId && !(await canAccessProject(this.db, org, scenario.projectId, userId))) throw new AppError("FORBIDDEN", "No access");
    const [changes, runs, warnings, proposals] = await Promise.all([
      this.db.select().from(schema.scenarioChanges).where(eq(schema.scenarioChanges.scenarioId, id)),
      this.db.select().from(schema.scenarioRuns).where(eq(schema.scenarioRuns.scenarioId, id)),
      this.db.select().from(schema.planningWarnings).where(eq(schema.planningWarnings.scenarioId, id)),
      this.db.select().from(schema.scenarioCommitProposals).where(eq(schema.scenarioCommitProposals.scenarioId, id)),
    ]);
    return { scenario, changes, runs, warnings, proposals };
  }

  async addChange(org: string, userId: string, id: string, input: { workItemId: string; field: string; afterValue?: unknown; selectedForCommit?: boolean }) {
    await this.enabled(org);
    const scenario = await this.scenario(org, id);
    if (scenario.status !== "draft") throw new AppError("CONFLICT", "Only draft scenarios can be edited");
    if (!(await canAccessWorkItem(this.db, org, input.workItemId, userId))) throw new AppError("FORBIDDEN", "No access to work item");
    const allowed = new Set(["startDate", "dueDate", "durationDays", "estimateMinutes", "primaryOwnerUserId", "priority", "storyPoints"]);
    if (!allowed.has(input.field)) throw new AppError("VALIDATION", "This field is not scenario-editable");
    const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, input.workItemId))).limit(1);
    const beforeValue = (item as unknown as Record<string, unknown>)[input.field];
    const [row] = await this.db.insert(schema.scenarioChanges).values({ organizationId: org, scenarioId: id, workItemId: input.workItemId, field: input.field, beforeValue, afterValue: input.afterValue, selectedForCommit: input.selectedForCommit ?? true, createdByUserId: userId }).returning();
    return row;
  }

  async schedule(org: string, userId: string, id: string, input: { anchorDate?: string } = {}) {
    await this.enabled(org);
    const scenario = await this.scenario(org, id);
    const snap = scenario.baseSnapshot as { items?: Array<Record<string, unknown>> };
    const changes = await this.db.select().from(schema.scenarioChanges).where(eq(schema.scenarioChanges.scenarioId, id));
    const rows = (snap.items ?? []).map((raw) => ({ ...raw })) as Array<Record<string, unknown>>;
    for (const change of changes) {
      const item = rows.find((r) => r.id === change.workItemId);
      if (item) item[change.field] = change.afterValue;
    }
    const ids = rows.map((r) => String(r.id));
    const deps = ids.length ? await this.db.select().from(schema.workItemDependencies).where(and(eq(schema.workItemDependencies.organizationId, org), inArray(schema.workItemDependencies.predecessorId, ids), inArray(schema.workItemDependencies.successorId, ids))) : [];
    const items: ScenarioItem[] = rows.map((r) => ({ id: String(r.id), startDate: r.startDate ? String(r.startDate) : null, dueDate: r.dueDate ? String(r.dueDate) : null, durationDays: r.durationDays == null ? null : Number(r.durationDays), estimateMinutes: r.estimateMinutes == null ? null : Number(r.estimateMinutes), ownerId: r.primaryOwnerUserId ? String(r.primaryOwnerUserId) : null, version: Number(r.version ?? 1), progress: Number(r.progress ?? 0), statusCategory: String(r.statusCategory ?? "todo") }));
    const output = autoSchedule(items, deps.map((d) => ({ predecessorId: d.predecessorId, successorId: d.successorId })), input.anchorDate ? new Date(`${input.anchorDate}T00:00:00Z`) : new Date());
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.planningWarnings).where(eq(schema.planningWarnings.scenarioId, id));
      if (output.warnings.length) await tx.insert(schema.planningWarnings).values(output.warnings.map((w) => ({ organizationId: org, scenarioId: id, workItemId: w.workItemId, code: w.code, severity: w.severity, message: w.message })));
      await tx.insert(schema.scenarioRuns).values({ organizationId: org, scenarioId: id, kind: "auto_schedule", inputs: input, output, explanation: output.explanation, createdByUserId: userId });
      for (const planned of output.items) {
        const original = rows.find((r) => r.id === planned.id);
        for (const field of ["startDate", "dueDate"] as const) if (original && original[field] !== planned[field]) await tx.insert(schema.scenarioChanges).values({ organizationId: org, scenarioId: id, workItemId: planned.id, field, beforeValue: original[field], afterValue: planned[field], selectedForCommit: true, createdByUserId: userId });
      }
    });
    return output;
  }

  async compare(org: string, userId: string, ids: string[]) {
    await this.enabled(org);
    const results = [];
    for (const id of ids) {
      const detail = await this.detail(org, userId, id);
      const latest = detail.runs.at(-1)?.output as { items?: ScenarioItem[]; warnings?: unknown[] } | undefined;
      const due = latest?.items?.map((i) => i.dueDate).filter(Boolean).sort().at(-1) ?? null;
      results.push({ id, name: detail.scenario.name, deliveryDate: due, changes: detail.changes.length, warnings: detail.warnings.length });
    }
    return results;
  }

  async proposeCommit(org: string, userId: string, id: string, selectedChangeIds?: string[]) {
    await this.enabled(org);
    await this.scenario(org, id);
    const changes = await this.db.select().from(schema.scenarioChanges).where(eq(schema.scenarioChanges.scenarioId, id));
    const selected = changes.filter((c) => selectedChangeIds ? selectedChangeIds.includes(c.id) : c.selectedForCommit);
    const conflicts: unknown[] = []; const rollback: Record<string, unknown> = {};
    for (const change of selected) {
      const [item] = await this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, change.workItemId), isNull(schema.workItems.deletedAt))).limit(1);
      if (!item || !(await canAccessWorkItem(this.db, org, change.workItemId, userId))) { conflicts.push({ changeId: change.id, code: "INACCESSIBLE_OR_DELETED" }); continue; }
      const current = (item as unknown as Record<string, unknown>)[change.field];
      if (JSON.stringify(current) !== JSON.stringify(change.beforeValue)) conflicts.push({ changeId: change.id, code: "STALE_VALUE", current, expected: change.beforeValue });
      rollback[change.id] = current;
    }
    const [proposal] = await this.db.insert(schema.scenarioCommitProposals).values({ organizationId: org, scenarioId: id, selectedChangeIds: selected.map((c) => c.id), conflicts, rollbackSnapshot: rollback, requestedByUserId: userId, status: conflicts.length ? "conflicted" : "pending" }).returning();
    return proposal;
  }

  private nonNegativeInteger(field: string, value: unknown) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new AppError("VALIDATION", `Scenario field '${field}' must be numeric`);
    return Math.max(0, Math.trunc(numeric));
  }

  private commitPatch(field: string, value: unknown) {
    switch (field) {
      case "startDate": return { startDate: value == null ? null : String(value) };
      case "dueDate": return { dueDate: value == null ? null : String(value) };
      case "durationDays": return { durationDays: value == null ? null : this.nonNegativeInteger(field, value) };
      case "estimateMinutes": return { estimateMinutes: value == null ? null : this.nonNegativeInteger(field, value) };
      case "primaryOwnerUserId": return { primaryOwnerUserId: value == null || value === "" ? null : String(value) };
      case "priority": return { priority: String(value) };
      case "storyPoints": return { storyPoints: value == null ? null : this.nonNegativeInteger(field, value) };
      default: throw new AppError("VALIDATION", `Unsupported scenario field '${field}'`);
    }
  }

  async approveAndCommit(org: string, userId: string, proposalId: string) {
    await this.enabled(org);
    const [proposal] = await this.db.select().from(schema.scenarioCommitProposals).where(and(eq(schema.scenarioCommitProposals.organizationId, org), eq(schema.scenarioCommitProposals.id, proposalId))).limit(1);
    if (!proposal) throw new AppError("NOT_FOUND", "Commit proposal not found");
    if ((proposal.conflicts as unknown[]).length) throw new AppError("CONFLICT", "Scenario contains stale conflicts; rebase before commit", proposal.conflicts);
    const ids = proposal.selectedChangeIds as string[];
    const changes = ids.length ? await this.db.select().from(schema.scenarioChanges).where(and(eq(schema.scenarioChanges.organizationId, org), inArray(schema.scenarioChanges.id, ids))) : [];
    await this.db.transaction(async (tx) => {
      for (const change of changes) {
        if (!(await canAccessWorkItem(this.db, org, change.workItemId, userId))) throw new AppError("FORBIDDEN", "Access changed during commit");
        const patch = this.commitPatch(change.field, change.afterValue);
        await tx.update(schema.workItems).set({ ...patch, version: sql`${schema.workItems.version} + 1`, updatedBy: userId, updatedAt: new Date() }).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, change.workItemId), isNull(schema.workItems.deletedAt)));
        await tx.insert(schema.activityEvents).values({ organizationId: org, workItemId: change.workItemId, actorUserId: userId, action: "scenario.change_committed", data: JSON.stringify({ field: change.field, before: change.beforeValue, after: change.afterValue, proposalId }) });
      }
      await tx.update(schema.scenarioCommitProposals).set({ status: "committed", approvedByUserId: userId, committedAt: new Date() }).where(eq(schema.scenarioCommitProposals.id, proposalId));
      await tx.update(schema.planningScenarios).set({ status: "committed", lockedAt: new Date(), updatedAt: new Date() }).where(eq(schema.planningScenarios.id, proposal.scenarioId));
    });
    return { proposalId, committed: changes.length };
  }
}
