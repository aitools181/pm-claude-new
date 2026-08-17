import { AppError } from "@pm/shared";

export type FieldDef = { id: string; key: string; fieldType: string; required: boolean; config: any; cascadeParentFieldId?: string | null };
export type Coerced = {
  valueText?: string | null; valueNumber?: number | null; valueDate?: string | null;
  valueBool?: boolean | null; valueUserId?: string | null; valueOptionId?: string | null;
};

/** Validate a raw value against a field definition; return the typed column to store. */
export function coerceFieldValue(def: FieldDef, raw: unknown, optionIds: Set<string>): Coerced {
  const cfg = def.config ?? {};
  const empty = raw === null || raw === undefined || raw === "";
  if (empty) {
    if (def.required) throw new AppError("VALIDATION", `Field "${def.key}" is required`);
    return clear();
  }
  switch (def.fieldType) {
    case "text": {
      const v = String(raw);
      if (cfg.maxLength && v.length > cfg.maxLength) throw new AppError("VALIDATION", `"${def.key}" exceeds ${cfg.maxLength} characters`);
      if (cfg.pattern && !new RegExp(cfg.pattern).test(v)) throw new AppError("VALIDATION", `"${def.key}" does not match the required format`);
      return { ...clear(), valueText: v };
    }
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new AppError("VALIDATION", `"${def.key}" must be a number`);
      if (cfg.min != null && n < cfg.min) throw new AppError("VALIDATION", `"${def.key}" must be ≥ ${cfg.min}`);
      if (cfg.max != null && n > cfg.max) throw new AppError("VALIDATION", `"${def.key}" must be ≤ ${cfg.max}`);
      return { ...clear(), valueNumber: n };
    }
    case "date": {
      const d = new Date(String(raw));
      if (isNaN(d.getTime())) throw new AppError("VALIDATION", `"${def.key}" must be a valid date`);
      return { ...clear(), valueDate: String(raw).slice(0, 10) };
    }
    case "checkbox":
      return { ...clear(), valueBool: raw === true || raw === "true" };
    case "url": {
      try { new URL(String(raw)); } catch { throw new AppError("VALIDATION", `"${def.key}" must be a valid URL`); }
      return { ...clear(), valueText: String(raw) };
    }
    case "user":
      return { ...clear(), valueUserId: String(raw) };
    case "select": {
      if (!optionIds.has(String(raw))) throw new AppError("VALIDATION", `"${def.key}" has an invalid option`);
      return { ...clear(), valueOptionId: String(raw) };
    }
    default:
      throw new AppError("VALIDATION", `Unknown field type: ${def.fieldType}`);
  }
}

function clear(): Coerced {
  return { valueText: null, valueNumber: null, valueDate: null, valueBool: null, valueUserId: null, valueOptionId: null };
}

/** Serialize a stored value row into a single scalar for API/export. */
export function serializeValue(def: { fieldType: string }, row: Coerced): unknown {
  switch (def.fieldType) {
    case "number": return row.valueNumber ?? null;
    case "date": return row.valueDate ?? null;
    case "checkbox": return row.valueBool ?? false;
    case "user": return row.valueUserId ?? null;
    case "select": return row.valueOptionId ?? null;
    default: return row.valueText ?? null;
  }
}
