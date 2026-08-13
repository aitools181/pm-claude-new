# UI Final Release QA Checklist

Use this after the full stack and browser dependencies are available. The source-level gates are automated; this checklist covers rendered behavior that cannot be proven from source alone.

## Required automated commands

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm build`
- [ ] `pnpm --filter @pm/web typecheck`
- [ ] `node scripts/verify-f29-f42.cjs`
- [ ] `node scripts/verify-asana-screenshot-parity.cjs`
- [ ] `node scripts/verify-ui-standards.cjs`
- [ ] `pnpm --filter @pm/web e2e`

## Reference viewport matrix

For each of 320, 768, 1024 and 1440px widths:

- [ ] No page-level horizontal scrolling.
- [ ] Primary task/content remains first and usable.
- [ ] Page gutter matches the shared breakpoint token.
- [ ] Persistent navigation changes form without changing destination names or task meaning.
- [ ] Tables/charts overflow only inside their local data region.
- [ ] Sticky controls never cover focus, validation or browser safe areas.

## Component consistency spot checks

Compare at least three unrelated routes for each repeated component:

- [ ] Input/select/textarea geometry, radius, border, typography and focus are identical for the same size.
- [ ] Buttons use the same semantic hierarchy and loading/disabled geometry.
- [ ] Checkbox/radio/switch target size and label relationship are consistent.
- [ ] Cards use the same surface/radius/padding contract.
- [ ] Menus/popovers/tooltips stay inside the viewport and use consistent rows/elevation.
- [ ] Dialogs/drawers restore focus after close.
- [ ] Empty/loading/error/success states preserve layout and provide a clear next action.
- [ ] Tabs expose one selected state and work with arrow keys/Home/End.

## Accessibility

- [ ] Keyboard-only completion of primary workflows.
- [ ] Focus indicator is visible against every surface/theme.
- [ ] 200% zoom retains all content/actions.
- [ ] 400% zoom reflows except allowed local data regions.
- [ ] Light and dark themes pass contrast/axe checks.
- [ ] Forced-colors/high-contrast mode preserves focus, current, selected and error states.
- [ ] Reduced-motion mode removes/simplifies nonessential movement.
- [ ] Icon-only actions have accessible names.
- [ ] Forms announce labels, helper/error messages and invalid state.

## Content extremes and system states

- [ ] Longest names, translated strings and large numbers do not clip/overlap.
- [ ] Empty, loading, error, restricted, offline and success states are present for production workflows.
- [ ] Failed validation/network requests preserve valid entered data.
- [ ] Destructive actions explain consequences and provide confirmation/recovery where required.
- [ ] Toast/error messages do not cover the current primary action.

## Release decision

- [ ] No release-blocking accessibility issue.
- [ ] No clipped/overlapping/unreadable page content.
- [ ] No page-level horizontal overflow.
- [ ] No same-semantic-component visual or behavior drift discovered during spot checks.
- [ ] Any approved exception has an owner, reason, affected components and review date.
