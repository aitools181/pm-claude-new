# Coolify 4.x read-only variables (2026-08-14, v6.4)

## I. APP_URL stuck at http://localhost:3000, so CORS rejected every login
`printenv` in the api container showed:

    APP_URL=http://localhost:3000
    CORS_ORIGINS=

Coolify creates an environment variable for every `${VAR}` in the compose file
and seeds it with the text after the separator - for `${APP_URL:-http://localhost:3000}`
that is the default, and for `${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}`
that is the *guard message*, which explains the earlier 29-character database
password reading `Set POSTGRES_PASSWORD in .env`. Each entry is then marked
"Managed by Docker Compose" and is read-only in the UI on 4.x, so `APP_URL`
could not be corrected there.

Fixes:
- `docker-compose.yml` forwards `SERVICE_URL_WEB`, `SERVICE_FQDN_WEB`,
  `COOLIFY_URL` and `COOLIFY_FQDN` to the api service as `PUBLIC_ORIGIN_HINTS`.
  Those hold the domain Coolify assigns to the web service, so a deployment can
  work without editing anything.
- `canonicalOrigin` accepts a bare hostname (`SERVICE_FQDN_WEB` carries no
  scheme) by assuming `https://`.
- Values that still read like a compose guard message (`/^Set\s/i`) are ignored
  rather than added to the allow-list as garbage.
- The API warns at boot when `SESSION_SECRET` is missing, shorter than 32
  characters, or still a placeholder - that value is published in this
  repository, so sessions signed with it are predictable.
- The compose file marks the one line to edit if the hints do not resolve, and
  `docs/operations/COOLIFY_DEPLOY.md` documents the whole mechanism.

---

# CORS rejection on login (2026-08-14, v6.3)

## H. "Origin is not allowed by CORS"
With the proxy fixed (G) the browser finally reached the API, and the API
rejected it. `main.ts` built the allow-list from `APP_URL` plus `CORS_ORIGINS`
and compared the incoming `Origin` header by exact string equality:

    if (!origin || allowedOrigins.has(origin)) return callback(null, true);

An `Origin` header is always bare - scheme, host and port, no trailing slash and
no path. So `APP_URL=https://pm.example.com/` (or a URL with a path, or `http`
where the site is served over `https`) never matched, and every login failed. A
configuration typo, presented as a security decision, with a message that named
neither the origin nor what was expected.

Fixes:
- Both sides are canonicalised through `new URL(value).origin`, so scheme, host
  and port are compared and trailing slashes or paths in `APP_URL` no longer
  matter. Genuinely different origins are still rejected.
- The rejection message now names the offending origin and lists the allowed
  ones, or says explicitly that `APP_URL` is unset.
- The effective allow-list is logged at boot next to the listening line, so a
  misconfiguration is visible before anyone tries to log in.

---

# API proxy misconfiguration (2026-08-13, v6.2)

## G. Every API call returned 500 - "Request failed" on login
Proved by comparing two calls from inside the web container:

    fetch("http://api:4000/api/v1/auth/login")      -> 401 {"error":{"code":"UNAUTHENTICATED",...}}
    fetch("http://127.0.0.1:3000/api/v1/auth/login") -> 500 Internal Server Error

The API was healthy; the Next rewrite in front of it was not.

`next.config.mjs` builds the rewrite destination from
`process.env.INTERNAL_API_URL`. Next evaluates `rewrites()` **during
`next build`** and writes the resolved destination into
`.next/routes-manifest.json`; it is not re-read at runtime. `INTERNAL_API_URL`
was supplied only in the compose `environment:` block, so at build time the
fallback applied and the manifest was baked as:

    /api/:path*       -> http://localhost:4000/api/:path*
    /socket.io/:path* -> http://localhost:4000/socket.io/:path*

The running web container therefore proxied to its own port 4000, where nothing
listens. Next answered with a plain-text 500, which carries no `error.message`,
so `lib/api.ts` fell back to its generic string. `/socket.io` was broken the same
way, so realtime updates never worked either.

