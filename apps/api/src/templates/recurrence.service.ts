import { Injectable, Inject } from "@nestjs/common";
import { and, eq, lte } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { WorkItemsService } from "../work/work-items.service.js";

/** Local calendar date (YYYY-MM-DD) in a given IANA timezone. */
function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function advance(from: Date, frequency: string, interval: number): Date {
  const d = new Date(from);
  if (frequency === "daily") d.setUTCDate(d.getUTCDate() + interval);
  else if (frequency === "weekly") d.setUTCDate(d.getUTCDate() + 7 * interval);
  else if (frequency === "monthly") d.setUTCMonth(d.getUTCMonth() + interval);
  return d;
}

@Injectable()
export class RecurrenceService {
  constructor(@Inject(DB) private readonly db: Database, private readonly items: WorkItemsService) {}

  async createRule(organizationId: string, userId: string, input: { name: string; spec: any; frequency: string; interval?: number; timezone?: string; firstRunAt: string }) {
    const [rule] = await this.db.insert(schema.recurringRules).values({
      organizationId, name: input.name, spec: input.spec, frequency: input.frequency,
      interval: input.interval ?? 1, timezone: input.timezone ?? "UTC", nextRunAt: new Date(input.firstRunAt), createdBy: userId,
    }).returning();
    return rule;
  }

  /**
   * Generate due occurrences. Each occurrence is UNIQUE per (rule, tz-local date),
   * so re-running the generator never produces a duplicate.
   */
  async generateDue(organizationId: string, now: Date) {
    const due = await this.db.select().from(schema.recurringRules)
      .where(and(eq(schema.recurringRules.organizationId, organizationId), eq(schema.recurringRules.active, true), lte(schema.recurringRules.nextRunAt, now)));
    const created: string[] = [];
    for (const rule of due) {
      const key = localDate(rule.nextRunAt, rule.timezone); // timezone-correct occurrence key
      const spec = rule.spec as any;
      const [occ] = await this.db.insert(schema.recurrenceOccurrences)
        .values({ organizationId, ruleId: rule.id, occurrenceKey: key })
        .onConflictDoNothing({ target: [schema.recurrenceOccurrences.ruleId, schema.recurrenceOccurrences.occurrenceKey] }).returning();
      if (occ) {
        const item = await this.items.create(organizationId, rule.createdBy ?? spec.userId, { projectId: spec.projectId, title: `${spec.title} (${key})`, priority: spec.priority });
        await this.db.update(schema.recurrenceOccurrences).set({ workItemId: item.id }).where(eq(schema.recurrenceOccurrences.id, occ.id));
        created.push(item.id);
      }
      await this.db.update(schema.recurringRules).set({ nextRunAt: advance(rule.nextRunAt, rule.frequency, rule.interval) }).where(eq(schema.recurringRules.id, rule.id));
    }
    return { created };
  }

  occurrenceKeyFor(nextRunAt: Date, timezone: string) { return localDate(nextRunAt, timezone); }
  list(organizationId: string) { return this.db.select().from(schema.recurringRules).where(eq(schema.recurringRules.organizationId, organizationId)); }
}
