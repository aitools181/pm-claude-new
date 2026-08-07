import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";

@Injectable()
export class WatchersService {
  constructor(@Inject(DB) private readonly db: Database) {}
  async watch(organizationId: string, workItemId: string, userId: string) {
    await this.db.insert(schema.workItemWatchers).values({ organizationId, workItemId, userId }).onConflictDoNothing();
  }
  async unwatch(organizationId: string, workItemId: string, userId: string) {
    await this.db.delete(schema.workItemWatchers).where(and(
      eq(schema.workItemWatchers.workItemId, workItemId), eq(schema.workItemWatchers.userId, userId), eq(schema.workItemWatchers.organizationId, organizationId)));
  }
}
