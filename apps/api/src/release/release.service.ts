import { Injectable, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { APP_VERSION, EXPECTED_MIGRATIONS, CHANGELOG } from "./manifest.js";
import { findSensitiveKey } from "../security/sensitive-fields.js";

@Injectable()
export class ReleaseService {
  constructor(@Inject(DB) private readonly db: Database) {}

  versionInfo() {
    return { appVersion: APP_VERSION, expectedSchema: EXPECTED_MIGRATIONS, node: process.version, startedAt: new Date().toISOString() };
  }

  /** Reads applied migrations from drizzle's tracking table and classifies the deployment. */
  async migrationStatus() {
    let applied = 0; let latest: string | null = null;
    try {
      const res = await this.db.execute(sql`SELECT count(*)::int AS c, max(created_at) AS latest FROM drizzle.__drizzle_migrations`);
      const row = res.rows?.[0] as { c?: number; latest?: string } | undefined;
      applied = Number(row?.c ?? 0); latest = row?.latest ?? null;
    } catch { applied = 0; }
    const pending = Math.max(0, EXPECTED_MIGRATIONS - applied);
    return {
      applied, expected: EXPECTED_MIGRATIONS, latestAppliedAt: latest,
      upToDate: applied >= EXPECTED_MIGRATIONS, pending,
      mode: applied === 0 ? "fresh-install" : pending > 0 ? "upgrade-pending" : "current",
    };
  }

  changelog() { return { current: APP_VERSION, entries: CHANGELOG }; }

  /** Assemble a redacted diagnostic support bundle (never contains secrets). */
  async supportBundle(organizationId: string) {
    const migrations = await this.migrationStatus();
    const projects = await this.db.select({ id: schema.projects.id }).from(schema.projects).where(sql`${schema.projects.organizationId} = ${organizationId}`);
    const workItems = await this.db.execute(sql`SELECT count(*)::int AS c FROM work_items WHERE organization_id = ${organizationId}`);
    const members = await this.db.execute(sql`SELECT count(*)::int AS c FROM organization_memberships WHERE organization_id = ${organizationId}`);
    const bundle = {
      generatedAt: new Date().toISOString(),
      version: this.versionInfo(),
      migrations,
      counts: {
        projects: projects.length,
        workItems: Number((workItems.rows?.[0] as { c?: number })?.c ?? 0),
        members: Number((members.rows?.[0] as { c?: number })?.c ?? 0),
      },
    };
    const leak = findSensitiveKey(bundle);
    if (leak) throw new AppError("VALIDATION", `Support bundle blocked: would expose "${leak}"`);
    return bundle;
  }
}
