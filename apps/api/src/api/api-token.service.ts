import { Injectable, Inject } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { schema, type Database } from "@pm/db";
import { AppError } from "@pm/shared";
import { DB } from "../db/db.module.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type ApiPrincipal = { organizationId: string; userId: string; scopes: string[]; tokenId: string };

@Injectable()
export class ApiTokenService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Create a token. The raw value is returned ONCE and never stored. */
  async create(organizationId: string, userId: string, input: { name: string; scopes: string[]; expiresInDays?: number }) {
    const raw = `pmk_${randomBytes(24).toString("base64url")}`;
    const prefix = raw.slice(0, 12);
    const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 864e5) : null;
    const [row] = await this.db.insert(schema.apiTokens).values({ organizationId, name: input.name, prefix, tokenHash: sha256(raw), scopes: input.scopes, createdByUserId: userId, expiresAt }).returning();
    return { id: row.id, name: row.name, prefix, scopes: row.scopes, expiresAt, token: raw }; // token shown once
  }

  /** List tokens — masked: prefix only, never the hash or raw value. */
  async list(organizationId: string) {
    const rows = await this.db.select().from(schema.apiTokens).where(eq(schema.apiTokens.organizationId, organizationId)).orderBy(schema.apiTokens.createdAt);
    return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, expiresAt: r.expiresAt, revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt, masked: `${r.prefix}••••••` }));
  }

  async revoke(organizationId: string, id: string) {
    const [row] = await this.db.update(schema.apiTokens).set({ revokedAt: new Date() }).where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.organizationId, organizationId))).returning();
    if (!row) throw new AppError("NOT_FOUND", "Token not found");
    return { revoked: true };
  }

  /** Authenticate a raw bearer token; rejects unknown, revoked and expired tokens. */
  async authenticate(raw: string): Promise<ApiPrincipal> {
    if (!raw?.startsWith("pmk_")) throw new AppError("FORBIDDEN", "Invalid API token", { code: "invalid_token" });
    const [row] = await this.db.select().from(schema.apiTokens).where(eq(schema.apiTokens.tokenHash, sha256(raw))).limit(1);
    if (!row) throw new AppError("FORBIDDEN", "Invalid API token", { code: "invalid_token" });
    if (row.revokedAt) throw new AppError("FORBIDDEN", "Token has been revoked", { code: "token_revoked" });
    if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) throw new AppError("FORBIDDEN", "Token has expired", { code: "token_expired" });
    await this.db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.id));
    return { organizationId: row.organizationId, userId: row.createdByUserId, scopes: (row.scopes as string[]) ?? [], tokenId: row.id };
  }
}
