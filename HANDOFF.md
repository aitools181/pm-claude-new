# PM Platform — Project Handoff

**Current release:** 5.7 (`package.json` 5.7.0; `APP_VERSION` 5.7).

A self-hosted Jira/Asana-style project management platform built from the Gujarati master
blueprint. The repository now includes the application-side F29-F42 advanced capability domains in addition to the audited core Task/Subtask and Asana-style UX improvements. Read `docs/architecture/F29-F42-COMPLETION.md` and `FINAL_IMPLEMENTATION_VERIFICATION.md` for the exact implementation map. Full dependency-based builds, database/browser suites, provider conformance, accessibility and isolated backup/restore verification must still run in the deployment environment before a production acceptance claim.

> Communication note: the author writes in Romanized Gujarati + English tech terms and the
> assistant replies in the same style. The product UI is entirely in **English**.

---

## 1. What this is

- **Monorepo** (pnpm@9.12.0 + Turborepo). Node 20 target (sandbox uses Node 22).
- **apps/web** — Next.js 15 App Router (port 3000). Domain service; rewrites `/api/:path*` → `INTERNAL_API_URL`.
- **apps/api** — NestJS modular monolith, REST under `/api/v1` (port 4000).
- **apps/worker** — BullMQ background worker.
- **apps/maintenance** — CLI (backup/restore/migrate helpers).
- **packages/db** — Drizzle ORM schema + migrations (Postgres 18).
- **packages/shared** — env loader, `AppError`, shared types.
- **Infra**: PostgreSQL 18, Redis 8, MinIO (object storage).
- **Design system "Blueprint"**: IBM Plex Sans/Mono, project-owned CSS in
  `apps/web/app/globals.css` (NOT Tailwind).

Repository inventory includes migrations, schema modules, API modules, Testcontainers tests
and many web routes. These counts are implementation inventory only. In the audit sandbox,
changed TS/TSX files passed TypeScript syntax transpilation, but dependencies, Docker and
registry access were unavailable, so the full six-package typecheck, builds, Testcontainers and
Playwright suites were not executed.

---

## 2. Source of truth & how to continue on another account

The sandbox and its `/home/claude/pm-platform` working copy do **not** transfer between chats
or accounts, and Claude accounts don't share memory. To continue elsewhere:

1. **GitHub is the source of truth** — repo `aitools181/pm_claude`, branch `main`. Push the
   latest code there (see §8).
2. In the new session, provide: (a) both Gujarati spec docs, (b) the repo (clone or upload the
   latest zip), and (c) this `HANDOFF.md`.
3. Paste the kickoff prompt in §9.

---

## 3. Build, run & verify (local / sandbox)

```bash
pnpm install
# Postgres + Redis must be running. Example DSN used in the sandbox:
export DATABASE_URL="postgresql://pm:pm_password@127.0.0.1:5432/pm_platform"
pnpm --filter @pm/db exec drizzle-kit migrate      # apply migrations
pnpm --filter @pm/api exec nest build              # build API
pnpm --filter @pm/web exec next build              # build web (must compile all routes)
```

**Generate a migration after a schema change:**
```bash
cd packages/db && npx tsc            # compile schema
DATABASE_URL=... npx drizzle-kit generate
```

**Typecheck sweep (must be 0 across all six):**
```bash
for p in packages/shared packages/db apps/api apps/worker apps/maintenance apps/web; do
  (cd "$p" && npx tsc --noEmit)
done
```

---

## 4. Repo conventions (important — keep these invariant)

- **Schema**: one file per area in `packages/db/src/schema/*.ts`, each re-exported via
  `export * from "./X.js";` in `index.ts`. Every org-owned table has `organizationId`.
  Cross-file FK columns are sometimes declared **without** `.references()` to avoid circular
  imports (e.g. self-referencing thread parents).
- **DI tokens**: `DB` (`db.module.ts`), `ENV` (`config.module.ts`, `export const ENV = Symbol("ENV")`,
  provides `Env` from `loadEnv()`; has `SESSION_SECRET`/`DATABASE_URL`/`REDIS_URL`).
