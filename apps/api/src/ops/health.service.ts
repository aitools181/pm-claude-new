import { Injectable, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { type Database } from "@pm/db";
import { DB } from "../db/db.module.js";
import { Redis } from "ioredis";

type Check = { name: string; ok: boolean; detail?: string };

@Injectable()
export class HealthService {
  private redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", { maxRetriesPerRequest: 1, lazyConnect: true });
  constructor(@Inject(DB) private readonly db: Database) {}

  async readiness(): Promise<{ status: "ready" | "degraded"; checks: Check[] }> {
    const checks: Check[] = [];
    checks.push(await this.probe("database", async () => { await this.db.execute(sql`SELECT 1`); }));
    checks.push(await this.probe("redis", async () => { await this.redis.connect().catch(() => {}); await this.redis.ping(); }));
    const ok = checks.every((c) => c.ok);
    return { status: ok ? "ready" : "degraded", checks };
  }

  private async probe(name: string, fn: () => Promise<void>): Promise<Check> {
    try { await fn(); return { name, ok: true }; }
    catch (e) { return { name, ok: false, detail: (e as Error).message }; }
  }
}
