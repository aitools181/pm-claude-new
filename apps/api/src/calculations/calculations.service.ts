import { Injectable, Inject } from "@nestjs/common";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ModulesService } from "../modules/modules.service.js";
import { canAccessWorkItem } from "../collab/access.js";
import { aggregate, type AggregateOperation } from "./calculation-engine.js";

const CORE_FIELDS = new Set(["title", "status", "statusCategory", "priority", "startDate", "dueDate", "estimateMinutes", "storyPoints", "progress", "primaryOwnerUserId"]);

@Injectable()
export class CalculationsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly modules: ModulesService) {}
  private enabled(org: string) { return this.modules.assertEnabled(org, "calculations"); }

  async list(org: string) {
    await this.enabled(org);
    const [paths, definitions, runs] = await Promise.all([
      this.db.select().from(schema.relationPaths).where(eq(schema.relationPaths.organizationId, org)),
      this.db.select().from(schema.calculatedFieldDefinitions).where(eq(schema.calculatedFieldDefinitions.organizationId, org)),
      this.db.select().from(schema.recalculationRuns).where(eq(schema.recalculationRuns.organizationId, org)).limit(100),
    ]);
    return { paths, definitions, runs };
  }

  async createPath(org: string, input: { key: string; name: string; pathKind: string; sourceType?: string; targetType?: string; config?: Record<string, unknown> }) {
    await this.enabled(org);
    const allowed = ["children", "parent", "dependency", "placement", "custom_relation"];
    if (!allowed.includes(input.pathKind)) throw new AppError("VALIDATION", "Unsupported relation path");
    const [row] = await this.db.insert(schema.relationPaths).values({ organizationId: org, key: input.key, name: input.name, pathKind: input.pathKind, sourceType: input.sourceType ?? "work_item", targetType: input.targetType ?? "work_item", config: input.config ?? {} }).returning();
    return row;
  }

  async createDefinition(org: string, userId: string, input: { targetFieldId: string; relationPathId?: string; kind: "lookup" | "mirror" | "rollup"; sourceFieldKey: string; operation?: AggregateOperation; filter?: Record<string, unknown>; config?: Record<string, unknown>; dependsOnCalculationIds?: string[] }) {
    await this.enabled(org);
    const [field] = await this.db.select().from(schema.customFieldDefinitions).where(and(eq(schema.customFieldDefinitions.id, input.targetFieldId), eq(schema.customFieldDefinitions.organizationId, org), isNull(schema.customFieldDefinitions.archivedAt))).limit(1);
    if (!field) throw new AppError("NOT_FOUND", "Target custom field not found");
    if (input.kind === "rollup" && !input.operation) throw new AppError("VALIDATION", "Rollup operation is required");
    if (input.relationPathId) {
      const [path] = await this.db.select().from(schema.relationPaths).where(and(eq(schema.relationPaths.id, input.relationPathId), eq(schema.relationPaths.organizationId, org))).limit(1);
      if (!path) throw new AppError("NOT_FOUND", "Relation path not found");
    }
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(schema.calculatedFieldDefinitions).values({ organizationId: org, targetFieldId: input.targetFieldId, relationPathId: input.relationPathId, kind: input.kind, sourceFieldKey: input.sourceFieldKey, operation: input.operation, filter: input.filter ?? {}, config: input.config ?? {}, createdByUserId: userId }).returning();
      for (const dependsOn of input.dependsOnCalculationIds ?? []) {
        if (dependsOn === row.id) throw new AppError("VALIDATION", "A calculation cannot depend on itself");
        await tx.insert(schema.calculationDependencies).values({ organizationId: org, calculationId: row.id, dependsOnCalculationId: dependsOn }).onConflictDoNothing();
      }
      await this.assertNoCycles(org, row.id, tx as unknown as Database);
      return row;
    });
  }

  private async assertNoCycles(org: string, root: string, db: Database = this.db) {
    const rows = await db.select().from(schema.calculationDependencies).where(eq(schema.calculationDependencies.organizationId, org));
    const graph = new Map<string, string[]>();
    for (const r of rows) if (r.dependsOnCalculationId) graph.set(r.calculationId, [...(graph.get(r.calculationId) ?? []), r.dependsOnCalculationId]);
    const visiting = new Set<string>(); const visited = new Set<string>();
    const walk = (id: string) => {
      if (visiting.has(id)) throw new AppError("VALIDATION", "Calculation dependency cycle detected", { code: "CALCULATION_CYCLE" });
      if (visited.has(id)) return;
      visiting.add(id); for (const next of graph.get(id) ?? []) walk(next); visiting.delete(id); visited.add(id);
    };
    walk(root);
  }

  private async relatedItems(org: string, workItemId: string, pathKind: string) {
    if (pathKind === "children") return this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.parentId, workItemId), isNull(schema.workItems.deletedAt)));
    if (pathKind === "parent") {
      const [item] = await this.db.select({ parentId: schema.workItems.parentId }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, workItemId), isNull(schema.workItems.deletedAt))).limit(1);
      if (!item?.parentId) return [];
      return this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, item.parentId), isNull(schema.workItems.deletedAt)));
    }
    if (pathKind === "dependency") {
      const deps = await this.db.select().from(schema.workItemDependencies).where(and(eq(schema.workItemDependencies.organizationId, org), or(eq(schema.workItemDependencies.predecessorId, workItemId), eq(schema.workItemDependencies.successorId, workItemId))));
      const ids = [...new Set(deps.map((d) => d.predecessorId === workItemId ? d.successorId : d.predecessorId))];
      return ids.length ? this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), inArray(schema.workItems.id, ids), isNull(schema.workItems.deletedAt))) : [];
    }
    if (pathKind === "placement") {
      const [item] = await this.db.select({ projectId: schema.workItems.owningProjectId }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.id, workItemId))).limit(1);
      return item ? this.db.select().from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), eq(schema.workItems.owningProjectId, item.projectId), isNull(schema.workItems.deletedAt))) : [];
    }
    return [];
  }

  private async valueFor(org: string, item: typeof schema.workItems.$inferSelect, sourceFieldKey: string) {
    if (CORE_FIELDS.has(sourceFieldKey)) return (item as unknown as Record<string, unknown>)[sourceFieldKey];
    const [field] = await this.db.select().from(schema.customFieldDefinitions).where(and(eq(schema.customFieldDefinitions.organizationId, org), eq(schema.customFieldDefinitions.key, sourceFieldKey))).limit(1);
    if (!field) return null;
    const [value] = await this.db.select().from(schema.customFieldValues).where(and(eq(schema.customFieldValues.organizationId, org), eq(schema.customFieldValues.workItemId, item.id), eq(schema.customFieldValues.fieldId, field.id))).limit(1);
    if (!value) return null;
    return value.valueNumber ?? value.valueDate ?? value.valueBool ?? value.valueText ?? value.valueUserId ?? value.valueOptionId;
  }

  async calculate(org: string, userId: string, calculationId: string, workItemId: string) {
    await this.enabled(org);
    if (!(await canAccessWorkItem(this.db, org, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to target work item");
    const [definition] = await this.db.select().from(schema.calculatedFieldDefinitions).where(and(eq(schema.calculatedFieldDefinitions.organizationId, org), eq(schema.calculatedFieldDefinitions.id, calculationId), eq(schema.calculatedFieldDefinitions.active, true))).limit(1);
    if (!definition) throw new AppError("NOT_FOUND", "Calculated field definition not found");
    let pathKind = "children";
    if (definition.relationPathId) {
      const [path] = await this.db.select().from(schema.relationPaths).where(and(eq(schema.relationPaths.organizationId, org), eq(schema.relationPaths.id, definition.relationPathId))).limit(1);
      pathKind = path?.pathKind ?? pathKind;
    }
    const related = await this.relatedItems(org, workItemId, pathKind);
    const values: unknown[] = []; let redactedCount = 0;
    for (const item of related) {
      if (!(await canAccessWorkItem(this.db, org, item.id, userId))) { redactedCount++; continue; }
      values.push(await this.valueFor(org, item, definition.sourceFieldKey));
    }
    let result: { valueNumber?: number; valueText?: string; valueJson?: unknown } = {};
    if (definition.kind === "rollup") result = aggregate((definition.operation ?? "count") as AggregateOperation, values);
    else if (definition.kind === "lookup") result = { valueJson: values };
    else result = values.length ? (typeof values[0] === "number" ? { valueNumber: values[0] as number } : { valueText: String(values[0] ?? "") }) : {};
    const existing = await this.db.select().from(schema.rollupProjections).where(and(eq(schema.rollupProjections.organizationId, org), eq(schema.rollupProjections.workItemId, workItemId), eq(schema.rollupProjections.calculationId, calculationId))).limit(1).then((r) => r[0]);
    const valuesToWrite = { ...result, sourceCount: values.length, redactedCount, error: null, calculatedAt: new Date() };
    const [projection] = existing
      ? await this.db.update(schema.rollupProjections).set(valuesToWrite).where(eq(schema.rollupProjections.id, existing.id)).returning()
      : await this.db.insert(schema.rollupProjections).values({ organizationId: org, workItemId, calculationId, ...valuesToWrite }).returning();
    return { projection, explain: { pathKind, sourceFieldKey: definition.sourceFieldKey, operation: definition.operation, visibleSources: values.length, redactedSources: redactedCount } };
  }

  async recalculate(org: string, userId: string, calculationId: string, projectId?: string) {
    await this.enabled(org);
    const [run] = await this.db.insert(schema.recalculationRuns).values({ organizationId: org, calculationId, scopeType: projectId ? "project" : "organization", scopeId: projectId, startedByUserId: userId }).returning();
    const items = await this.db.select({ id: schema.workItems.id }).from(schema.workItems).where(and(eq(schema.workItems.organizationId, org), projectId ? eq(schema.workItems.owningProjectId, projectId) : undefined, isNull(schema.workItems.deletedAt))).limit(5000);
    let processed = 0; let failed = 0; const errors: unknown[] = [];
    for (const item of items) {
      try { await this.calculate(org, userId, calculationId, item.id); processed++; }
      catch (error) { failed++; if (errors.length < 100) errors.push({ workItemId: item.id, message: error instanceof Error ? error.message : "Failed" }); }
    }
    await this.db.update(schema.recalculationRuns).set({ status: failed ? "completed_with_errors" : "completed", processed, failed, errorSummary: errors, finishedAt: new Date() }).where(eq(schema.recalculationRuns.id, run.id));
    return { runId: run.id, processed, failed, errors };
  }
}
