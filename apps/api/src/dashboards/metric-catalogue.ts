/** Fixed metric catalogue — declarative, visible formulas. No arbitrary SQL (out of scope). */
export type MetricSource = {
  source: string;
  label: string;
  formula: string;          // human-readable, shown in the UI ("formula visible")
  unit: string;
  params: string[];         // accepted param keys
  drillable: boolean;
};

export const METRIC_CATALOGUE: MetricSource[] = [
  { source: "work.done_ratio", label: "Work completion", formula: "count(status = done) / count(all) × 100", unit: "%", params: ["projectId"], drillable: false },
  { source: "work.open_count", label: "Open work items", formula: "count(status ≠ done)", unit: "items", params: ["projectId"], drillable: true },
  { source: "goal.avg_progress", label: "Average goal progress", formula: "avg(goal progress)", unit: "%", params: [], drillable: false },
];

export const catalogueEntry = (source: string) => METRIC_CATALOGUE.find((m) => m.source === source);
