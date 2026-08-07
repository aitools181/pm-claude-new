/** Pure capacity math — no DB, fully testable. All minute figures are integers. */

export type AllocationInput = { percent: number; workingDays: number };

export type CapacityBreakdown = {
  workingDays: number;
  holidayDays: number;       // holidays that fell on would-be working days in range
  hoursPerDay: number;
  grossCapacityMin: number;  // working days x hours (calendar already excludes weekends+holidays)
  leaveDays: number;
  leaveMin: number;          // leave on working days
  netCapacityMin: number;    // gross - leave
  allocatedMin: number;      // sum of allocations
  estimatedWorkMin: number;  // sum of estimates on assigned items in range
  unestimatedItems: number;  // assigned items in range WITHOUT an estimate (reported separately)
  utilizationPct: number;    // allocated / net capacity
  overAllocated: boolean;
};

export function computeCapacity(input: {
  workingDays: number; holidayDays: number; hoursPerDay: number;
  leaveDays: number; allocations: AllocationInput[];
  estimatedWorkMin: number; unestimatedItems: number;
}): CapacityBreakdown {
  const perDay = input.hoursPerDay * 60;
  const grossCapacityMin = input.workingDays * perDay;
  const leaveMin = Math.min(grossCapacityMin, input.leaveDays * perDay);
  const netCapacityMin = Math.max(0, grossCapacityMin - leaveMin);
  const allocatedMin = Math.round(input.allocations.reduce((s, a) => s + (a.percent / 100) * a.workingDays * perDay, 0));
  const utilizationPct = netCapacityMin > 0 ? Math.round((allocatedMin / netCapacityMin) * 100) : 0;
  return {
    workingDays: input.workingDays, holidayDays: input.holidayDays, hoursPerDay: input.hoursPerDay,
    grossCapacityMin, leaveDays: input.leaveDays, leaveMin, netCapacityMin,
    allocatedMin, estimatedWorkMin: input.estimatedWorkMin, unestimatedItems: input.unestimatedItems,
    utilizationPct, overAllocated: allocatedMin > netCapacityMin,
  };
}
