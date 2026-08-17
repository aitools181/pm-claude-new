import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "@pm/shared";
import { ENV } from "../config/config.module.js";

const SYSTEM_QUEUE = "system";
const DEAD_LETTER_QUEUE = "system-dead"; // matches apps/worker/src/main.ts DLQ name
const RETENTION_EVERY_MS = 60 * 60 * 1000;
const AI_SUMMARY_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Central producer for durable background work. Keeping queue construction in
 * one service prevents feature modules from inventing Redis/queue settings and
 * makes background behavior observable and testable.
 */
@Injectable()
export class BackgroundJobsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BackgroundJobsService.name);
  private readonly connection: Redis;
  private readonly queue: Queue;
  private readonly deadLetter: Queue;

  constructor(@Inject(ENV) env: Env) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(SYSTEM_QUEUE, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    });
    this.deadLetter = new Queue(DEAD_LETTER_QUEUE, { connection: this.connection });
  }

  async onModuleInit() {
    // A real domain job rather than a ping/no-op: every hour the worker applies
    // organization retention policies that explicitly opted into auto-purge.
    // BullMQ gives each repeat occurrence a distinct job id; the worker folds
    // that id into the idempotency key so retries dedupe while later hours run.
    await this.queue.add(
      "retention-auto-purge",
      { idempotencyKey: "retention-auto-purge", payload: {} },
      { jobId: "retention-auto-purge", repeat: { every: RETENTION_EVERY_MS } },
    );
    this.log.log("Registered hourly retention-auto-purge background job");
    await this.queue.add(
      "ai-project-summary-regular",
      { idempotencyKey: "ai-project-summary-regular", payload: {} },
      { jobId: "ai-project-summary-regular", repeat: { every: AI_SUMMARY_EVERY_MS } },
    );
    this.log.log("Registered daily AI project-summary background job");
  }

  async enqueueRetentionPurge(organizationId: string, actorUserId: string) {
    const nonce = randomUUID();
    const job = await this.queue.add("retention-purge", {
      idempotencyKey: `retention-purge:${organizationId}:${nonce}`,
      organizationId,
      actorUserId,
      payload: { organizationId },
    });
    return { queued: true, jobId: job.id };
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.deadLetter.close();
    await this.connection.quit();
  }

  // ---- X04.4 Job / Queue Administration ----

  /** X04.4.1 — queue dashboard: depth, oldest waiting age, failure rate, scheduled registry, DLQ depth. */
  async queueStats() {
    const [counts, dlqCounts, waiting, scheduled] = await Promise.all([
      this.queue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      this.deadLetter.getJobCounts("waiting", "failed"),
      this.queue.getWaiting(0, 0),
      this.queue.getRepeatableJobs(),
    ]);
    const oldestWaitingAgeMs = waiting[0] ? Date.now() - waiting[0].timestamp : 0;
    const total = (counts.completed ?? 0) + (counts.failed ?? 0);
    const failureRate = total > 0 ? Number((((counts.failed ?? 0) / total) * 100).toFixed(1)) : 0;
    return {
      waiting: counts.waiting ?? 0, active: counts.active ?? 0, completed: counts.completed ?? 0,
      failed: counts.failed ?? 0, delayed: counts.delayed ?? 0,
      oldestWaitingAgeMs, failureRatePercent: failureRate,
      deadLetter: { waiting: dlqCounts.waiting ?? 0, failed: dlqCounts.failed ?? 0 },
      scheduled: scheduled.map((s) => ({ name: s.name, pattern: s.pattern ?? null, every: s.every ?? null, next: s.next ?? null })),
    };
  }

  /** X04.4.2 — per-job list with redacted payload for inspection. */
  async listJobs(status: "waiting" | "active" | "completed" | "failed" | "delayed", limit = 50) {
    const jobs = await this.queue.getJobs([status], 0, limit - 1);
    return jobs.map((j) => ({
      id: j.id, name: j.name, timestamp: j.timestamp, attemptsMade: j.attemptsMade,
      failedReason: j.failedReason ?? null, finishedOn: j.finishedOn ?? null,
      payload: this.redactPayload(j.data as Record<string, unknown>),
    }));
  }

  private redactPayload(data: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data ?? {})) out[k] = /secret|password|token|key/i.test(k) ? "[redacted]" : v;
    return out;
  }

  /** X04.4.2 — retry a specific job by id. */
  async retryJob(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error("Job not found");
    await job.retry();
    return { ok: true };
  }

  /** X04.4.2 — cancel/remove a specific job by id. */
  async cancelJob(jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job) throw new Error("Job not found");
    await job.remove();
    return { ok: true };
  }

  /** X04.4.3 — browse the dead-letter queue. */
  async listDeadLetter(limit = 50) {
    const jobs = await this.deadLetter.getJobs(["waiting", "failed"], 0, limit - 1);
    return jobs.map((j) => ({ id: j.id, name: j.name, timestamp: j.timestamp, payload: this.redactPayload(j.data as Record<string, unknown>) }));
  }

  /** X04.4.3 — re-drive a dead-lettered job back onto the live queue (idempotent: reuses its idempotencyKey). */
  async redriveDeadLetter(jobId: string) {
    const job = await this.deadLetter.getJob(jobId);
    if (!job) throw new Error("Dead-letter job not found");
    const data = job.data as { idempotencyKey?: string; payload?: unknown; organizationId?: string; actorUserId?: string };
    await this.queue.add(job.name, data, data.idempotencyKey ? { jobId: data.idempotencyKey } : undefined);
    await job.remove();
    return { ok: true, redriven: job.name };
  }

  /** X04.4.3 — discard a dead-lettered job with a required reason (audited by the caller). */
  async discardDeadLetter(jobId: string) {
    const job = await this.deadLetter.getJob(jobId);
    if (!job) throw new Error("Dead-letter job not found");
    await job.remove();
    return { ok: true };
  }
}
