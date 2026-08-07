import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { issueToken, sha256 } from "../common/crypto.js";

const TTL_MS = 1000 * 60 * 30; // 30 minutes
export type AuthTokenPurpose = "verify_email" | "reset_password";

@Injectable()
export class TokenService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Invalidates older tokens for this purpose and returns a new raw token exactly once. */
  async mint(userId: string, purpose: AuthTokenPurpose, database: Database = this.db) {
    const { raw, hash } = issueToken();
    const now = new Date();
    await database.update(schema.authTokens).set({ usedAt: now }).where(and(
      eq(schema.authTokens.userId, userId),
      eq(schema.authTokens.purpose, purpose),
      isNull(schema.authTokens.usedAt),
    ));
    await database.insert(schema.authTokens).values({
      userId, purpose, tokenHash: hash, expiresAt: new Date(Date.now() + TTL_MS),
    });
    return raw;
  }

  /** Atomic single-use consumption. Concurrent or repeated attempts fail. */
  async consume(raw: string, purpose: AuthTokenPurpose, database: Database = this.db) {
    const [row] = await database.update(schema.authTokens).set({ usedAt: new Date() }).where(and(
      eq(schema.authTokens.tokenHash, sha256(raw)),
      eq(schema.authTokens.purpose, purpose),
      isNull(schema.authTokens.usedAt),
      gt(schema.authTokens.expiresAt, new Date()),
    )).returning({ userId: schema.authTokens.userId });
    if (!row) throw new AppError("VALIDATION", "Invalid or expired token");
    return row.userId;
  }
}
