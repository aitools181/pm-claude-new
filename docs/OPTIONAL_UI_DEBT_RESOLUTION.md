# Optional UI debt resolution

**Completed:** 2026-08-13

This pass closes the two remaining UI-maintainability items from the prior audit without changing the intended product appearance.

## 1. Legacy CSS literal palette — resolved

`apps/web/app/design-tokens.css` is now the single authored CSS color registry and is imported before every application style layer. `globals.css`, `ui-static.css`, and `ui-standards.css` consume centralized `--pm-*` semantic/component tokens and contain no authored literal hex or numeric `rgb()/rgba()` values.

The registry includes foundation roles, semantic status/action roles, component-scoped roles, project palette roles, theme roles, and visualization-specific roles where a shared foundation token would not express the intended meaning. This keeps literal implementation values out of route/component CSS while preserving exact current visual output.

Current token integrity: **418 definitions / 418 references / 0 missing references**.

## 2. Dynamic JSX inline styles — resolved

All remaining JSX `style` attributes were removed. Runtime-only values now pass through `components/ui/RuntimeStyle.tsx` using CSS custom properties and `useLayoutEffect`, while the visual property declarations remain in the stylesheet.

Covered cases include runtime width/height, progress values, Gantt/chart/whiteboard geometry, task indentation, measured overlay placement, project/user-selected colors, donut progress, and theme preview swatches.

Current JSX `style=` count under `apps/web`: **0**.

## Regression protection

`node scripts/verify-ui-standards.cjs` now fails when:

- authored CSS literal colors appear outside `design-tokens.css`;
- static or dynamic JSX `style` attributes reappear;
- the design-token style layer is imported in the wrong order;
- the shared runtime-style bridge or its barrel export is missing.

## Verification snapshot

- F29-F42: **65/65**
- Asana source parity: **25/25**
- UI standards: **94/94**
- Production readiness: **39/39**
- TS/TSX syntax/transpile: **551/551**
- CSS parse: **4/4**, zero parse errors
- CSS color literals outside the central registry: **0**
- JSX `style=` attributes: **0**

Full runtime build/browser certification still requires the repository's Node 20 dependency environment and Docker, as documented in `FINAL_SOURCE_VERIFICATION.txt`.