- **Auth**: session cookie + `SessionGuard`; org via `X-Organization-Id` header + `OrgContextGuard`.
  Capabilities in `apps/api/src/authz/capabilities.ts`; enforce with
  `@RequirePermission(CAP)` + `AuthzGuard`. Controllers apply guards explicitly via
  `@UseGuards(SessionGuard, OrgContextGuard, AuthzGuard)`; public controllers omit them.
- **Errors**: throw `AppError` from `@pm/shared` (codes `NOT_FOUND`/`CONFLICT`/`VALIDATION`/
  `FORBIDDEN`/`RATE_LIMITED`→429) → handled by `app-error.filter.ts`. Validation via `ZodPipe`.
- **Services are plain classes** instantiable as `new X(db, ...deps)` so verify scripts and
  Testcontainers tests can construct them directly. New deps use `@Optional()` where needed.
- **Access helpers** `apps/api/src/collab/access.ts`: `canAccessWorkItem(db, org, itemId, userId)`,
  `canAccessProject(db, org, projectId, userId)`. `projects.privacy` is `workspace|private`;
  private requires a `project_members` row.
- **Work items**: `WorkItemsService.create(org, userId, { projectId, title, primaryOwnerUserId? })`
  (no dueDate param — set it via a follow-up `db.update`). Optimistic version lock on `update`.
- **Optional modules**: `ModulesService` gates chat/whiteboard/ai and F29-F42 advanced domains via feature flags
  (`module:<name>`), OFF by default; `assertEnabled` throws `module_disabled`. Never couple
  optional modules to core Work Item writes.

### The "code never broke" invariant
Every phase is **additive**: new schema files + re-export; additive columns; new NestJS modules
appended to the `app.module.ts` `imports` array. Six-package typecheck stays at 0 and
`next build` compiles all routes after every change.

---

## 5. Verification pattern (used every phase)

1. Bring up native Postgres + Redis.
2. Write `apps/api/verify.mjs` that imports the **compiled** services from `./dist/...` plus
   `@pm/db`, seeds a throwaway org, and asserts each gate with a `ck(name, cond)` helper.
   Run it from `apps/api` after `npx nest build`, then delete it.
3. Add a permanent CI test `apps/api/test/phaseN-*.test.ts` using **Testcontainers**
   (`postgres:18-alpine`) mirroring the verify script.
4. Add `docs/architecture/PHASE-N-PROGRESS.md` documenting the stream + gate mapping.
5. Typecheck sweep (0 errors) + `next build` for any frontend.
6. Package a zip for the turn and summarise gate results.

---

## 6. Deployment configuration (Coolify — runtime not verified in this audit)

- Repository handoff notes describe a **Coolify** deployment from GitHub. This audit did not access the live environment. The compose configuration is intended to run `drizzle-kit migrate` before boot; verify that behaviour in the target environment.
- Web is the public domain service; it rewrites `/api/*` to the internal API via
  `INTERNAL_API_URL`.
- **First-run**: `/setup` creates the first org + owner. Auth uses argon2id + optional 2FA.
- **Set `SESSION_SECRET`** to a strong value: `openssl rand -hex 32`. This also derives the
  integration credential-vault encryption key, so changing it invalidates stored integration
  secrets (rotate them after a change).

---

## 7. Phase map and acceptance status

The repository contains implementation artifacts for Phases 0–13, but they must be treated as
**implemented candidates**, not as accepted/completed phases. Blueprint acceptance requires
working persistence and lifecycle, negative permission tests, migrations, audit, observability,
recovery, failure handling, responsive UX and accessibility evidence.

Highest-priority open acceptance work from the 2026-08-06 audit:

1. Run the full typecheck/build/test/migration/browser suites in a networked Docker environment.
2. Complete private-project/object-level negative authorization coverage across all modules.
3. Finish the remaining hierarchy lifecycle impact dialogs for archive/delete/restore and full recycle-bin UX; clone, promote/demote/re-parent and Move Wizard foundations are present.
4. Complete Asana-class saved views/My Work/Inbox polish and Jira-class workflow/WQL/Agile acceptance evidence.
5. Configure and certify live SMTP/IdP/LDAP/Git/calendar/search/AI providers; repository adapters intentionally do not fake provider success.
6. Verify backup/restore into isolated namespaces and reconcile all work-item hierarchy data.

Per-phase implementation notes live in `docs/architecture/PHASE-*-PROGRESS.md`; compare each
claim against `PM_PLATFORM_UI_UX_FEATURE_GAP_AUDIT_GUJARATI.md` and the master blueprint.

