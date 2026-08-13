# PM Platform - Self-Contained Project Management

A scratch-built, self-hosted project-management platform with an Asana-like simple core UI, Jira-class configurable execution and ClickUp-style optional productivity modules.

## Release 5.7

Current packaged release: **5.7**. This release hardens Coolify/Next.js production builds, adds a build-safety preflight for App Router search-parameter boundaries, and exposes clear **Sign out** actions both from the top-right account menu and Account settings.

## Current implementation

The repository contains the core Work Item platform plus the complete application-side F29-F42 domain set:

- Enterprise identity, verified domains, LDAP/AD sync contracts, scoped SCIM provisioning and break-glass recovery
- Work Item clone/bulk/hierarchy/mobility and retry-safe creation
- WQL, screen schemes, saved queries/subscriptions and immutable configuration bundles
- Calculated lookup/mirror/rollup fields and scenario planning
- Asana/Jira/ClickUp migration centre
- DevOps links, signed webhook ingestion, readiness and DORA metrics
- ACL-aware connected search
- Isolated configuration sandbox, promotion and rollback
- Separate Service Management and Product Discovery domains
- Email-in-task, calendar conflict sync, meeting capture
- Notes, reminders, mind-map/map/device/offline productivity
- Governed AI teammates, tool grants, memory, budgets and human checkpoints
- Hardened account security with password reset, email verification, lockout, session management and one-time 2FA recovery codes
- Rich Task Drawer details: subtasks, checklist, tags, secure files, custom fields, comments, activity and dependencies

Read `docs/architecture/F29-F42-COMPLETION.md` for the exact feature-to-code map and external-provider boundaries. For the final source-level security, deployment, frontend/backend and UI correction pass, read `docs/FULL_CODE_CONNECTIVITY_AUDIT.md`.

## UI design system

The web application now has a consolidated production UI contract based on the supplied Professional UI Design Standards Rulebook:

- `apps/web/app/ui-standards.css` owns shared tokens, geometry, responsive behavior, focus and state styling;
- `apps/web/components/ui` exposes the canonical primitives for the supplied 64-component inventory;
- `apps/web/app/ui-static.css` contains centralized route-static presentation and loads before the standards layer;
- `docs/UI_COMPONENT_CONTRACT.md` documents the allowed component anatomy/variants;
- `docs/PROFESSIONAL_UI_STANDARDIZATION_AUDIT.md` records the final source migration and verification;
- `docs/UI_FINAL_QA_CHECKLIST.md` is the browser/release checklist.

Source-level regressions are blocked by `node scripts/verify-ui-standards.cjs`.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js App Router + React + TypeScript |
| Backend | NestJS modular monolith, REST `/api/v1` |
| Database | PostgreSQL + Drizzle ORM |
| Cache/jobs | Redis + BullMQ |
| Files | Private S3-compatible object storage / MinIO |
| Deployment | Docker Compose / self-hosted |

## Fast structural verification

```bash
node scripts/verify-f29-f42.cjs
node scripts/verify-asana-screenshot-parity.cjs
node scripts/verify-ui-standards.cjs
node scripts/verify-production-readiness.cjs
```

This dependency-free gate checks TS/TSX syntax, relative imports, advanced migration coverage, UI/API registration, auth-security controls, Work Item detail controls and pure WQL/scenario/SLA/prioritisation/migration fixtures.

## Full local release verification

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify:f29-f42
pnpm typecheck
pnpm build
pnpm --filter @pm/api test
pnpm --filter @pm/web e2e
pnpm --filter @pm/db migrate
```

Live SAML/OIDC/LDAP, Git/CI, email/calendar, connected-search and AI activation requires the target provider credentials and provider-specific conformance tests. Native desktop/mobile binaries are separate packaging outputs; the responsive web/PWA and versioned API are the source base.
