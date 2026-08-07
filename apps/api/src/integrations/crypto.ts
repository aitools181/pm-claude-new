import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

/** Derive a stable 32-byte key from the deployment's session secret. */
export const deriveKey = (secret: string): Buffer => createHash("sha256").update(secret).digest();

/** AES-256-GCM. Output = base64(iv[12] | authTag[16] | ciphertext). */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

/** Decrypt; throws if the ciphertext or tag was tampered with. */
export function decryptSecret(b64: string, key: Buffer): string {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}
