# Code review — bugs found & fixed (2026-08-07)

Three build-blocking bugs were found. Each independently stops a production build,
so the app as delivered could not compile/deploy. All three are fixed in this copy.

## 1. API build fails — enterprise-identity.service.ts (deprovision/sync)
`nest build` error: `'current' is possibly 'undefined'` (TS18048).
In the SCIM/LDAP sync loop, `current` is reassigned inside the create branch, so
TypeScript cannot prove it is defined in the update branch. Runtime is actually safe
(the update branch is only reached when an existing identity was found), but the type
error still fails the compile.
Fix: assert non-null in the update branch — `...externalIdentities.id, current!.id`.

## 2. API build fails — scenarios (add draft change)
`nest build` error: `afterValue?` is not assignable to required `afterValue`.
The Zod DTO uses `z.unknown()`, which Zod infers as an OPTIONAL property, but
`ScenariosService.addChange` declared `afterValue: unknown` (required). Contract mismatch.
Fix: make the service parameter optional — `afterValue?: unknown` — matching the DTO.

## 3. Web build fails — reset-password & verify-email pages
`next build` error: `useSearchParams() should be wrapped in a suspense boundary`
(missing-suspense-with-csr-bailout). In Next 15 App Router, a page that calls
`useSearchParams()` and is statically prerendered must wrap it in `<Suspense>`.
`invite/accept` already did this; `reset-password` and `verify-email` did not, so
prerender crashed and the whole web build exited (0/77 pages).
Fix: split the inner component and wrap it — `export default () => <Suspense><Inner/></Suspense>`.

## Verified after fixes
- packages/shared, packages/db, apps/api, apps/worker, apps/maintenance, apps/web: tsc 0 errors
- `nest build` → dist/main.js produced
- `next build` → Compiled successfully, 77/77 pages generated
- All 30 migrations apply cleanly on a fresh schema (247 tables), journal integrity intact,
  no duplicate table/const names, all API modules wired (TwoFactorModule via AuthModule).

## Not bugs (checked)
- TwoFactorModule not in app.module.ts — it is imported by AuthModule (intentional, fine).
- 494 initial "Cannot find module @pm/db" errors — build-order only; gone after building
  the workspace packages first. Not real errors.
