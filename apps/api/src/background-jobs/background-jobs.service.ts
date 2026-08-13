import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Env } from "@pm/shared";
import { ENV } from "../config/config.module.js";

const SYSTEM_QUEUE = "system";
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
    await this.connection.quit();
  }
}
