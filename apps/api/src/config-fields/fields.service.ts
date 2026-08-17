import { Injectable, Inject } from "@nestjs/common";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
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
    sensitivity?: "normal" | "sensitive" | "pii" | "financial";
    cascadeParentFieldId?: string | null;
    config?: unknown; options?: { value: string; label: string; parentOptionId?: string | null }[]; visibleToRoles?: string[];
  }) {
    if (input.cascadeParentFieldId) {
      if (input.fieldType !== "select") throw new AppError("VALIDATION", "Only a select field can cascade from a parent field");
      const [parent] = await this.db.select({ id: schema.customFieldDefinitions.id, fieldType: schema.customFieldDefinitions.fieldType }).from(schema.customFieldDefinitions)
        .where(and(eq(schema.customFieldDefinitions.id, input.cascadeParentFieldId), eq(schema.customFieldDefinitions.organizationId, organizationId))).limit(1);
      if (!parent) throw new AppError("NOT_FOUND", "Cascade parent field not found");
      if (parent.fieldType !== "select") throw new AppError("VALIDATION", "A cascading field's parent must also be a select field");
    }
    return this.db.transaction(async (tx) => {
      const [def] = await tx.insert(schema.customFieldDefinitions).values({
        organizationId, key: input.key, name: input.name, fieldType: input.fieldType,
        required: input.required ?? false, visibility: input.visibility ?? "all", sensitivity: input.sensitivity ?? "normal",
        cascadeParentFieldId: input.cascadeParentFieldId ?? null, config: input.config, createdBy: userId,
      }).returning();
      if (input.fieldType === "select" && input.options) {
        await tx.insert(schema.customFieldOptions).values(input.options.map((o, i) => ({ organizationId, fieldId: def.id, value: o.value, label: o.label, rank: `r${i}`, parentOptionId: o.parentOptionId ?? null })));
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

  /** A select field's own options — used by the field builder to let an admin pick which parent option a cascading child option belongs under. */
  optionsForField(organizationId: string, fieldId: string) {
    return this.db.select().from(schema.customFieldOptions)
      .where(and(eq(schema.customFieldOptions.organizationId, organizationId), eq(schema.customFieldOptions.fieldId, fieldId)))
      .orderBy(asc(schema.customFieldOptions.rank));
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
    let optionIds = def.fieldType === "select"
      ? new Set((await this.db.select({ id: schema.customFieldOptions.id }).from(schema.customFieldOptions).where(eq(schema.customFieldOptions.fieldId, fieldId))).map((o) => o.id))
      : new Set<string>();

    // FIELD.D2 — a cascading child field can only be set to an option that's
    // valid under the parent field's *current* value on this same work item.
    if (def.fieldType === "select" && def.cascadeParentFieldId) {
      const [parentValue] = await this.db.select({ valueOptionId: schema.customFieldValues.valueOptionId }).from(schema.customFieldValues)
        .where(and(eq(schema.customFieldValues.organizationId, organizationId), eq(schema.customFieldValues.workItemId, workItemId), eq(schema.customFieldValues.fieldId, def.cascadeParentFieldId))).limit(1);
      const allOptions = await this.db.select({ id: schema.customFieldOptions.id, parentOptionId: schema.customFieldOptions.parentOptionId }).from(schema.customFieldOptions).where(eq(schema.customFieldOptions.fieldId, fieldId));
      const allowedIds = new Set(allOptions.filter((o) => o.parentOptionId === null || o.parentOptionId === (parentValue?.valueOptionId ?? null)).map((o) => o.id));
      optionIds = new Set([...optionIds].filter((id) => allowedIds.has(id)));
    }

    const coerced = coerceFieldValue(def, raw, optionIds);

    await this.db.insert(schema.customFieldValues)
      .values({ organizationId, workItemId, fieldId, ...coerced, createdBy: userId })
      .onConflictDoUpdate({ target: [schema.customFieldValues.workItemId, schema.customFieldValues.fieldId], set: { ...coerced, updatedBy: userId, updatedAt: new Date() } });

    // If this field is itself a cascade *parent*, any child field whose
    // currently-stored value no longer fits under the new parent value is
    // cleared, so the item never retains a stale/invalid child selection.
    if (def.fieldType === "select") {
      const children = await this.db.select().from(schema.customFieldDefinitions)
        .where(and(eq(schema.customFieldDefinitions.organizationId, organizationId), eq(schema.customFieldDefinitions.cascadeParentFieldId, fieldId), isNull(schema.customFieldDefinitions.archivedAt)));
      const newParentOptionId = (coerced as { valueOptionId?: string | null }).valueOptionId ?? null;
      for (const child of children) {
        const [childValue] = await this.db.select().from(schema.customFieldValues)
          .where(and(eq(schema.customFieldValues.organizationId, organizationId), eq(schema.customFieldValues.workItemId, workItemId), eq(schema.customFieldValues.fieldId, child.id))).limit(1);
        if (!childValue?.valueOptionId) continue;
        const [childOption] = await this.db.select({ parentOptionId: schema.customFieldOptions.parentOptionId }).from(schema.customFieldOptions).where(eq(schema.customFieldOptions.id, childValue.valueOptionId)).limit(1);
        const stillValid = childOption && (childOption.parentOptionId === null || childOption.parentOptionId === newParentOptionId);
        if (!stillValid) await this.db.delete(schema.customFieldValues).where(eq(schema.customFieldValues.id, childValue.id));
      }
    }
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
    const optionsByField = new Map<string, { id: string; value: string; label: string; parentOptionId: string | null }[]>();
    for (const option of options) {
      const list = optionsByField.get(option.fieldId) ?? [];
      list.push({ id: option.id, value: option.value, label: option.label, parentOptionId: option.parentOptionId ?? null });
      optionsByField.set(option.fieldId, list);
    }

    const result = defs
      .filter((def) => visible.has(def.id))
      .filter((def) => def.scopeType === "organization" || (def.scopeType === "project" && def.scopeId === item.projectId) || (def.scopeType === "type" && def.scopeId === item.typeId))
      .map((def) => {
        const value = byField.get(def.id);
        const rawValue = value ? serializeValue(def, value as any) : (def.fieldType === "checkbox" ? false : null);
        // SEC.D2 — anything above "normal" sensitivity is masked by default;
        // the caller must hit the reveal endpoint (audited) to see it.
        const masked = def.sensitivity !== "normal" && rawValue != null && rawValue !== "";
        // FIELD.D2 — a cascading field only offers options valid under the
        // parent field's current value (plus ungrouped, parent-less options).
        let options = optionsByField.get(def.id) ?? [];
        if (def.fieldType === "select" && def.cascadeParentFieldId) {
          const parentValue = byField.get(def.cascadeParentFieldId)?.valueOptionId ?? null;
          options = options.filter((o) => o.parentOptionId === null || o.parentOptionId === parentValue);
        }
        return {
          id: def.id, key: def.key, name: def.name, type: def.fieldType, required: def.required,
          sensitivity: def.sensitivity, masked, cascadeParentFieldId: def.cascadeParentFieldId ?? null,
          value: masked ? null : rawValue,
          options,
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

  /**
   * SEC.D2 — the only way to see a masked (sensitive/pii/financial) field
   * value: checks the same visibility/access rules valuesForItem uses, then
   * writes an audit row before returning the real value. Never skip the
   * audit write, even on a repeat reveal within the same session — each
   * reveal is a distinct event.
   */
  async revealValue(organizationId: string, userId: string, workItemId: string, fieldId: string) {
    if (!(await canAccessWorkItem(this.db, organizationId, workItemId, userId))) throw new AppError("FORBIDDEN", "No access to this work item");
    const visible = await this.security.visibleFieldIds(organizationId, userId);
    if (!visible.has(fieldId)) throw new AppError("FORBIDDEN", "You do not have access to this field");
    const [def] = await this.db.select().from(schema.customFieldDefinitions)
      .where(and(eq(schema.customFieldDefinitions.id, fieldId), eq(schema.customFieldDefinitions.organizationId, organizationId), isNull(schema.customFieldDefinitions.archivedAt))).limit(1);
    if (!def) throw new AppError("NOT_FOUND", "Field not found");
    const [row] = await this.db.select().from(schema.customFieldValues)
      .where(and(eq(schema.customFieldValues.organizationId, organizationId), eq(schema.customFieldValues.workItemId, workItemId), eq(schema.customFieldValues.fieldId, fieldId))).limit(1);
    await this.db.insert(schema.fieldRevealAudit).values({ organizationId, fieldId, workItemId, userId });
    return { value: row ? serializeValue(def, row as any) : null, sensitivity: def.sensitivity };
  }

  /** Reveal history for a field on a work item — visible to anyone who could reveal it, for accountability. */
  revealHistory(organizationId: string, fieldId: string, workItemId: string) {
    return this.db.select({ userId: schema.fieldRevealAudit.userId, revealedAt: schema.fieldRevealAudit.revealedAt })
      .from(schema.fieldRevealAudit)
      .where(and(eq(schema.fieldRevealAudit.organizationId, organizationId), eq(schema.fieldRevealAudit.fieldId, fieldId), eq(schema.fieldRevealAudit.workItemId, workItemId)))
      .orderBy(desc(schema.fieldRevealAudit.revealedAt)).limit(50);
  }

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
