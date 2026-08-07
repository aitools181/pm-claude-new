import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";

@Injectable()
export class TimeReportsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Aggregated time within a date range, optionally filtered by user or project. */
  async report(organizationId: string, f: { from: string; to: string; userId?: string; projectId?: string }) {
    const conds = [eq(schema.timeEntries.organizationId, organizationId), gte(schema.timeEntries.date, f.from), lte(schema.timeEntries.date, f.to)];
    if (f.userId) conds.push(eq(schema.timeEntries.userId, f.userId));
    if (f.projectId) conds.push(eq(schema.timeEntries.projectId, f.projectId));
    const rows = await this.db.select({
      userId: schema.timeEntries.userId, projectId: schema.timeEntries.projectId,
      minutes: sql<number>`sum(${schema.timeEntries.minutes})::int`,
      billable: sql<number>`sum(case when ${schema.timeEntries.billable} then ${schema.timeEntries.minutes} else 0 end)::int`,
    }).from(schema.timeEntries).where(and(...conds))
      .groupBy(schema.timeEntries.userId, schema.timeEntries.projectId);
    const totalMinutes = rows.reduce((s, r) => s + (r.minutes ?? 0), 0);
    return { from: f.from, to: f.to, totalMinutes, rows };
  }
}
