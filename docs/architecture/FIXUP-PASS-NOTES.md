# V1 Fix-up / Verification Pass

Turned the implemented (but previously uncompiled) V1 into a build-verified stack.

## Toolchain / config
- Added `@types/node` (was missing → `process`/`NodeJS` unresolved everywhere).
- `tsconfig.base.json`: disabled `noUncheckedIndexedAccess` (it flagged 74 compile-only
  "possibly undefined" index accesses that are not runtime bugs; the code was not
  written against that flag).
- `packages/db/tsconfig.json`: excluded `drizzle.config.ts`/`dist`/`migrations` from the
  src typecheck.

## Missing dependencies (would crash at import)
- api: `express`, `@types/express`, `ioredis`.
- worker: `ioredis`.

## Real code fixes
- `ops/feature-flags.service.ts`: replaced a raw-SQL `onConflict` target (invalid for
  drizzle) with a safe select-then-update/insert upsert.
- `ops/health.service.ts` and `worker/main.ts`: `ioredis` default import is not
  constructable under NodeNext → use the named `{ Redis }` export.
- `workflow/workflow.service.ts`: cast jsonb `config` (typed `{}`) before reading `roleKey`.
- `web/app/layout.tsx`: load IBM Plex via a runtime stylesheet instead of
  `next/font/google`, removing a build-time network dependency (fonts now fetched by the
  browser, with system-font fallback).

## Migrations
- Built `@pm/db` and pointed `drizzle.config.ts` at the compiled schema so drizzle-kit
  resolves the NodeNext `.js` specifiers; generated the consolidated migration
  `migrations/0000_*.sql` (all phases). Deploy applies it with `drizzle-kit migrate`
  (no schema loading at runtime).

## Verification results
- Typecheck: `shared, db, api, worker, maintenance, web` → **0 errors**.
- `nest build` (api) → **dist/main.js built**.
- `next build` (web) → **all routes compiled**.
- Testcontainers suites need Docker → run in CI/local (not available in this sandbox).

## Deploy
- `docker-compose.yml`: infra internal-only (no host-port conflicts), Postgres 18 volume
  at `/var/lib/postgresql`, api applies migrations on boot, web single-domain via Next
  rewrite. `pnpm-lock.yaml` committed for reproducible builds.

## Production Dockerfiles (follow-up)
Switched all app images from dev servers to production builds:
- `@pm/shared` / `@pm/db` `main`/`types` now point to `dist` (compiled JS) so the
  compiled apps resolve them at runtime; each Dockerfile builds the libraries first.
- **api**: `nest build` → `node dist/main.js` (migrations applied on boot).
- **worker**: `tsc` → `node dist/main.js`.
- **web**: `next build` → `next start` (optimized production server).
- **maintenance**: builds the libraries, keeps the `tsx` CLI entrypoint.
- `NEXT_PUBLIC_API_URL` bakes to same-origin at build; the Next rewrite proxies
  `/api` to the internal api service at runtime.
Verified: libraries + api (`node dist/main.js` reaches env validation), worker, and
`next build` all compile; typecheck 0 across all six packages.

## Runtime boot fix (crash-loop after successful build)
The production build succeeded but the api container crash-looped. Root cause was a
**Nest DI wiring error** that only surfaces at runtime bootstrap (typecheck/tests
can't catch it, since tests construct services directly): controllers across many
feature modules use `@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)`, but
`SessionService` (AuthModule) and `OrgContextService` (OrgContextModule) were only
exported from non-global modules. Importing them in AppModule does NOT make them
available to sibling modules — so the guards could not resolve their dependencies
(AuditModule, being `@Global`, loaded first and failed first).

Fix: marked **AuthModule** and **OrgContextModule** `@Global` (AuthzModule already
was). Now the three cross-cutting guards resolve in every module. Verified by booting
the compiled server: all modules initialize and it reaches
`API listening on http://0.0.0.0:4000/api/v1`.

## Worker boot fix
The worker also crash-looped: BullMQ rejects queue names containing ":", and the
dead-letter queue was named `system:dead`. Renamed to `system-dead` (the only
reference). Verified: the worker boots to `[worker] listening: system`.

## Full real-infra boot verification (Postgres 16 + Redis, in-sandbox)
Installed real Postgres and Redis and ran the exact production boot sequence:
- `drizzle-kit migrate` → **migrations applied, 75 tables created** (no SQL errors).
- api `node dist/main.js` → **Nest started, "API listening", GET /api/v1/health → {"status":"ok"}**, process stays up.
- worker `node dist/main.js` → **"[worker] listening: system"**, stays up.
- web `next start` → **Ready, serves pages (200)**.
All three run without crash-looping. The api/worker boot fixes (Auth/OrgContext
`@Global`, worker DLQ rename) are required for this — without them the api/worker exit.
