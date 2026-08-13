import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { type Database } from "@pm/db";
import type { Env } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { ENV } from "../config/config.module.js";
import { Redis } from "ioredis";
import { StorageGateway } from "../files/storage.gateway.js";

type Check = { name: string; ok: boolean; detail?: string };

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
    private readonly storage: StorageGateway,
  ) {
    this.redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
  }

  async readiness(): Promise<{ status: "ready" | "degraded"; checks: Check[] }> {
    const checks: Check[] = [];
    checks.push(await this.probe("database", async () => { await this.db.execute(sql`SELECT 1`); }));
    checks.push(await this.probe("redis", async () => {
      if (this.redis.status === "wait") await this.redis.connect();
      await this.redis.ping();
    }));
    checks.push(await this.probe("storage", async () => { await this.storage.healthCheck(); }));
    const ok = checks.every((c) => c.ok);
    return { status: ok ? "ready" : "degraded", checks };
  }

  async onModuleDestroy() {
    if (this.redis.status !== "end") await this.redis.quit().catch(() => this.redis.disconnect());
  }

  private async probe(name: string, fn: () => Promise<void>): Promise<Check> {
    try { await fn(); return { name, ok: true }; }
    catch (e) { return { name, ok: false, detail: e instanceof Error ? e.message : "unknown error" }; }
  }
}
