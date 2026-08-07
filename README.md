# PM Platform - Self-Contained Project Management

A scratch-built, self-hosted project-management platform with an Asana-like simple core UI, Jira-class configurable execution and ClickUp-style optional productivity modules.

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

Read `docs/architecture/F29-F42-COMPLETION.md` for the exact feature-to-code map and external-provider boundaries.

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
