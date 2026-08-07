# Version history

Convention: **MAJOR.MINOR** — bump MAJOR for a big update (new capability area,
breaking change, major release), MINOR for a small change (fix, tweak, small addition).
The running version is shown only in the platform console (`/superadmin`), next to the title.

To change it, edit `packages/shared/src/version.ts` (`APP_VERSION`) and the root `package.json`.

| Version | Date | Summary |
|---------|------|---------|
| 5.1 | 2026-08-07 | SMTP email delivery: instance mail settings in the platform console, password encrypted at rest, connection test with recorded result, and real delivery for invitations, password resets and verification (log adapter fallback). |
| 5.0 | 2026-08-07 | Platform console (instance admin, org suspension, module entitlements, platform flags, audit) and Plans & pricing (catalogue, editable prices, limits, plan-gated modules, public pricing page). Includes build fixes and core-flow repairs (default workspace on setup, workspace creation UI, multi-organization). |
