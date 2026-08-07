import { Injectable } from "@nestjs/common";

/** Sliding-window rate limiter (in-memory). Keyed by e.g. `${token}:${ip}`. */
@Injectable()
export class RateLimiter {
  private hits = new Map<string, number[]>();
  /** Returns true if allowed; records the hit. */
  check(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr); return true;
  }
  reset(key?: string) { if (key) this.hits.delete(key); else this.hits.clear(); }
}

/** Pluggable CAPTCHA verification. Swap the provider in production. */
export interface CaptchaVerifier { verify(token?: string): Promise<boolean>; }

export const CAPTCHA = Symbol("CAPTCHA");

/** Default (dev): accepts everything. Production should bind a real verifier. */
@Injectable()
export class AllowAllCaptcha implements CaptchaVerifier {
  async verify(): Promise<boolean> { return true; }
}
