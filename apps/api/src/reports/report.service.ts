import { Injectable, Inject, Optional } from "@nestjs/common";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { DELIVERER, type Deliverer } from "./deliverer.js";
import { DashboardService } from "../dashboards/dashboard.service.js";
import { PortfolioService } from "../portfolios/portfolio.service.js";
import { MetricService } from "../dashboards/metric.service.js";

const BACKOFF_SECONDS = 60;

@Injectable()
export class ReportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(DELIVERER) private readonly deliverer: Deliverer,
    @Optional() private readonly dashboards?: DashboardService,
    @Optional() private readonly portfolios?: PortfolioService,
    @Optional() private readonly metrics?: MetricService,
  ) {}

  private periodMs(freq: string) { return freq === "daily" ? 864e5 : freq === "monthly" ? 30 * 864e5 : 7 * 864e5; }

  createDefinition(organizationId: string, userId: string, input: { name: string; kind: string; refId: string; format?: string; frequency?: string; recipients: string[]; nextRunAt?: string }) {
    return this.db.insert(schema.reportDefinitions).values({
      organizationId, name: input.name, kind: input.kind, refId: input.refId, format: input.format ?? "json",
      frequency: input.frequency ?? "weekly", recipients: input.recipients, ownerUserId: userId,
      nextRunAt: input.nextRunAt ? new Date(input.nextRunAt) : new Date(),
    }).returning().then((r) => r[0]);
  }
  listDefinitions(organizationId: string) {
    return this.db.select().from(schema.reportDefinitions).where(eq(schema.reportDefinitions.organizationId, organizationId)).orderBy(schema.reportDefinitions.createdAt);
  }

  /** Build the report body from its source. */
  private async generate(organizationId: string, def: typeof schema.reportDefinitions.$inferSelect): Promise<string> {
    let data: unknown = { note: "generated" };
    if (def.kind === "dashboard" && this.dashboards) data = await this.dashboards.render(organizationId, def.ownerUserId, def.refId);
    else if (def.kind === "portfolio" && this.portfolios) data = await this.portfolios.rollup(organizationId, def.ownerUserId, def.refId);
    else if (def.kind === "metric" && this.metrics) data = await this.metrics.snapshot(organizationId, def.refId, {});
    return JSON.stringify(data);
  }

  /** One delivery attempt: generate, deliver to all recipients, log everything, schedule retry on failure. */
  private async attempt(organizationId: string, def: typeof schema.reportDefinitions.$inferSelect, run: typeof schema.reportRuns.$inferSelect) {
    const attempt = run.attempt + 1;
    await this.db.update(schema.reportRuns).set({ status: "running", attempt, startedAt: new Date() }).where(eq(schema.reportRuns.id, run.id));
    const recipients = (def.recipients as string[]) ?? [];
    try {
      const content = await this.generate(organizationId, def);
      await this.deliverer.deliver(recipients, def.name, content);
      await this.db.transaction(async (tx) => {
        for (const rcpt of recipients) await tx.insert(schema.reportDeliveries).values({ organizationId, runId: run.id, recipient: rcpt, status: "delivered" });
        await tx.update(schema.reportRuns).set({ status: "delivered", finishedAt: new Date(), error: null, nextRetryAt: null, contentSummary: { bytes: content.length, format: def.format } }).where(eq(schema.reportRuns.id, run.id));
      });
      return { status: "delivered", attempt };
    } catch (e) {
      const error = e instanceof Error ? e.message : "delivery failed";
      const willRetry = attempt < run.maxAttempts;
      await this.db.transaction(async (tx) => {
        for (const rcpt of recipients) await tx.insert(schema.reportDeliveries).values({ organizationId, runId: run.id, recipient: rcpt, status: "failed", error });
        await tx.update(schema.reportRuns).set({
          status: willRetry ? "retry_scheduled" : "failed", error,
          nextRetryAt: willRetry ? new Date(Date.now() + BACKOFF_SECONDS * 1000 * attempt) : null,
          finishedAt: willRetry ? null : new Date(),
        }).where(eq(schema.reportRuns.id, run.id));
      });
      return { status: willRetry ? "retry_scheduled" : "failed", attempt, error };
    }
  }

  /** Run a report now (creates a fresh run). */
  async runNow(organizationId: string, reportId: string) {
    const [def] = await this.db.select().from(schema.reportDefinitions).where(and(eq(schema.reportDefinitions.id, reportId), eq(schema.reportDefinitions.organizationId, organizationId))).limit(1);
    if (!def) throw new AppError("NOT_FOUND", "Report not found");
    const [run] = await this.db.insert(schema.reportRuns).values({ organizationId, reportId, status: "pending", attempt: 0 }).returning();
    return this.attempt(organizationId, def, run);
  }

  /** Retry a failed/scheduled run (re-attempts the same run row). */
  async retry(organizationId: string, runId: string) {
    const [run] = await this.db.select().from(schema.reportRuns).where(and(eq(schema.reportRuns.id, runId), eq(schema.reportRuns.organizationId, organizationId))).limit(1);
    if (!run) throw new AppError("NOT_FOUND", "Run not found");
    if (!["retry_scheduled", "failed"].includes(run.status)) throw new AppError("CONFLICT", `Run is ${run.status}`);
    if (run.attempt >= run.maxAttempts) throw new AppError("CONFLICT", "Max attempts reached");
    const [def] = await this.db.select().from(schema.reportDefinitions).where(eq(schema.reportDefinitions.id, run.reportId)).limit(1);
    return this.attempt(organizationId, def, run);
  }

  /** Scheduler: run all definitions whose next run is due; advance their schedule. */
  async runDue(organizationId: string, now: Date = new Date()) {
    const due = await this.db.select().from(schema.reportDefinitions)
      .where(and(eq(schema.reportDefinitions.organizationId, organizationId), eq(schema.reportDefinitions.enabled, true), lte(schema.reportDefinitions.nextRunAt, now)));
    const results = [];
    for (const def of due) {
      const [run] = await this.db.insert(schema.reportRuns).values({ organizationId, reportId: def.id, status: "pending", attempt: 0 }).returning();
      const res = await this.attempt(organizationId, def, run);
      await this.db.update(schema.reportDefinitions).set({ lastRunAt: now, nextRunAt: new Date(now.getTime() + this.periodMs(def.frequency)) }).where(eq(schema.reportDefinitions.id, def.id));
      results.push({ reportId: def.id, ...res });
    }
    return { ran: results.length, results };
  }

  /** Scheduler: re-attempt runs whose retry time has arrived. */
  async retryDue(organizationId: string, now: Date = new Date()) {
    const due = await this.db.select().from(schema.reportRuns)
      .where(and(eq(schema.reportRuns.organizationId, organizationId), eq(schema.reportRuns.status, "retry_scheduled"), lte(schema.reportRuns.nextRetryAt, now)));
    const results = [];
    for (const run of due) results.push(await this.retry(organizationId, run.id));
    return { retried: results.length, results };
  }

  history(organizationId: string, reportId: string) {
    return this.db.select().from(schema.reportRuns).where(and(eq(schema.reportRuns.organizationId, organizationId), eq(schema.reportRuns.reportId, reportId))).orderBy(desc(schema.reportRuns.createdAt));
  }
  deliveries(organizationId: string, runId: string) {
    return this.db.select().from(schema.reportDeliveries).where(and(eq(schema.reportDeliveries.organizationId, organizationId), eq(schema.reportDeliveries.runId, runId))).orderBy(asc(schema.reportDeliveries.at));
  }
}
