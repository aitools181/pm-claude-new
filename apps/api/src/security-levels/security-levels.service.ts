import { Injectable, Inject } from "@nestjs/common";
import { and, eq, asc } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

@Injectable()
export class SecurityLevelsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(organizationId: string, projectId: string) {
    const levels = await this.db.select().from(schema.securityLevels)
      .where(and(eq(schema.securityLevels.organizationId, organizationId), eq(schema.securityLevels.projectId, projectId)))
      .orderBy(asc(schema.securityLevels.rank));
    const grants = await this.db.select().from(schema.securityLevelGrants).where(eq(schema.securityLevelGrants.organizationId, organizationId));
    return levels.map((l) => ({ ...l, grants: grants.filter((g) => g.securityLevelId === l.id) }));
  }

  async create(organizationId: string, projectId: string, input: { name: string; rank?: number }) {
    const [row] = await this.db.insert(schema.securityLevels).values({ organizationId, projectId, name: input.name, rank: input.rank ?? 0 }).returning();
    return row;
  }

  async rename(organizationId: string, id: string, name: string) {
    const [row] = await this.db.update(schema.securityLevels).set({ name })
      .where(and(eq(schema.securityLevels.id, id), eq(schema.securityLevels.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Security level not found");
    return row;
  }

  /** Deleting a level clears it from any work item currently using it — items become unrestricted rather than orphaned. */
  async remove(organizationId: string, id: string) {
    await this.db.transaction(async (tx) => {
      await tx.update(schema.workItems).set({ securityLevelId: null }).where(and(eq(schema.workItems.securityLevelId, id), eq(schema.workItems.organizationId, organizationId)));
      await tx.delete(schema.securityLevelGrants).where(and(eq(schema.securityLevelGrants.securityLevelId, id), eq(schema.securityLevelGrants.organizationId, organizationId)));
      await tx.delete(schema.securityLevels).where(and(eq(schema.securityLevels.id, id), eq(schema.securityLevels.organizationId, organizationId)));
    });
    return { ok: true };
  }

  async addGrant(organizationId: string, securityLevelId: string, input: { granteeType: "user" | "role"; userId?: string; roleKey?: string }) {
    if (input.granteeType === "user" && !input.userId) throw new AppError("VALIDATION", "userId is required for a user grant");
    if (input.granteeType === "role" && !input.roleKey) throw new AppError("VALIDATION", "roleKey is required for a role grant");
    const [row] = await this.db.insert(schema.securityLevelGrants).values({
      organizationId, securityLevelId, granteeType: input.granteeType, userId: input.userId ?? null, roleKey: input.roleKey ?? null,
    }).returning();
    return row;
  }

  async removeGrant(organizationId: string, grantId: string) {
    await this.db.delete(schema.securityLevelGrants).where(and(eq(schema.securityLevelGrants.id, grantId), eq(schema.securityLevelGrants.organizationId, organizationId)));
    return { ok: true };
  }

  /** Applies (or clears, with null) a security level on a work item. Caller is responsible for the usual edit-permission check. */
  async assignToWorkItem(organizationId: string, workItemId: string, securityLevelId: string | null) {
    if (securityLevelId) {
      const [level] = await this.db.select({ id: schema.securityLevels.id }).from(schema.securityLevels)
        .where(and(eq(schema.securityLevels.id, securityLevelId), eq(schema.securityLevels.organizationId, organizationId))).limit(1);
      if (!level) throw new AppError("NOT_FOUND", "Security level not found");
    }
    const [row] = await this.db.update(schema.workItems).set({ securityLevelId })
      .where(and(eq(schema.workItems.id, workItemId), eq(schema.workItems.organizationId, organizationId))).returning({ id: schema.workItems.id, securityLevelId: schema.workItems.securityLevelId });
    if (!row) throw new AppError("NOT_FOUND", "Work item not found");
    return row;
  }
}
