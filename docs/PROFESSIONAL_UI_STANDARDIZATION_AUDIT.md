# Professional UI Standardization Audit — Final Consolidated Pass

## Scope

This audit applies the attached Professional UI Design Standards Rulebook to the project-management web application while preserving its Asana-like information architecture. The goal is consistent production UI behavior and geometry—not screen-by-screen cosmetic cloning.

The supplied component inventory contains **64 components**. Every item now has a shared project-owned implementation or canonical primitive under `apps/web/components/ui`; see `docs/UI_COMPONENT_CONTRACT.md`.

## Baseline defects and final resolution

### 1. Same component could drift between routes — resolved at source level

Earlier screens mixed route CSS, raw controls, multiple token roots and hundreds of JSX `style` objects. This allowed fields, buttons, cards and state treatments to differ by screen.

Final implementation:

- `app/design-tokens.css` is the single authored CSS color/foundation registry and loads before feature CSS;
- `app/ui-standards.css` is the last UI layer and owns the shared component geometry/states;
- `app/ui-static.css` contains extracted static route presentation and loads before the standards layer;
- static JSX presentation is no longer allowed by the UI verification gate;
- repeated spacing uses the 4px token scale;
- legacy duplicate generic button/input/icon-button/select rules were retired from `globals.css`;
- the top-level legacy token source is consolidated to one alias-only `:root` block;
- `globals.css`, `ui-static.css`, and `ui-standards.css` contain **0 literal authored hex/rgb/rgba colors**; literals are centralized in `design-tokens.css`.

### 2. Form controls were behaviorally inconsistent — resolved for reusable text controls

All reusable text-like inputs, selects and textareas outside `components/ui` were migrated to `Input`, `Select` and `Textarea`. `Field` provides persistent labels, helper/error association and `aria-invalid` behavior. Raw inputs that remain are specialized native controls such as checkbox, radio, range, color, file or hidden inputs and are covered by the normalization layer or a dedicated primitive.

### 3. Browser-native prompt/confirm UI broke product consistency — resolved

All product workflows now use the queued `AppDialogProvider`/shared dialog system. Native browser `prompt()` and `confirm()` counts are both zero.

### 4. Modal accessibility varied by screen — resolved

Current modal surfaces use shared focus containment, Escape handling, scroll locking and focus restoration. The verification gate rejects `modal-backdrop` implementations that do not use the shared dialog/modal behavior.

### 5. Theme customization could weaken focus — resolved

Custom accent no longer overwrites the focus token. Theme preset/project palette values were moved to `components/theme/themeTokens.ts`, and TSX contains no hard-coded hex color literals.

### 6. Toast severity/announcement behavior was incomplete — resolved

The shared toast supports neutral/success/warning/error tones, live-region semantics, persistent errors by default, interaction pause/resume, de-duplication and a three-item queue cap.

### 7. Generic component coverage was incomplete — resolved

The final pass added canonical primitives for the remaining supplied inventory, including Popover, Hover Card, Drawer/Sheet, Combobox, Context Menu, Dropdown Menu, Menubar, Date Picker/Calendar, Data Table/Table, Carousel, Message/Bubble/Scroller, Attachment, Chart frame, Questionnaire, Command, Resizable, Sidebar, Input Group, OTP, Avatar, Breadcrumb and typography utilities. The final interaction polish also added collision-aware popover placement, complete keyboard traversal for menus/combobox/command surfaces, Escape dismissal for supplementary overlays, sortable table headers, keyboard carousel/resizer controls and calendar arrow/Home/End/PageUp/PageDown navigation.

## Shared production defaults implemented

