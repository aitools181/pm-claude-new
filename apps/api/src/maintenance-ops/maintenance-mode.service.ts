import { Injectable, Inject } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";

/** Instance-wide maintenance flag. When active, all mutations are blocked. */
@Injectable()
export class MaintenanceModeService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async isActive(): Promise<boolean> {
    const [row] = await this.db.select().from(schema.maintenanceMode).where(eq(schema.maintenanceMode.id, "singleton")).limit(1);
    return !!row?.active;
  }

  async status() {
    const [row] = await this.db.select().from(schema.maintenanceMode).where(eq(schema.maintenanceMode.id, "singleton")).limit(1);
    return row ?? { id: "singleton", active: false, reason: null, startedBy: null, startedAt: null };
  }

  async enter(reason: string, startedBy: string) {
    await this.db.insert(schema.maintenanceMode)
      .values({ id: "singleton", active: true, reason, startedBy, startedAt: new Date() })
      .onConflictDoUpdate({ target: schema.maintenanceMode.id, set: { active: true, reason, startedBy, startedAt: new Date() } });
  }

  async exit() {
    await this.db.insert(schema.maintenanceMode)
      .values({ id: "singleton", active: false, reason: null, startedBy: null, startedAt: null })
      .onConflictDoUpdate({ target: schema.maintenanceMode.id, set: { active: false, reason: null } });
  }
}
