/** Pure form branching + routing logic — no DB, fully testable. */

export type Condition = { fieldKey: string; op: "eq" | "ne" | "in" | "truthy" | "gt" | "lt"; value?: unknown };
export type FormField = { key: string; label: string; type: string; required?: boolean; options?: string[]; visibleWhen?: Condition | Condition[] };
export type RoutingRule = { when?: Condition | Condition[]; projectId?: string; typeId?: string; titleTemplate?: string };
export type Answers = Record<string, unknown>;

export function evalCondition(c: Condition, answers: Answers): boolean {
  const v = answers[c.fieldKey];
  switch (c.op) {
    case "eq": return v === c.value;
    case "ne": return v !== c.value;
    case "in": return Array.isArray(c.value) && (c.value as unknown[]).includes(v);
    case "truthy": return !!v;
    case "gt": return typeof v === "number" && typeof c.value === "number" && v > c.value;
    case "lt": return typeof v === "number" && typeof c.value === "number" && v < c.value;
    default: return false;
  }
}
export function evalConditions(when: Condition | Condition[] | undefined, answers: Answers): boolean {
  if (!when) return true;
  const list = Array.isArray(when) ? when : [when];
  return list.every((c) => evalCondition(c, answers)); // AND
}

/** Keys of fields currently visible given the answers. */
export function visibleFieldKeys(fields: FormField[], answers: Answers): Set<string> {
  return new Set(fields.filter((f) => evalConditions(f.visibleWhen, answers)).map((f) => f.key));
}

/** Required visible fields that are missing. */
export function missingRequired(fields: FormField[], answers: Answers): string[] {
  const visible = visibleFieldKeys(fields, answers);
  return fields
    .filter((f) => f.required && visible.has(f.key))
    .filter((f) => { const v = answers[f.key]; return v === undefined || v === null || v === ""; })
    .map((f) => f.key);
}

/** Pick the first matching routing rule; fall back to defaults. */
export function selectRoute(rules: RoutingRule[], answers: Answers, fallback: { projectId?: string; typeId?: string }): { projectId?: string; typeId?: string; titleTemplate?: string } | null {
  for (const r of rules) if (evalConditions(r.when, answers)) return { projectId: r.projectId ?? fallback.projectId, typeId: r.typeId ?? fallback.typeId, titleTemplate: r.titleTemplate };
  if (fallback.projectId) return { projectId: fallback.projectId, typeId: fallback.typeId };
  return null;
}

/** Interpolate {fieldKey} tokens in a template from answers. */
export function interpolate(template: string, answers: Answers): string {
  return template.replace(/\{([^}]+)\}/g, (_, k) => { const v = answers[k.trim()]; return v == null ? "" : String(v); });
}
