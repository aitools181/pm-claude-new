import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";

/** Org flag wins over instance default; unset => false. */
@Injectable()
export class FeatureFlagsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async isEnabled(key: string, organizationId?: string): Promise<boolean> {
    if (organizationId) {
      const [orgFlag] = await this.db.select().from(schema.featureFlags)
        .where(and(eq(schema.featureFlags.key, key), eq(schema.featureFlags.organizationId, organizationId))).limit(1);
      if (orgFlag) return orgFlag.enabled;
    }
    const [global] = await this.db.select().from(schema.featureFlags)
      .where(and(eq(schema.featureFlags.key, key), isNull(schema.featureFlags.organizationId))).limit(1);
    return global?.enabled ?? false;
  }

  async set(key: string, enabled: boolean, organizationId: string | null, actorUserId: string) {
    const [existing] = await this.db.select().from(schema.featureFlags)
      .where(and(eq(schema.featureFlags.key, key), organizationId === null ? isNull(schema.featureFlags.organizationId) : eq(schema.featureFlags.organizationId, organizationId))).limit(1);
    if (existing) {
      await this.db.update(schema.featureFlags).set({ enabled, updatedBy: actorUserId, updatedAt: new Date() }).where(eq(schema.featureFlags.id, existing.id));
    } else {
      await this.db.insert(schema.featureFlags).values({ key, enabled, organizationId, createdBy: actorUserId });
    }
  }

  listForOrg(organizationId: string) {
    return this.db.select().from(schema.featureFlags)
      .where(sql`organization_id = ${organizationId} OR organization_id IS NULL`);
  }
}
