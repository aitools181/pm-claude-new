import { Injectable, Inject } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { coerceFieldValue, serializeValue, type FieldDef } from "./validation.js";
import { FieldSecurityService } from "./field-security.service.js";
import { canAccessWorkItem } from "../collab/access.js";


/**
 * F11/F32 formula fields: a tiny, safe arithmetic evaluator.
 * Grammar: numbers, identifiers (other field keys + item intrinsics
 * story_points, estimate_minutes, progress), + - * / and parentheses.
 * No function calls, no strings, no property access — nothing to inject.
 */
export function evaluateFormula(expression: string, vars: Record<string, number>): number | null {
  const tokens = expression.match(/\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*|[()+\-*/]/g);
  if (!tokens || tokens.join("").replace(/\s/g, "").length !== expression.replace(/\s/g, "").length) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  function primary(): number {
    const t = next();
    if (t === undefined) throw new Error("unexpected end");
    if (t === "(") { const v = expr(); if (next() !== ")") throw new Error("missing )"); return v; }
    if (t === "-") return -primary();
    if (/^\d/.test(t)) return Number(t);
    if (/^[A-Za-z_]/.test(t)) { const v = vars[t.toLowerCase()]; return Number.isFinite(v) ? v : 0; }
    throw new Error(`unexpected token ${t}`);
  }
  function term(): number {
    let v = primary();
    while (peek() === "*" || peek() === "/") { const op = next(); const r = primary(); v = op === "*" ? v * r : (r === 0 ? 0 : v / r); }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") { const op = next(); const r = term(); v = op === "+" ? v + r : v - r; }
    return v;
  }
  try { const out = expr(); return pos === tokens.length && Number.isFinite(out) ? Math.round(out * 100) / 100 : null; }
  catch { return null; }
}

@Injectable()
export class FieldsService {
  constructor(@Inject(DB) private readonly db: Database, private readonly security: FieldSecurityService) {}

  async defineField(organizationId: string, userId: string, input: {
    key: string; name: string; fieldType: string; required?: boolean; visibility?: "all" | "restricted";
    config?: unknown; options?: { value: string; label: string }[]; visibleToRoles?: string[];
  }) {
    return this.db.transaction(async (tx) => {
      const [def] = await tx.insert(schema.customFieldDefinitions).values({
        organizationId, key: input.key, name: input.name, fieldType: input.fieldType,
        required: input.required ?? false, visibility: input.visibility ?? "all", config: input.config, createdBy: userId,
      }).returning();
      if (input.fieldType === "select" && input.options) {
        await tx.insert(schema.customFieldOptions).values(input.options.map((o, i) => ({ organizationId, fieldId: def.id, value: o.value, label: o.label, rank: `r${i}` })));
      }
      if (input.visibility === "restricted" && input.visibleToRoles?.length) {
        await tx.insert(schema.customFieldVisibility).values(input.visibleToRoles.map((roleKey) => ({ organizationId, fieldId: def.id, roleKey })));
      }
      return def;
    });
  }

  list(organizationId: string) {
    return this.db.select().from(schema.customFieldDefinitions)
      .where(and(eq(schema.customFieldDefinitions.organizationId, organizationId), isNull(schema.customFieldDefinitions.archivedAt)));
  }

  private async loadDef(organizationId: string, fieldId: string): Promise<FieldDef & { fieldType: string }> {
    const [d] = await this.db.select().from(schema.customFieldDefinitions)
      .where(and(eq(schema.customFieldDefinitions.id, fieldId), eq(schema.customFieldDefinitions.organizationId, organizationId))).limit(1);
    if (!d) throw new AppError("NOT_FOUND", "Field not found");
    return d as any;
  }

  /** Validate + store a typed value (upsert). */
  async setValue(organizationId: string, userId: string, workItemId: string, fieldId: string, raw: unknown) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
    const def = await this.loadDef(organizationId, fieldId);
    const optionIds = def.fieldType === "select"
      ? new Set((await this.db.select({ id: schema.customFieldOptions.id }).from(schema.customFieldOptions).where(eq(schema.customFieldOptions.fieldId, fieldId))).map((o) => o.id))
      : new Set<string>();
    const coerced = coerceFieldValue(def, raw, optionIds);

