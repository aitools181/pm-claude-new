# Asana v4.1 UI Reference Implementation

## Scope

This pass uses the uploaded `asana_FULL_SMART_DEDUPE_function_journey_screenshots_v4_1.zip` as the visual reference for application structure and interaction density. It deliberately does **not** copy Asana branding or lock the product to one palette. The layout, spacing, hierarchy, list/board geometry, settings surface, and navigation structure are Asana-like; color is user-selectable through a Slack-like workspace theme system.

The reference pack contains 158 recorded journey items. It also explicitly reports 15 capture gaps and 8 account/plan-unavailable states, so this implementation only treats clearly captured states as authoritative.

## Visual reference decisions applied

### Global application shell

Reference anchors: `062__project_view_List.png`, `063__project_view_Board.png`, `071__project_view_Overview.png`, `128__inbox.png`, `132__projects_directory.png`.

- Top bar: 48px.
- Product rail: 64px.
- Desktop workspace/sidebar region: 180px reference width.
- Main desktop content starts after the combined 244px left chrome.
- Search is centered in the desktop top bar and uses compact pill geometry.
- Navigation density is intentionally compact so project/task content receives the dominant visual area.
- Mobile collapses the left navigation and reduces search to an icon-size control so the current task/project retains priority.

### Project chrome

Reference anchors: `062__project_view_List.png`, `063__project_view_Board.png`, `065__project_view_Timeline.png`, `068__project_view_Dashboard.png`, `071__project_view_Overview.png`.

- Project header aligned to the reference 48px band.
- Project icon reduced to a compact 28px visual mark.
- Project title uses a restrained 18px hierarchy.
- Project view tabs use a 36px band.
- View toolbars use a 56px band with compact 32px controls.
- List rows use a compact ~36px rhythm.
- Board columns use a fixed 304px working width and flatter, low-shadow cards.
- Cards, tables, overview surfaces, and dashboards use a calmer/less elevated visual hierarchy.

### Settings

Reference anchors: `139__account_settings_Display.png`, `141__account_settings_Account.png`.

- Settings is presented as a centered modal-like surface over a dimmed application background on desktop.
- Settings navigation is a left rail on desktop and a horizontally scrollable section selector on mobile.
- The content area and tab geometry were adjusted toward the captured Asana settings layout.
- Mobile settings becomes a full-height surface instead of a constrained modal.

### Browse/projects and Inbox

Reference anchors: `145__inbox_deep.png`, `149__auto_explore_inbox_deep_04_Sort_Newest_Sort_Newest.png`, `154__auto_explore_projects_browse_deep_04_Add_to_starred.png`, `155__auto_explore_projects_browse_deep_05_Dismiss_template_suggestions.png`.

- Page headers are flatter and more compact.
- Tabs/filters/toolbars use a consistent low-height product rhythm.
- Data regions use flat surfaces with subtle dividers instead of stacked card elevation.
- This pass changes visual hierarchy only. Reference-only functional fields that are not currently in the product are listed separately in `ASANA_UI_FIELD_GAP_DECISION.md` and were **not** developed without approval.

## Slack-like user theme system

### Built-in workspace themes

The product now exposes 16 complete workspace color recipes:

- Asana
- Aubergine
- Huddle
- Lagoon
- Mocha
- Graphite Gold
- Raspberry
- Mint
- Ocean
- Forest
- Sunset
- Rose
- Indigo
- Teal
- Cobalt
- Sand

Each recipe defines the semantic shell colors for:

- primary action/accent
- secondary accent
- top bar
- product rail
- workspace sidebar
- selected/hover sidebar surface

Component geometry and behavior do not change when a theme changes.

### User-created theme

Users can create a custom workspace theme by choosing all six shell colors above. The preference is persisted through the existing `/ui/preferences` API and `user_ui_preferences.customTheme` JSON field.

The runtime calculates readable foreground colors separately for the top bar, product rail, sidebar, and sidebar hover state. The browser `theme-color` meta value is also updated to the active top-bar color.

The existing single custom-accent option remains available for users who want to retain a preset shell and only change action/highlight color.

## Changed source areas

- `apps/web/components/theme/themeTokens.ts`
- `apps/web/components/theme/ThemeProvider.tsx`
- `apps/web/app/(app)/settings/display/page.tsx`
- `apps/web/components/settings/SettingsShell.tsx`
- `apps/web/app/globals.css`
- `scripts/verify-asana-v4-1-reference.cjs`

## Verification

The new reference-specific verifier checks 30 structural/theme requirements, including reference shell dimensions, complete theme recipes, contrast-aware custom colors, centered desktop search, compact project/list/board geometry, settings modal behavior, and mobile adaptations.

This verifier is additive to the existing Asana parity, UI-standard, production-readiness, and F29-F42 source checks.

## Reference limitations

The uploaded capture itself states that it is not a universal representation of every Asana account. Feature visibility changes with plan, permissions, feature flags, AI/add-ons, and workspace data.

The pack currently reports:

- 15 `gap` states, mostly task-detail selector capture failures plus the project actions menu.
- 8 `unavailable` states: Calendar, Gantt, Workflow, Messages, Files, Customize, Goals, and Reporting for the audited Asana account/project.

No unavailable state was used as evidence that this product should remove a feature. No unresolved capture gap was used to invent exact fields.