| Area | Implemented standard |
|---|---|
| Spacing | 4px token base; route static margin/padding/gap normalized to token steps |
| Page gutters | 32px desktop / 20px tablet / 16px mobile |
| Controls | 40px compact / 44px standard / 48px large-touch |
| Touch targets | 48 × 48px preferred |
| Radius | 8px default |
| Icons | 20px default |
| Body text | 16px / 24px, compact 14px / 20px |
| Content max | 1440px |
| Focus | Shared 2px high-contrast focus ring |
| Responsive | Reference behavior at 320 / 768 / 1024 / 1440 widths |
| Accessibility | Reduced motion, forced colors, semantic labels/states, modal focus management |
| Themes | Semantic tokens with centralized configurable palette data |

## Source migration performed

### Static presentation

`scripts/extract-static-ui-styles.cjs` extracted route-local static JSX styles into `app/ui-static.css`. The script is now re-runnable without deleting prior generated classes: it merges existing generated rules before adding new ones.

Current result: **0 static JSX `style` objects and 0 dynamic JSX `style` attributes**. Data-driven geometry, progress, user-selected colors and measured overlay positions now flow through the shared `RuntimeStyle` / `useRuntimeCssVars` bridge as CSS custom properties, while CSS continues to own the visual properties.

### Form controls

Reusable text, number, date, email, URL and similar entry controls were migrated to `UiInput`; selects to `UiSelect`; textareas to `UiTextarea`. The final gate reports **0 raw text-like input/select/textarea outside `components/ui`**.

### Generic buttons

Generic `.btn` actions were migrated to the shared `Button` with semantic variants and size props. Purpose-specific markup—tabs, toolbar toggles, menu rows, canvas controls, icon buttons—remains semantically specialized and is normalized by the same token/focus layer rather than being forced into a generic button appearance.

### Dynamic state styling

Selected, active, error, success, conflict, redacted and health states that were previously encoded by route-local inline visual styles now use shared classes/data attributes and semantic tokens. Runtime-only values such as progress widths, proof/whiteboard coordinates, popover placement, resize dimensions and user project colors are routed through `RuntimeStyle` / `useRuntimeCssVars`; route/component TSX contains no `style` attribute.

### Legacy CSS

- `design-tokens.css` is the only authored CSS file containing literal color values;
- `globals.css`, `ui-static.css`, and `ui-standards.css`: **0** literal hex/numeric rgb/rgba values;
- top-level `globals.css` `:root`: consolidated to **1 alias-only block**;
- duplicate generic `.btn`, `.input`, `.icon-btn`, `select.input` and modal backdrop definitions were retired where the shared standards layer owns the role;
- core control definitions now live in `ui-standards.css`.

## Current code inventory after final pass

| Signal | Final state | Interpretation |
|---|---:|---|
| Static JSX style objects | **0** | Enforced failure if reintroduced |
| Dynamic JSX style attributes | **0** | Runtime values use the controlled CSS-variable bridge |
| Hard-coded hex in TSX | **0** | Theme/config colors centralized in token source |
| Raw text-like input outside UI primitives | **0** | Shared form primitive enforced |
| Raw select outside UI primitives | **0** | Shared select primitive enforced |
| Raw textarea outside UI primitives | **0** | Shared textarea primitive enforced |
| Browser `prompt()` | **0** | Product dialog service |
| Browser `confirm()` | **0** | Product confirmation service |
| Legacy top-level `:root` | **1** | Alias-only; values centralized in `design-tokens.css` |
| Supplied component coverage | **64 / 64** | Shared canonical implementation exists |

The codebase still contains native `<button>` tags and specialized input types where the semantic pattern is not a generic Button/Input (for example tabs, toolbar/menu rows, file/color/checkbox/radio/range controls). These are not counted as visual drift: their geometry/states are normalized by the shared CSS layer and reusable cross-screen patterns now have dedicated primitives.

## Automated enforcement added/expanded

`node scripts/verify-ui-standards.cjs` now checks, among other rules:

