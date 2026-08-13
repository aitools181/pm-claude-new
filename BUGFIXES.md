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

## UI standardization pass 2

- Replaced all browser-native `prompt()` and `confirm()` product workflows with the shared product dialog host.
- Consolidated legacy top-level `:root` token declarations from three blocks to one.
- Added shared Dialog, Tabs, Accordion/Collapsible, Toggle/ToggleGroup, Pagination, Slider, and AspectRatio primitives.
- Migrated My Tasks view tabs to the shared keyboard model.
- Migrated attachment upload to shared Dialog/Field/Input/Button/EmptyState primitives.
- Moved PWA connectivity/update status to semantic tokenized styling and reduced semantic hard-coded colors.
- Expanded `verify:ui-standards` to fail if browser prompt/confirm calls reappear.

## UI standardization final consolidated pass (2026-08-12)

- Completed project-owned primitive coverage for all 64 supplied UI components, including the remaining menu/overlay/date/data/message/utility patterns.
- Extracted all static JSX presentation into `apps/web/app/ui-static.css`; static `style={{...}}` count is now zero and the extractor is safe to re-run without deleting prior generated classes.
- Migrated all text-like raw inputs, selects and textareas outside `components/ui` to shared primitives. Remaining native inputs are specialized checkbox/radio/range/color/file/hidden controls.
- Migrated generic `.btn` actions to the shared `Button`; retained purpose-specific tab/menu/toolbar/canvas markup under the common normalization layer.
- Centralized theme preset, project palette and configurable color literals in `components/theme/themeTokens.ts`; TSX hard-coded hex count is zero.
- Retired duplicate generic control rules from legacy `globals.css` and kept one top-level `:root` token block.
- Added strict source regression gates for static inline styles, raw reusable form controls, TSX hex colors, modal behavior, browser prompt/confirm calls and complete component inventory.
- Added `apps/web/e2e/ui-standards.spec.ts` for 320/768/1024/1440 overflow checks, control geometry/focus, light/dark axe checks, skip navigation and tab semantics.
- Source verification in this delivery: F29-F42 65/65, Asana parity 25/25, UI standards 94/94. Full browser/build execution still requires installed workspace dependencies.

## Full code/connectivity production-hardening pass (2026-08-12)

- Fixed the remaining workflow-editor duplicate JSX attribute build blocker and added a syntax regression gate over all TS/TSX sources.
- Enforced organization ownership in automation condition/action mutations and run-step reads.
- Completed same-origin REST + Socket.IO routing, credential-aware CORS and centralized session-expiry/network recovery.
- Made production migrations fatal, moved container health to real DB/Redis/storage readiness, and added idempotent private MinIO bucket initialization.
- Protected all authenticated top-level routes, removed the client-side session sentinel, added real logout cleanup, and secured break-glass cookies in production.
- Removed remaining click-only non-interactive patterns, nested interactive buttons and misleading no-op controls; implemented actual saved-view/sort/filter/collapse behavior where exposed.
- Added accessible names to symbolic calendar/timeline controls and retained shared focus/geometry normalization.
- Hardened BullMQ worker idempotency with a PostgreSQL advisory transaction lock and wired real retention jobs plus an API producer/async purge endpoint.
- Replaced silent/mock production boundaries with explicit real/disabled AI, integration, report-mail and outbound-webhook adapters; outbound webhooks include timeout, HTTPS and SSRF protections.
- Added `scripts/verify-production-readiness.cjs`, which now passes 39/39 source checks and confirms all 456 statically-resolvable frontend request-method variants plus all 31 configured AdvancedModuleHub endpoints map to 597 backend routes.
- See `docs/FULL_CODE_CONNECTIVITY_AUDIT.md` and `docs/FINAL_SOURCE_VERIFICATION.txt` for scope, evidence and the remaining runtime certification boundary.

## UI token/runtime-style debt cleanup (2026-08-13)

- Added `apps/web/app/design-tokens.css` as the single authored CSS literal-color registry and imported it before all application style layers.
- Replaced literal hex/rgb/rgba values in `globals.css` and `ui-standards.css` with centralized `--pm-*` tokens while preserving existing visuals; `globals.css`, `ui-static.css`, and `ui-standards.css` now contain zero authored literal colors.
- Added project-palette tokens and retained data/user-selected colors as controlled runtime values rather than embedding screen-specific presentation literals.
- Added shared `RuntimeStyle` / `useRuntimeCssVars` utilities so runtime geometry, progress, canvas positions, measured overlays, and user-selected colors flow through CSS custom properties without JSX `style` attributes.
- Migrated all remaining route/component JSX style attributes to the shared runtime bridge. JSX `style=` count is now zero.
- Added reusable runtime CSS classes for width, size, position, rectangle geometry, indentation, donut progress, background swatches, and theme previews.
- Strengthened `verify-ui-standards.cjs`: dynamic JSX style attributes are now release-blocking; authored CSS color literals outside `design-tokens.css` are release-blocking; style-layer import order and runtime-style exports are verified.
- Current source gates: F29-F42 65/65, Asana parity 25/25, UI standards 94/94, production readiness 39/39; TS/TSX syntax parse 551/551 clean.