Fixes:
- `apps/web/Dockerfile` declares `ARG INTERNAL_API_URL=http://api:4000` and
  promotes it to `ENV` before the build, so the manifest bakes correctly. The
  default means the image is correct even if the arg is not passed.
- The same `RUN` layer asserts the baked destination and fails the build if it
  contains `localhost` - this class of bug can no longer ship silently.
- `docker-compose.yml` passes `INTERNAL_API_URL` under `build.args` as well as
  `environment`.
- `next.config.mjs` documents the build-time evaluation at the point of use.

Verified: rebuilding with the arg set produces
`/api/:path* -> http://api:4000/api/:path*`.

---

# Opaque API errors (2026-08-13, v6.1)

## F. Failed login showed only "Request failed"
`AppErrorFilter` was declared `@Catch(AppError)`. Anything that is not an
`AppError` - a driver error, a missing native binding, an unhandled bug - was
never caught, so Nest's built-in filter answered with:

    { "statusCode": 500, "message": "Internal server error" }

`apps/web/lib/api.ts` reads `body.error.message`, found nothing there, and fell
back to its generic string. Every genuine 500 therefore looked identical and
carried no diagnostic value.

Note the login path itself throws `AppError` for every expected outcome (bad
credentials, lockout, rate limit, validation), so "Request failed" always meant
an *unexpected* failure - or a non-JSON response from the proxy, e.g. a 502 when
the API is unreachable.

Fixes:
- `AppErrorFilter` is now `@Catch()`. `AppError` and `HttpException` keep their
  status and message; anything else is logged with its stack via the Nest logger
  and returned as `{ error: { code: "INTERNAL", message: "<Name>: <message>" } }`.
  One response shape for the whole API.
- `lib/api.ts` falls back to `Request failed (HTTP <status>)`, so even a
  malformed or empty error body still tells you the status code.

---

# Sign-in and sign-out (2026-08-13, v6.0)

## D. "Sign in" did nothing - no error, no network request
Two independent defects, either of which alone breaks the button.

**D1. Buttons never submitted their form.** `components/ui/Button.tsx` defaults
to `type = "button"`, and a `<button type="button">` inside a `<form>` does not
submit it. The auth pages render the primary button with no `type` prop, so
`onSubmit` never fired and no request was made - which is why no error appeared,
since the error path lives inside the submit handler.

**D2. The button was disabled whenever autofill filled the fields.** The login
button carried `disabled={busy || !email || !password || ...}`, where `email`
and `password` are React state written by `onChange`. Browser autofill populates
the DOM directly and frequently does **not** fire React's `onChange`, so state
stayed empty and the button stayed disabled. A disabled default button also
suppresses implicit submission, which is why pressing Enter did nothing either.

Fixes:
- Every button that submits a form now sets `type="submit"` explicitly: login,
  recover, reset-password, invite/accept, project list and board task create,
  add section, and TaskDrawer subtask/tag/checklist. The `Button` default is
  deliberately left as `type="button"` - flipping it would make ordinary action
  buttons inside forms submit by accident.
- Auth forms read their values from `FormData(event.currentTarget)`, falling
  back to React state, so autofilled values are always seen.
- Inputs carry `name` attributes so `FormData` can find them.
- Buttons are disabled only while a request is in flight. Empty or invalid input
  now produces a visible message instead of an inert control.
- After a successful login the app performs a full navigation rather than
  `router.push`, so middleware sees the freshly issued session cookie on a real
  document request.

## F. Any render failure produced a blank white page
The app had no error boundaries at all — no `error.tsx`, `global-error.tsx` or
`not-found.tsx`. In the App Router a single client render error unmounts the
whole tree, so the user sees a blank page with nothing to act on and no
indication that anything failed. This is the shape most "kai thatu nathi"
reports take.

