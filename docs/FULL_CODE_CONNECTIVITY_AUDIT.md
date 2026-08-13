# Full Code, UI and Frontend/Backend Connectivity Audit

**Correction pass:** 2026-08-12  
**Repository baseline:** PM Platform v5.7 production-stability source  
**Scope:** previously identified P0/P1/P2 code, security, deployment, connectivity, UI/accessibility and integration corrections.

## Executive result

All issues identified in the preceding deep source audit have been corrected at source level and protected with regression checks. The repository now has a dedicated dependency-free production-readiness verifier in addition to the existing feature, screenshot-parity and UI-system gates.

This report distinguishes **source/static verification** from **runtime certification**. Source checks are clean. Full semantic build, Docker integration and rendered browser certification still require the repository's supported Node 20 environment, installed dependencies and Docker; those are not available in the packaging environment used for this pass.

## Corrections completed

### 1. Build blocker

- Removed the duplicate JSX `className` attribute in the workflow editor.
- Added a regression check and transpile-syntax pass over all TS/TSX source files.

### 2. Automation tenant isolation

- Conditions/actions verify that their rule belongs to the current organization before mutation.
- Automation run-step reads are scoped by both organization and run.
- Controller context now passes organization scope through to the service.
- Cross-organization negative coverage is present in the automation test suite.

### 3. REST and realtime topology

- Browser REST requests default to same-origin `/api/v1` and retain credentials.
- Next rewrites both `/api/:path*` and `/socket.io/:path*` to the internal API service.
- Socket.IO uses the same-origin path with polling/websocket fallback.
- API CORS uses an explicit application/allow-list configuration with credentials rather than permissive origin handling.
- The realtime gateway no longer accepts arbitrary origins.

### 4. Deployment, health and migrations

- Production migration failure is fatal; it is no longer swallowed before API startup.
- Docker API health checks use `/api/v1/health/ready`, not liveness-only `/health`.
- Readiness probes database, Redis and object storage.
- Compose requires core production secrets instead of silently accepting insecure placeholders.
- Docker images use frozen-lockfile installs.

### 5. Object storage

- MinIO initialization creates the configured private bucket on a fresh deployment.
- API storage startup also validates/creates the configured bucket, making startup idempotent.
- Storage health participates in readiness.
- S3 credentials/configuration are validated as a complete set and are required for production configuration.

### 6. Authentication and navigation

- Middleware covers all 34 top-level authenticated application routes.
- The fake client-created `pm_session` sentinel was removed.
- Login preserves a safe post-login destination and handles expired-session redirects.
- User menu now performs real server logout, realtime disconnect and client organization-context cleanup.
- Enterprise break-glass cookies are `Secure` in production.
- Central API/download handling converts transport failure into an explicit network error and centralizes 401 session-expiry recovery.

### 7. UI/accessibility interaction corrections

- Removed click-only `div`, `span`, `tr` and `article` interaction patterns that lacked keyboard semantics.
- Removed invalid button-inside-button structures from project rows/cards.
- Removed or implemented misleading no-op buttons in Home, Inbox, My Tasks, project Files, Reports, Gantt, Board and related flows.
- Saved views, sorting, filtering and section collapsing now perform actual state changes where the UI exposes them.
- Calendar previous/next and Gantt zoom icon controls have explicit accessible names.
- Shared UI normalization still enforces consistent geometry, focus, responsive sizing and state treatment.

### 8. Worker durability and real background work

- Job idempotency now acquires a PostgreSQL advisory transaction lock **before** checking prior execution and running the effect, preventing concurrent same-key execution races in the database boundary.
- Worker rejects incomplete organization/actor context and verifies active membership for user-scoped jobs.
- BullMQ now has real retention-purge domain jobs rather than only ping/no-op processing.
- API exposes a real queue producer and a permission-guarded asynchronous retention-purge endpoint.
- Exhausted worker retries are dead-lettered instead of silently discarded.

### 9. AI, integrations, reporting and webhooks

- Production cannot silently use the mock AI provider. A configurable OpenAI-compatible HTTP provider is available; disabled mode fails explicitly.
- GitHub/GitLab health checks use real provider endpoints; generic/email/calendar connectors require an explicit real health endpoint rather than fabricated success.
- Scheduled report delivery uses the mail boundary rather than a log-only success adapter.
- Outbound webhooks perform real HTTP delivery with timeout, non-2xx failure, redirect blocking, production HTTPS enforcement and DNS/private-address SSRF checks.