- required CSS order (`design-tokens.css` → `globals.css` → `ui-static.css` → `ui-standards.css`);
- foundation spacing/gutter/control/radius/icon/container tokens;
- reduced-motion and forced-colors support;
- one top-level legacy token root;
- retirement of duplicate generic control rules;
- complete 64-component shared inventory;
- Field, Toast, Dialog and shell accessibility contracts;
- zero static JSX styles and zero dynamic JSX style attributes;
- zero literal authored colors outside `design-tokens.css`;
- zero TSX hex colors;
- zero raw text-like input/select/textarea outside shared UI;
- zero native browser prompt/confirm flows;
- shared behavior for all current modal-backdrop implementations.

A new Playwright/axe suite, `apps/web/e2e/ui-standards.spec.ts`, covers the rulebook reference widths, page-level horizontal overflow, minimum control geometry, focus visibility, light/dark accessibility smoke tests, skip navigation and tab semantics when the full stack is available.

## Verification results in this delivery

- `node scripts/verify-f29-f42.cjs` — **65 passed, 0 failed**; **551 source files** and **96 tables** checked.
- `node scripts/verify-asana-screenshot-parity.cjs` — **25 / 25 passed** after updating the theme check to the centralized token source.
- `node scripts/verify-ui-standards.cjs` — **94 checks passed**.

## Environment limitation / release QA still required

A real Next.js build and Playwright browser run could not be executed in this environment because repository dependencies are not installed and the configured `pnpm` package manager cannot be downloaded without registry/network access. This is an execution-environment limitation, not a claimed pass.

Before production release, run the existing full-stack commands in a dependency-enabled environment:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @pm/web typecheck
pnpm --filter @pm/web e2e
```

The added E2E suite should then be used as the final visual/accessibility gate at 320, 768, 1024 and 1440 widths, both light/dark themes, keyboard navigation and axe checks.

## Final assessment

The source-level UI standardization work requested in this audit is consolidated in this delivery: one component contract, complete supplied component coverage, standardized reusable form/action/overlay behavior, no static JSX visual exceptions, no TSX semantic hex literals, no native prompt/confirm UI, and automated guards to prevent regression.


## Production hardening correction pass — 2026-08-12

A full source-level code/connectivity correction pass was completed after the UI standardization pass. The pass corrected the previously identified build blocker, tenant-isolation gaps, auth/realtime topology, deployment readiness, object-storage initialization, worker durability, outbound integration boundaries and keyboard/accessibility regressions.

Additional source gates now enforce:

- organization-scoped automation authoring and run-step reads;
- same-origin REST and Socket.IO proxying plus credential-aware CORS;
- fatal production migrations, readiness on database/Redis/storage and MinIO bucket initialization;
- protection of every top-level authenticated route, server logout and production-secure break-glass cookies;
- no click-only non-interactive rows, no nested interactive controls inside buttons and no misleading raw no-op buttons;
- centralized network/401 recovery;
- advisory-lock-backed worker idempotency and real BullMQ retention jobs;
- production AI/integration/report/webhook adapters that are real or explicitly disabled rather than silently mocked;
- static frontend/backend route compatibility, including endpoints supplied as data to `AdvancedModuleHub`.

Final source results for this correction pass:

- F29-F42 structural verification: **65/65 passed**, **551 source files**, **96 tables**;
- Asana screenshot-parity source checks: **25/25 passed**;
- UI standards gate: **94/94 passed**;
- production-readiness gate: **39/39 passed**;
- TypeScript/TSX parse syntax: **551/551 files**;
- frontend/API route contract: **456 statically-resolvable request-method variants** plus **31 configured AdvancedModuleHub endpoints** all map to **597 backend routes**.

The runtime release gate remains separate. This packaging environment has Node 22 rather than the repository-required Node 20, has no installed workspace dependencies, cannot reach the package registry to provision pnpm dependencies, and has no Docker runtime. Therefore a semantic `tsc --noEmit`, Next/Nest production build, Testcontainers/Docker integration run and rendered Playwright/axe run are **not claimed as passed here**. Run `docs/FULL_CODE_CONNECTIVITY_AUDIT.md` and `docs/UI_FINAL_QA_CHECKLIST.md` in a Node 20 + Docker environment before production deployment.
