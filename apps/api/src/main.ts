import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import type { Request, Response } from "express";
import { AppModule } from "./app.module.js";
import { AppErrorFilter } from "./common/app-error.filter.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());

  // ---- NFR 8.1: security headers (dependency-free; self-contained deployments
  // cannot assume a reverse proxy sets these). CSP is API-appropriate: this
  // process serves JSON only, so everything is denied.
  const isHttps = /^https:/i.test(process.env.APP_URL ?? "");
  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    if (isHttps) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  });

  // ---- NFR 8.1: API-wide rate limiting (in-memory sliding window, per user
  // session when present, else per client IP). Login lockout stays separate.
  // Defaults: 300 requests / 60s general, 30 / 60s for auth endpoints.
  const generalLimit = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300);
  const authLimit = Number(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? 30);
  const WINDOW_MS = 60_000;
  const hits = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    for (const [key, arr] of hits) {
      const kept = arr.filter((t) => t > cutoff);
      if (kept.length) hits.set(key, kept); else hits.delete(key);
    }
  }, WINDOW_MS).unref();
  app.use((req: Request & { cookies?: Record<string, string> }, res: Response, next: () => void) => {
    const path = req.path ?? req.url ?? "";
    if (path.endsWith("/health") || path.endsWith("/ready")) return next();
    const isAuth = /\/auth\/(login|register|password)/.test(path);
    const limit = isAuth ? authLimit : generalLimit;
    const who = req.cookies?.pm_session ? `s:${req.cookies.pm_session.slice(0, 24)}` : `ip:${req.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown"}`;
    const key = `${isAuth ? "a" : "g"}:${who}`;
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
    if (arr.length >= limit) {
      const retryAfter = Math.ceil((arr[0] + WINDOW_MS - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.status(429).json({ statusCode: 429, code: "rate_limited", message: "Too many requests. Please slow down and retry shortly." });
      return;
    }
    arr.push(now);
    hits.set(key, arr);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - arr.length)));
    next();
  });

  // Same-origin is the default web topology. Explicit CORS exists only for
  // deliberate direct API development/deployments and always uses credentials.
  //
  // Origins are compared on scheme + host + port only. A trailing slash or a
  // path in APP_URL used to fail an exact string match against the browser's
  // Origin header and reject every login with "Origin is not allowed by CORS",
  // which is a configuration typo rather than a security decision.
  const canonicalOrigin = (value: string | undefined): string | null => {
    const raw = value?.trim();
    if (!raw) return null;
    // Accept a bare hostname too: Coolify exposes SERVICE_FQDN_WEB without a scheme.
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    try { return new URL(withScheme).origin; } catch { return null; }
  };

  // A value that still reads like one of this repo's compose guard messages was
  // never configured. Coolify 4.x seeds variables from the compose defaults and
  // then locks them, so this is a normal state to detect rather than crash on.
  const looksUnset = (value: string | undefined) => !value?.trim() || /^Set\s/i.test(value.trim());

  const originSources = [
    process.env.APP_URL,
    ...(process.env.CORS_ORIGINS ?? "").split(","),
    ...(process.env.PUBLIC_ORIGIN_HINTS ?? "").split(","),
  ];
  const allowedOrigins = new Set(
    originSources
      .filter((v) => !looksUnset(v))
      .map(canonicalOrigin)
      .filter((v): v is string => Boolean(v)),
  );
  app.enableCors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(canonicalOrigin(origin) ?? origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} is not allowed by CORS. Allowed: ${[...allowedOrigins].join(", ") || "(none - set APP_URL)"}`), false);
    },
  });

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AppErrorFilter());
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, "0.0.0.0");
  app.get(Logger).log(`API listening on http://0.0.0.0:${port}/api/v1`);
  app.get(Logger).log(`CORS allowed origins: ${[...allowedOrigins].join(", ") || "(none - APP_URL is not set)"}`);
  if (looksUnset(process.env.SESSION_SECRET) || (process.env.SESSION_SECRET ?? "").length < 32) {
    app.get(Logger).warn(
      "SESSION_SECRET is unset or is still a placeholder from docker-compose.yml. " +
      "Sessions are signed with a predictable value - see docs/operations/COOLIFY_DEPLOY.md.",
    );
  }
}

bootstrap().catch((e) => { console.error("Fatal boot error:", e); process.exit(1); });
