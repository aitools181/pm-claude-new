import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module.js";
import { AppErrorFilter } from "./common/app-error.filter.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(cookieParser());

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