Added:
- `app/error.tsx` — segment-level boundary with a retry and a link home.
- `app/(app)/error.tsx` — keeps the rail, sidebar and topbar mounted, so the
  user can navigate away or sign out instead of being stranded.
- `app/global-error.tsx` — last resort for failures in the root layout.
- `app/not-found.tsx` — a styled 404 instead of the framework default.

Verified in a real browser across all 96 routes: previously 17 of them rendered
completely blank when an endpoint returned an unexpected shape; now all 17 show
a readable message and none are blank.

## G. Audit results — no further defects found
Checked and clean:
- `tsc --noEmit` passes for all five workspace packages.
- All 499 frontend `api()` calls resolve to a real backend route with a matching
  HTTP verb — no dead endpoints.
- Every call to a route guarded by `OrgContextGuard` sends the organization
  header (`apiUpload`/`apiDownload` set it internally).
- Server-side rendering: all 96 routes return 200 (or an intentional redirect)
  with no SSR exceptions, which matters now that the `(app)` group is
  `force-dynamic` and renders per request.
- No unguarded browser globals (`window`, `document`, `localStorage`) at render
  time in client components.

## E. Sign out was hard to find
Reachable from four places now, all calling the same `signOut()` helper:
the account menu (top right), the product rail, the sidebar footer, and
Settings -> Account. Added `/logout` as a route, so signing out never depends on
locating a control in the chrome.

---

# Sign-in bug (2026-08-13, v5.9)

## D. Clicking "Sign in" does nothing - no error, no request
`components/ui/Button.tsx` declares `type = "button"` as its default. A
`<button type="button">` inside a `<form>` does **not** submit that form, so
`onSubmit` never fired. The login page renders:

    <form onSubmit={submit}>
      ...
      <UiButton variant="primary" className="btn-block" ...>Sign in</UiButton>
    </form>

with no `type` prop, so the click was inert. No network request was made, which
is why no error appeared - the error path lives inside `submit()`. Pressing
Enter in a field still worked, since implicit submission does not depend on the
button's type.

`AppDialog` already passed `type="submit"` correctly; the auth and inline-create
forms did not.

Fix: added an explicit `type="submit"` to every button that submits a form -
`app/login`, `app/recover`, `app/reset-password`, `app/invite/accept`,
`app/(app)/projects/[id]` (task create, add section, subtask),
`app/(app)/projects/[id]/board` (task create), and `components/work/TaskDrawer`
(subtask, tag, checklist).

The `Button` default was deliberately left as `type="button"` - flipping it
would make every plain action button inside a form submit it by accident.

---

# Runtime failure diagnosed (2026-08-13, v5.8)

## C. API container exits ~5s after start - "dependency failed to start: container api-... is unhealthy"
The build succeeds and all three images are produced; the failure is at startup.
Compose reports "unhealthy" because the container **exited**, not because a
health probe failed (`start_period: 90s` keeps status at `starting` for the
first 90 seconds).

Root cause, from the Postgres container log:

    PostgreSQL Database directory appears to contain a database; Skipping initialization
    FATAL: password authentication failed for user "pm"

The official Postgres image only applies `POSTGRES_PASSWORD` when it initialises
an **empty** data volume. The `pgdata18` volume already held a database, so the
password inside it stayed at its original value while the deployment supplied a
different one. `drizzle-kit migrate` could not connect, the migration guard
(correctly) refused to start the API, and the container exited.

This is not an application bug - no code change fixes it. The remedy is to
align the two:

    docker exec <postgres-container> psql -U pm -d pm_platform \
      -c "ALTER USER pm WITH PASSWORD 'value-from-your-env';"

Changed in 5.8 so this is never opaque again:
- `docker-compose.yml` - the api `command` is now a multi-line script. On
  migration failure it prints `BOOT:FATAL` plus a targeted hint naming this
  exact Postgres behaviour and the `ALTER USER` fix, waits briefly so the log is
  readable, then exits non-zero. Migration failures remain fatal.
