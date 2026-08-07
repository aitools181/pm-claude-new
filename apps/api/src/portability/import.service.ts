import { Injectable, Inject } from "@nestjs/common";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { WorkItemsService } from "../work/work-items.service.js";

/** Minimal CSV parser (comma-delimited, quoted fields). Foundation; XLSX plugs in via SheetJS. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const split = (line: string) => line.match(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)?.slice(0, -1).map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')) ?? [];
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => { const cells = split(l); const row: Record<string, string> = {}; headers.forEach((h, i) => (row[h] = cells[i] ?? "")); return row; });
}

type Mapping = Record<string, string>; // { targetField: sourceColumn }

@Injectable()
export class ImportService {
  constructor(@Inject(DB) private readonly db: Database, private readonly items: WorkItemsService) {}

  private validateRow(row: Record<string, any>, mapping: Mapping): { data?: { title: string; priority?: string }; error?: string } {
    const title = String(row[mapping.title] ?? "").trim();
    if (!title) return { error: "title is required" };
    const priority = mapping.priority ? String(row[mapping.priority] ?? "").trim() || undefined : undefined;
    if (priority && !["low", "normal", "high", "urgent"].includes(priority)) return { error: `invalid priority "${priority}"` };
    return { data: { title, priority } };
  }

  /** Dry run: validate every row, produce an error report, insert NOTHING. */
  async dryRun(organizationId: string, rows: Record<string, any>[], mapping: Mapping) {
    const errors: { row: number; message: string }[] = [];
    let valid = 0;
    rows.forEach((r, i) => { const v = this.validateRow(r, mapping); v.error ? errors.push({ row: i + 1, message: v.error }) : valid++; });
    const [job] = await this.db.insert(schema.importJobs).values({ organizationId, entityType: "work_items", status: "dry_run", total: rows.length, inserted: 0, failed: errors.length, errorReport: errors }).returning();
    return { jobId: job.id, total: rows.length, valid, errors };
  }

  /** Real import: insert valid rows in a transaction; invalid rows go to the error report. */
  async run(organizationId: string, userId: string, projectId: string, rows: Record<string, any>[], mapping: Mapping) {
    const errors: { row: number; message: string }[] = [];
    let inserted = 0;
    await this.db.transaction(async () => {
      for (let i = 0; i < rows.length; i++) {
        const v = this.validateRow(rows[i], mapping);
        if (v.error) { errors.push({ row: i + 1, message: v.error }); continue; }
        await this.items.create(organizationId, userId, { projectId, title: v.data!.title, priority: v.data!.priority });
        inserted++;
      }
    });
    const [job] = await this.db.insert(schema.importJobs).values({ organizationId, entityType: "work_items", status: errors.length && !inserted ? "failed" : "completed", total: rows.length, inserted, failed: errors.length, errorReport: errors }).returning();
    return { jobId: job.id, inserted, failed: errors.length, errors };
  }
}
