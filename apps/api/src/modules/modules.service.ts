import { Injectable, Inject } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

export const OPTIONAL_MODULES = [
  "chat", "whiteboard", "ai", "enterprise_identity", "calculations", "scenarios",
  "migration", "devops", "connected_search", "sandbox", "service_management",
  "discovery", "communications", "productivity", "ai_agents",
] as const;
export type OptionalModule = (typeof OPTIONAL_MODULES)[number];

/** Optional modules are OFF by default and independently enable/disable per org. */
@Injectable()
export class ModulesService {
  constructor(@Inject(DB) private readonly db: Database) {}
  private key(m: string) { return `module:${m}`; }

  async isEnabled(organizationId: string, module: OptionalModule): Promise<boolean> {
    const [row] = await this.db.select().from(schema.featureFlags).where(and(eq(schema.featureFlags.organizationId, organizationId), eq(schema.featureFlags.key, this.key(module)))).limit(1);
    return row?.enabled ?? false;
  }
  async assertEnabled(organizationId: string, module: OptionalModule) {
    if (!(await this.isEnabled(organizationId, module))) throw new AppError("FORBIDDEN", `The ${module} module is disabled`, { code: "module_disabled" });
  }
  async setEnabled(organizationId: string, module: OptionalModule, enabled: boolean, userId: string) {
    if (!OPTIONAL_MODULES.includes(module)) throw new AppError("VALIDATION", "Unknown module");
    const [existing] = await this.db.select().from(schema.featureFlags).where(and(eq(schema.featureFlags.organizationId, organizationId), eq(schema.featureFlags.key, this.key(module)))).limit(1);
    if (existing) await this.db.update(schema.featureFlags).set({ enabled, updatedBy: userId, updatedAt: new Date() }).where(eq(schema.featureFlags.id, existing.id));
    else await this.db.insert(schema.featureFlags).values({ organizationId, key: this.key(module), enabled, createdBy: userId, updatedBy: userId });
    return { module, enabled };
  }
  async list(organizationId: string) {
    const out: Record<string, boolean> = {};
    for (const m of OPTIONAL_MODULES) out[m] = await this.isEnabled(organizationId, m);
    return out;
  }
}