    await this.db.insert(schema.customFieldValues)
      .values({ organizationId, workItemId, fieldId, ...coerced, createdBy: userId })
      .onConflictDoUpdate({ target: [schema.customFieldValues.workItemId, schema.customFieldValues.fieldId], set: { ...coerced, updatedBy: userId, updatedAt: new Date() } });
  }

  /** Values and available definitions for a work item, with hidden fields removed for this user.
   *  Returning empty definitions is important for Asana-style task details: a field must be editable
   *  before it has its first value rather than appearing only after data exists. */
  async valuesForItem(organizationId: string, userId: string, workItemId: string) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
    const visible = await this.security.visibleFieldIds(organizationId, userId);
    const [item] = await this.db.select({ typeId: schema.workItems.typeId, projectId: schema.workItems.owningProjectId, storyPoints: schema.workItems.storyPoints, estimateMinutes: schema.workItems.estimateMinutes, progress: schema.workItems.progress })
      .from(schema.workItems).where(and(eq(schema.workItems.organizationId, organizationId), eq(schema.workItems.id, workItemId))).limit(1);
    if (!item) throw new AppError("NOT_FOUND", "Work item not found");

    const [defs, values, options] = await Promise.all([
      this.db.select().from(schema.customFieldDefinitions)
        .where(and(eq(schema.customFieldDefinitions.organizationId, organizationId), isNull(schema.customFieldDefinitions.archivedAt))),
      this.db.select().from(schema.customFieldValues)
        .where(and(eq(schema.customFieldValues.organizationId, organizationId), eq(schema.customFieldValues.workItemId, workItemId))),
      this.db.select().from(schema.customFieldOptions)
        .where(eq(schema.customFieldOptions.organizationId, organizationId)).orderBy(asc(schema.customFieldOptions.rank)),
    ]);
    const byField = new Map(values.map((row) => [row.fieldId, row]));
    const optionsByField = new Map<string, { id: string; value: string; label: string }[]>();
    for (const option of options) {
      const list = optionsByField.get(option.fieldId) ?? [];
      list.push({ id: option.id, value: option.value, label: option.label });
      optionsByField.set(option.fieldId, list);
    }

    const result = defs
      .filter((def) => visible.has(def.id))
      .filter((def) => def.scopeType === "organization" || (def.scopeType === "project" && def.scopeId === item.projectId) || (def.scopeType === "type" && def.scopeId === item.typeId))
      .map((def) => {
        const value = byField.get(def.id);
        return {
          id: def.id, key: def.key, name: def.name, type: def.fieldType, required: def.required,
          value: value ? serializeValue(def, value as any) : (def.fieldType === "checkbox" ? false : null),
          options: optionsByField.get(def.id) ?? [],
        };
      });
    // Second pass: formula fields compute from intrinsics + sibling numeric values.
    const vars: Record<string, number> = {
      story_points: Number(item.storyPoints) || 0,
      estimate_minutes: Number(item.estimateMinutes) || 0,
      estimate_hours: (Number(item.estimateMinutes) || 0) / 60,
      progress: Number(item.progress) || 0,
    };
    for (const f of result) if (f.type === "number" && typeof f.value === "number") vars[f.key.toLowerCase()] = f.value;
    for (const f of result) if (f.type === "formula") {
      const cfg = (defs.find((d) => d.id === f.id)?.config ?? {}) as { expression?: string };
      f.value = cfg.expression ? evaluateFormula(cfg.expression, vars) : null;
    }
    return result;
  }

  /** Export (visible) custom values — same projection used by API/search/activity. */
  export(organizationId: string, userId: string, workItemId: string) { return this.valuesForItem(organizationId, userId, workItemId); }

  // ---- Custom Work Item Types ----
  async defineType(organizationId: string, userId: string, input: { key: string; name: string; icon?: string; parentTypeId?: string; fields?: { fieldId: string; required?: boolean }[] }) {
    return this.db.transaction(async (tx) => {
      const [type] = await tx.insert(schema.workItemTypes).values({ organizationId, key: input.key, name: input.name, icon: input.icon, parentTypeId: input.parentTypeId, isSystem: false, createdBy: userId }).returning();
      if (input.fields?.length) await tx.insert(schema.typeFields).values(input.fields.map((f) => ({ organizationId, typeId: type.id, fieldId: f.fieldId, required: f.required ?? false })));
      return type;
    });
  }

  /** Enforce that all required fields for a type have values on an item. */
  async assertRequiredForType(organizationId: string, typeId: string, workItemId: string) {
    const required = await this.db.select({ fieldId: schema.typeFields.fieldId })
      .from(schema.typeFields).where(and(eq(schema.typeFields.typeId, typeId), eq(schema.typeFields.required, true)));
    if (required.length === 0) return;
    const present = new Set((await this.db.select({ fieldId: schema.customFieldValues.fieldId }).from(schema.customFieldValues).where(eq(schema.customFieldValues.workItemId, workItemId))).map((r) => r.fieldId));
    const missing = required.filter((r) => !present.has(r.fieldId));
    if (missing.length) throw new AppError("VALIDATION", `Missing ${missing.length} required field value(s) for this type`);
  }
}
