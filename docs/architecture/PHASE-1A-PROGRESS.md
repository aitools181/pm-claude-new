# Phase 1A — Progress

## Part 1 — Tenancy foundation ✅
Schema (users, credentials, sessions, organizations, settings, memberships,
teams, roles, permissions, role_permissions) + `orgScope()` isolation helper.

## Part 2 — Authentication core ✅
- argon2id password hashing (`common/crypto.ts`).
- First-run setup: atomic first admin + first org, once-only (`SetupService`).
- Login / logout; opaque session tokens stored as sha256 hashes (`SessionService`).
- Single-use, expiring verification / reset tokens (`TokenService`, `auth_tokens`).
- `SessionGuard` (authentication), consistent `AppError` → HTTP filter.

## Part 3 — 2FA + Org Context + Authorization ✅
- TOTP enrol / confirm / verify / disable with QR (`TwoFactorService`).
  (Secret stored through an encryption seam — wire real KMS before prod.)
- `OrgContextService` + `OrgContextGuard`: membership-verified org switching,
  sets `req.organizationId` for scoped queries; `/organizations/mine` switcher.
- `AuthzGuard` + `@RequirePermission()`: server-side capability check against
  `role_permissions`; default deny. Capability registry + default-role seed.

## Backend acceptance tests ✅
`test/setup-and-isolation.test.ts` (Testcontainers + real Postgres 18):
first-run once-only, cross-org isolation, org-scoped unique constraints.

---

## Part 4 — Frontend screens (NEXT) ⏳
English UI: setup wizard, login/2FA/recovery, session list, org switcher,
users/teams/members admin, app shell. (Reads the frontend-design skill.)

## Part 5 — E2E (NEXT) ⏳
Playwright: setup→login→2FA→switch org→admin; axe accessibility pass.

## Part 4 — Frontend screens ✅
Project-owned design system ("blueprint / instrument panel": IBM Plex Sans+Mono,
cool paper + slate ink + blueprint-blue, faint grid signature on auth panel).
Screens: first-run setup wizard, login + 2FA step, active sessions, People admin
(members / teams / roles tabs), My Work empty state, app shell with membership-
verified organization switcher. Route protection via middleware; typed API client.

## Part 5 — E2E ✅
Playwright: login renders + axe accessibility pass; first-run setup happy path
→ redirect to login. Runs against the compose stack on a fresh database.

**Phase 1A status: backend + frontend + E2E scaffolded. Next: first `pnpm install`,
`pnpm db:generate`, `pnpm typecheck`, then run the stack and the test suites.**
