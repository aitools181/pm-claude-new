export type AggregateOperation =
  | "count" | "count_distinct" | "sum" | "average" | "min" | "max"
  | "earliest" | "latest" | "percent_complete" | "status_distribution";

export type AggregateResult = { valueNumber?: number; valueText?: string; valueJson?: unknown };

function finiteNumbers(values: unknown[]): number[] {
  return values.map((v) => typeof v === "number" ? v : Number(v)).filter((v) => Number.isFinite(v));
}

export function aggregate(operation: AggregateOperation, values: unknown[]): AggregateResult {
  const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (operation === "count") return { valueNumber: nonNull.length };
  if (operation === "count_distinct") return { valueNumber: new Set(nonNull.map((v) => JSON.stringify(v))).size };
  if (operation === "status_distribution") {
    const distribution: Record<string, number> = {};
    for (const value of nonNull) distribution[String(value)] = (distribution[String(value)] ?? 0) + 1;
    return { valueJson: distribution };
  }
  if (operation === "percent_complete") {
    if (nonNull.length === 0) return { valueNumber: 0 };
    const done = nonNull.filter((v) => v === true || v === "done" || v === "Done" || Number(v) >= 100).length;
    return { valueNumber: Math.round((done / nonNull.length) * 10000) / 100 };
  }
  if (operation === "earliest" || operation === "latest") {
    const dates = nonNull.map((v) => new Date(String(v))).filter((d) => !Number.isNaN(d.getTime()));
    if (!dates.length) return {};
    const selected = dates.reduce((a, b) => operation === "earliest" ? (a < b ? a : b) : (a > b ? a : b));
    return { valueText: selected.toISOString() };
  }
  const nums = finiteNumbers(nonNull);
  if (!nums.length) return { valueNumber: 0 };
  if (operation === "sum") return { valueNumber: nums.reduce((a, b) => a + b, 0) };
  if (operation === "average") return { valueNumber: nums.reduce((a, b) => a + b, 0) / nums.length };
  if (operation === "min") return { valueNumber: Math.min(...nums) };
  if (operation === "max") return { valueNumber: Math.max(...nums) };
  throw new Error(`Unsupported aggregate operation: ${operation}`);
}
