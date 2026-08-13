# PM Platform 5.7 — Coolify deployment stabilization

## Failure observed
The latest Coolify build reached a successful Next.js compile and completed TypeScript validation, then failed while generating static pages because `/settings/account` called `useSearchParams()` outside a React `Suspense` boundary.

## Fixes in 5.7
- Wrapped the Account settings search-parameter consumer in `Suspense`.
- Proactively protected the project list and shared ProjectChrome search-parameter consumers too, preventing the same Next.js 15 prerender rule from failing later routes one-by-one.
- Preserved the previous `forwardRef` fix for shared Input/Textarea/Select controls.
- Preserved Alpine native build dependencies (`python3`, `make`, `g++`) for deterministic Coolify installs.
- Added a web Docker build preflight: `node scripts/verify-production-readiness.cjs` runs before the expensive package builds.
- Added an explicit current-device **Sign out** action in Account settings. The top-right account menu also calls `/auth/logout`, disconnects realtime, clears the organization cookie, and returns to `/login`.
- Updated release metadata to 5.7 (`package.json` 5.7.0 and `APP_VERSION` 5.7).

## Source verification
- F29-F42: 65 passed / 0 failed
- Asana screenshot parity: 25/25
- UI standards: 94/94
- Approved missing features: 40/40
- Production-readiness source checks: 44/44
- Frontend API mapping within readiness check: 505 calls mapped to 623 backend routes

## Deployment note
Coolify deploys the GitHub branch, not this ZIP directly. Push the 5.7 changes to the configured `main` branch and redeploy the latest commit.