---

## 8. Push to GitHub (final)

From a clone with the latest code (or after extracting the latest zip into the repo):

```bash
cd pm_claude               # your local clone of aitools181/pm_claude
# copy the latest code in if working from a zip, then:
git add -A
git commit -m "Improve Asana-style UI and Task/Subtask integrity"
git push origin main
```

Before pushing or deploying, run the verification commands in this document and review the
audit report. Do not assume migration or deployment success from repository contents alone.
If pushing from a fresh machine, authenticate first (`gh auth login` or a PAT remote URL).

---

## 9. Kickoff prompt for a new session

> I'm continuing the "PM Platform" project — a self-hosted PM app based on the attached Gujarati
> master blueprint. The repository has broad Phase 0–13 implementation, but acceptance is still
> evidence-driven. Read `HANDOFF.md` and `PM_PLATFORM_UI_UX_FEATURE_GAP_AUDIT_GUJARATI.md`
> first. Reply in Romanized Gujarati + English tech terms; UI stays English. Reconcile the request
> with the blueprint, implement the authorized slice, verify against real Postgres and browser
> suites, keep the six-package typecheck at 0, and provide a downloadable audited zip.

---

## 10. Final UI standardization handoff (2026-08-12)

The UI standardization request has been consolidated into the repository rather than left as a route-by-route checklist:

- final design-system layer: `apps/web/app/ui-standards.css`;
- generated/tokenized static presentation: `apps/web/app/ui-static.css`;
- canonical component barrel: `apps/web/components/ui/index.ts`;
- complete supplied inventory contract: `docs/UI_COMPONENT_CONTRACT.md`;
- implementation audit: `docs/PROFESSIONAL_UI_STANDARDIZATION_AUDIT.md`;
- final rendered-browser checklist: `docs/UI_FINAL_QA_CHECKLIST.md`;
- strict dependency-free regression gate: `node scripts/verify-ui-standards.cjs`;
- full-stack browser gate once dependencies are present: `pnpm --filter @pm/web e2e` (includes `e2e/ui-standards.spec.ts`).

Current source gates after the final code/connectivity correction pass: F29-F42 **65/65**, Asana parity **25/25**, UI standards **94/94**, production readiness **39/39**. The route-contract gate maps **456** statically-resolvable frontend request-method variants plus **31** configured AdvancedModuleHub endpoints to **597** backend routes with no missing match. See `docs/FULL_CODE_CONNECTIVITY_AUDIT.md`. A semantic Next/Nest production build and Playwright run were not executed in the constrained packaging environment because Node 20/workspace dependencies/Docker are unavailable; run the documented full release gate before deployment.

## 11. Ideas for future work (optional)

- Certify the configured OpenAI-compatible/BYOK AI endpoint with production credentials; add provider-specific adapters only where deployment requirements justify them.
- Live collaboration transport for chat/whiteboard (Socket.IO is already wired for collab).
- Extend the now-live BullMQ worker beyond retention to drive `retryDue` for webhooks/reports and scheduled restore-drill regressions.
- More public-API resources + SDKs generated from the OpenAPI document.


## 12. F29-F42 final package notes

- Migrations `0026_complete_f29_f42.sql`, `0027_f29_f42_completion.sql` and `0028_auth_security_completion.sql` must all be applied.
- Run `node scripts/verify-f29-f42.cjs` before installing dependencies, then run the full pnpm release gate.
- Public integration entry points are signed/scoped: SCIM uses an API token with `scim:write`; DevOps and inbound email hooks use `X-PM-Signature` HMAC over the submitted payload string.
- Sandbox organizations seed default roles/capabilities and deliberately suppress outbound modules and secret copying.
- External provider activation/certification is documented as a deployment boundary rather than reported as a mocked success.

## 13. Asana missing-feature completion (2026-08-13)

The 40-item decision list is resolved. See `docs/ASANA_MISSING_FEATURES_IMPLEMENTATION.md` and run `node scripts/verify-asana-missing-features.cjs` before release. The source gate verifies UI presence plus corresponding API/schema behavior for all 40 approved items. Navigation settings (#8) are deliberately labeled PM Platform-native because the supplied Asana capture did not show the tab's internal controls.
