import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

export const hashPassword = (pw: string) => argon2.hash(pw, { type: argon2.argon2id });
export const verifyPassword = (hash: string, pw: string) => argon2.verify(hash, pw);

/** Opaque secret + its sha256 hash. We store only the hash; the raw is shown once. */
export function issueToken(bytes = 32) {
  const raw = randomBytes(bytes).toString("base64url");
  return { raw, hash: sha256(raw) };
}
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
