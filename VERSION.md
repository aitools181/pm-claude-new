# Version history

Convention: **MAJOR.MINOR** — bump MAJOR for a big update (new capability area,
breaking change, major release), MINOR for a small change (fix, tweak, small addition).
The running version is shown only in the platform console (`/superadmin`), next to the title.

To change it, edit `packages/shared/src/version.ts` (`APP_VERSION`) and the root `package.json`.

| Version | Date | Summary |
|---------|------|---------|
| 5.7 | 2026-08-13 | Production build fix and sign-out recovery. `/settings/account` now wraps `useSearchParams()` in a Suspense boundary and the whole authenticated `(app)` route group renders dynamically, so Next.js no longer fails prerendering one page at a time during the Coolify build. Log out is reachable from the account menu, the sidebar footer and Settings → Account, and all three share one helper that revokes the session, drops the socket and clears local cookies. |
| 5.2 | 2026-08-07 | Container health checks for api, web and worker, so the reverse proxy only routes traffic once a container is actually ready. Adds `/healthz` on web and a health listener on the worker. |
| 5.1 | 2026-08-07 | SMTP email delivery: instance mail settings in the platform console, password encrypted at rest, connection test with recorded result, and real delivery for invitations, password resets and verification (log adapter fallback). |
| 5.0 | 2026-08-07 | Platform console (instance admin, org suspension, module entitlements, platform flags, audit) and Plans & pricing (catalogue, editable prices, limits, plan-gated modules, public pricing page). Includes build fixes and core-flow repairs (default workspace on setup, workspace creation UI, multi-organization). |