- `.env.example` - documents that `POSTGRES_PASSWORD` is applied only on first
  volume creation, and how to rotate it afterwards.

---

# Code review — bugs found & fixed (2026-08-13, v5.7)

## A. Web build fails — /settings/account prerender (Coolify deploy blocker)
`next build` error at `Generating static pages`:

    useSearchParams() should be wrapped in a suspense boundary at page "/settings/account".
    Error occurred prerendering page "/settings/account".

`AccountSettings` calls `useSearchParams()` (to pick up the `?verifySecondary=`
token) directly in the page component. Next.js still attempts to statically
prerender the route at build time, and `useSearchParams()` triggers a
client-side-rendering bailout that requires a `<Suspense>` boundary.

Fixes (two layers, so this class of error stops recurring one page per deploy):
1. `app/(app)/settings/account/page.tsx` — logic moved into
   `AccountSettingsInner`; the default export wraps it in `<Suspense>`.
   Same treatment for `app/(app)/projects/[id]/page.tsx`.
2. `app/(app)/layout.tsx` — added `export const dynamic = "force-dynamic"` and
   `export const revalidate = 0`. Every route in the `(app)` group is already
   gated on the `pm_session` cookie by `middleware.ts`, so none of it can be
   usefully prerendered. The group is now server-rendered on demand.

Verified: `pnpm --filter @pm/web build` completes and every `(app)` route is
reported as dynamic. `@pm/shared`, `@pm/db`, `@pm/api` and `@pm/worker` also build.

## B. Sign out was effectively unreachable after login
`UserMenu` did contain a sign-out item, but two defects hid it:
- The row was a bare `<button>` inside `.menu-item`, a class that only styles
  anchors. The button fell back to user-agent styling and did not read as part
  of the menu.
- The trigger derived its label from a `pm_user_name` cookie that no part of the
  API ever sets, so the control permanently read "PM / Personal / Settings &
  theme" and never looked like an account menu.

Fixes:
- New `apps/web/lib/logout.ts` exporting a single `signOut()` — POSTs
  `/auth/logout`, disconnects the realtime socket, clears `pm_org`, and
  redirects to `/login` even when the API call fails (already-expired session).
- `UserMenu` reads the real name from `/me/profile`, uses Radix `onSelect` so
  the item fires for pointer *and* keyboard activation, and labels the row
  "Log out" with destructive styling.
- Log out also added to the sidebar footer and to Settings → Account, so it is
  reachable from three places.
- `globals.css` normalises `button.menu-item` / `.menu-item > button` and shows
  the signed-in name beside the avatar at >=1100px.

---

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

## Asana missing-feature full-stack completion (2026-08-13)

- Implemented all 40 approved missing Asana-reference fields/controls with frontend + backend persistence/connectivity as applicable.
- Added migration `0033_asana_missing_features.sql` for personal UI preferences, project icons, portfolio metadata/custom columns, AI summary settings and secondary email identities.
- Added saved project view rename/default/duplicate/deep-link/remove/custom-tab management.
- Added Overview goal/portfolio connection flows, rich project brief, AI controls and project activity timeline.
- Added Inbox relevance sort, AI summary/timeframe preference, bulk archive and filter recovery.
- Added Browse Projects portfolio filter/column, last-modified sorting, row favorite and template suggestion strip.
- Added additional email verification/login aliases, primary-email switching, account merge and embedded organization/workspace management.
- Added portfolio Owner/Status/Budget/Service line/custom-column support.
- Completed behavior of Display preferences: login now honors Default landing page, row numbers are consumed in multiple list surfaces, and color-blind mode adds non-color shape/text cues.
- Fixed a stale Calendar import from `AppDialogProvider` to the canonical `AppDialog` module.
- Added `scripts/verify-asana-missing-features.cjs` with 40/40 feature-contract checks.
