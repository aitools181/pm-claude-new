/** Field names that must NEVER appear in any API/list response body. */
export const FORBIDDEN_KEYS = new Set([
  "tokenhash", "token", "secret", "ciphertext", "passwordhash", "password",
  "twofactorsecret", "totpsecret", "mfasecret", "recoverycodes", "sessionsecret",
]);
// Note: masked variants like "secretMasked" / "credentialHint" are intentionally allowed.

/** Recursively scan for a forbidden key; returns the first offender or null. */
export function findSensitiveKey(value: unknown): string | null {
  if (Array.isArray(value)) { for (const v of value) { const hit = findSensitiveKey(v); if (hit) return hit; } return null; }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k.toLowerCase())) return k;
      const hit = findSensitiveKey(v); if (hit) return hit;
    }
  }
  return null;
}
