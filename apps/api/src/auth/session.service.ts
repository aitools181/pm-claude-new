import { Injectable, Inject } from "@nestjs/common";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";
import { issueToken, sha256 } from "../common/crypto.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

@Injectable()
export class SessionService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Returns the raw token to set as a cookie. Only the hash is stored. */
  async create(userId: string, meta: { userAgent?: string; ip?: string }): Promise<string> {
    const { raw, hash } = issueToken();
    await this.db.insert(schema.userSessions).values({
      userId, tokenHash: hash, userAgent: meta.userAgent, ip: meta.ip,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    return raw;
  }

  async resolve(rawToken: string) {
    const [row] = await this.db.select().from(schema.userSessions).where(
      and(
        eq(schema.userSessions.tokenHash, sha256(rawToken)),
        isNull(schema.userSessions.revokedAt),
        gt(schema.userSessions.expiresAt, new Date()),
      ),
    ).limit(1);
    if (!row) throw new AppError("UNAUTHENTICATED", "Invalid or expired session");
    return row;
  }

  async revoke(rawToken: string) {
    await this.db.update(schema.userSessions)
      .set({ revokedAt: new Date() })
      .where(eq(schema.userSessions.tokenHash, sha256(rawToken)));
  }

  async revokeById(userId: string, sessionId: string) {
    const [row] = await this.db.update(schema.userSessions).set({ revokedAt: new Date() }).where(and(
      eq(schema.userSessions.id, sessionId),
      eq(schema.userSessions.userId, userId),
      isNull(schema.userSessions.revokedAt),
    )).returning({ id: schema.userSessions.id });
    if (!row) throw new AppError("NOT_FOUND", "Session not found");
  }

  async revokeAll(userId: string, exceptRawToken?: string, database: Database = this.db) {
    const where = exceptRawToken
      ? and(eq(schema.userSessions.userId, userId), isNull(schema.userSessions.revokedAt), ne(schema.userSessions.tokenHash, sha256(exceptRawToken)))
      : and(eq(schema.userSessions.userId, userId), isNull(schema.userSessions.revokedAt));
    const rows = await database.update(schema.userSessions).set({ revokedAt: new Date() }).where(where).returning({ id: schema.userSessions.id });
    return rows.length;
  }

  async list(userId: string, currentRawToken?: string) {
    const rows = await this.db.select({
      id: schema.userSessions.id,
      userAgent: schema.userSessions.userAgent,
      ip: schema.userSessions.ip,
      createdAt: schema.userSessions.createdAt,
      expiresAt: schema.userSessions.expiresAt,
      tokenHash: schema.userSessions.tokenHash,
    }).from(schema.userSessions).where(and(
      eq(schema.userSessions.userId, userId),
      isNull(schema.userSessions.revokedAt),
      gt(schema.userSessions.expiresAt, new Date()),
    ));
    const currentHash = currentRawToken ? sha256(currentRawToken) : null;
    return rows.map(({ tokenHash, ...row }) => ({ ...row, current: currentHash === tokenHash }));
  }
}
