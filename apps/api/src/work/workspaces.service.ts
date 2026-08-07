import { Injectable, Inject } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { DB } from "../db/db.module.js";

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(organizationId: string, userId: string, name: string) {
    return this.db.transaction(async (tx) => {
      const [ws] = await tx.insert(schema.workspaces).values({ organizationId, name, createdBy: userId }).returning();
      await tx.insert(schema.workspaceMembers).values({ organizationId, workspaceId: ws.id, userId, createdBy: userId });
      return ws;
    });
  }

  list(organizationId: string) {
    return this.db.select().from(schema.workspaces)
      .where(and(eq(schema.workspaces.organizationId, organizationId), isNull(schema.workspaces.deletedAt)));
  }
}
