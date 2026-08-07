import { Injectable, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { hashPassword } from "../common/crypto.js";
import { seedOrgDefaults } from "../seed/defaults.js";

@Injectable()
export class SetupService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async isCompleted(): Promise<boolean> {
    const [{ count }] = await this.db.select({ count: sql<number>`count(*)::int` }).from(schema.organizations);
    return count > 0;
  }

  /** Creates the first admin + first organization, atomically, exactly once. */
  async run(input: { email: string; password: string; displayName: string; orgName: string; orgSlug: string }) {
    if (await this.isCompleted()) throw new AppError("CONFLICT", "Setup already completed");

    return this.db.transaction(async (tx) => {
      const [user] = await tx.insert(schema.users).values({
        email: input.email.toLowerCase(), displayName: input.displayName, emailVerifiedAt: new Date(),
      }).returning();
      await tx.insert(schema.userCredentials).values({
        userId: user.id, passwordHash: await hashPassword(input.password),
      });
      const [org] = await tx.insert(schema.organizations).values({
        name: input.orgName, slug: input.orgSlug, createdBy: user.id,
      }).returning();
      await tx.insert(schema.organizationSettings).values({ organizationId: org.id });
      await tx.insert(schema.organizationMemberships).values({
        organizationId: org.id, userId: user.id, createdBy: user.id,
      });
      await seedOrgDefaults(tx as unknown as Database, org.id, user.id);
      await tx.insert(schema.userRoleAssignments).values({ organizationId: org.id, userId: user.id, roleKey: "organization_admin", scopeType: "organization" });
      return { userId: user.id, organizationId: org.id };
    });
  }
}