### 10. Frontend/backend API contract

The dependency-free verifier parses NestJS controller decorators and frontend API calls to compare HTTP method + route shape.

- **597 backend routes** discovered.
- **456 statically-resolvable frontend request-method variants** discovered and matched.
- `AdvancedModuleHub` passes endpoints as component data rather than literal `api(...)` arguments, so a second check validates those configurations separately.
- **31 configured AdvancedModuleHub overview/action endpoints** also match backend routes.
- Missing route/method matches: **0**.

This proves source-level route wiring. It does not substitute for runtime authentication, database state, provider credentials or end-to-end response validation.

## UI design-system status

The supplied design standard remains the governing source for the shared UI layer:

- one canonical component contract;
- 64/64 supplied component inventory coverage;
- persistent form labels and common focus/error/disabled/loading treatment;
- zero static JSX `style` objects;
- zero dynamic JSX `style` attributes;
- zero literal authored colors in `globals.css`, `ui-static.css`, and `ui-standards.css`;
- zero hard-coded hex colors in TSX;
- zero raw text-like input/select/textarea outside the shared UI primitives;
- zero browser `prompt()` / `confirm()` product flows;
- a single top-level legacy `:root` token block;
- minimum control geometry normalized by the final standards layer.

The former dynamic inline-style exception has been removed. Runtime-only values now pass through the shared `RuntimeStyle` / `useRuntimeCssVars` CSS-variable bridge, so route/component TSX contains **0 JSX `style` attributes**.

The former legacy palette debt has also been removed: `design-tokens.css` is the centralized authored CSS color registry, while `globals.css`, `ui-static.css`, and `ui-standards.css` contain **0 literal hex or numeric rgb/rgba color values**. The UI gate enforces both conditions.

## Final source verification

| Gate | Result |
|---|---:|
| F29-F42 structural verifier | **65 / 65 passed** |
| Source files checked by F29-F42 verifier | **551** |
| Database tables checked | **96** |
| Asana screenshot-parity source checks | **25 / 25 passed** |
| UI standards checks | **94 / 94 passed** |
| Production-readiness checks | **39 / 39 passed** |
| TypeScript/TSX parse syntax | **551 / 551 files** |
| Static frontend API request-method variants mapped | **456 / 456** |
| AdvancedModuleHub endpoint configs mapped | **31 / 31** |
| Backend routes available to mapper | **597** |

Run the source gates with:

```bash
node scripts/verify-f29-f42.cjs
node scripts/verify-asana-screenshot-parity.cjs
node scripts/verify-ui-standards.cjs
node scripts/verify-production-readiness.cjs
```

## Runtime certification still required before production sign-off

The repository requires Node `>=20 <21`. The correction environment has Node 22, does not have workspace dependencies installed, cannot fetch the configured pnpm toolchain/dependencies from the registry, and does not have Docker. Because of those environment constraints, the following are intentionally **not** reported as passed here:

- semantic workspace `tsc --noEmit` / `pnpm typecheck`;
- Next.js/NestJS/worker production builds;
- Vitest/Testcontainers tests against real PostgreSQL/Redis/MinIO;
- Docker Compose startup/readiness/migration test;
- Socket.IO live connection through the deployed reverse-proxy topology;
- Playwright rendered-browser and axe accessibility runs;
- live SMTP, identity, Git, calendar/search or AI provider conformance with production credentials.

On a supported release machine, run:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify:f29-f42
pnpm verify:asana-screenshots
pnpm verify:ui-standards
pnpm verify:production-readiness
pnpm typecheck
pnpm build
pnpm test
pnpm --filter @pm/web e2e
pnpm --filter @pm/db migrate

docker compose config
docker compose up --build
```

Then execute `docs/UI_FINAL_QA_CHECKLIST.md` at 320, 768, 1024 and 1440 widths, light/dark themes, keyboard-only navigation and axe checks. Provider-specific features must additionally be exercised with the deployment's real credentials and approved endpoints.

## Release assessment

**Source/static correction status:** complete for the issues identified in the deep audit.  
**Frontend/backend source route connectivity:** complete for resolvable and configured hub endpoints.  
**Production runtime certification:** pending execution in the supported Node 20 + dependency + Docker environment.
