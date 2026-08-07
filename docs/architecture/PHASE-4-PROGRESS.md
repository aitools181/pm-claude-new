# Phase 4 — Custom Fields, Types, Roles, Workflow Core

## Part 1 (this increment) ✅ — Custom Fields + Custom Types (backend)
- **Custom field library**: definitions with typed kinds (text, number, date,
  checkbox, select+options, user, url), org/project/type scope, required flag,
  and JSON config (min/max/maxLength/pattern).
- **Validation engine**: every field type validates on write with a precise
  reason; values are stored in **typed columns** (no stringly-typed blob).
- **Field-level security**: restricted fields are visible only to allowed roles
  (org admins always). `valuesForItem` / export return the SAME security-filtered
  projection used by API/search/activity, so an unauthorised field never leaks.
- **Custom Work Item Types**: user-defined types with icon + hierarchy and
  attached fields; required type-fields enforced via `assertRequiredForType`.
- Scoped role-assignment table added (foundation for the Part 3 role builder;
  already powering field visibility).

## Acceptance tests ✅ (Testcontainers)
Text maxLength · number min/max · date validity · select option validity · url
validity · required blocks empty · restricted field hidden from unauthorised
users and shown to authorised (and org admins) · required-per-type enforced.

## Next parts ⏳
- Part 2 — **Workflow builder**: statuses + transitions, draft→validate→publish
  (published immutable), transition conditions/validators with precise block
  reasons, available-actions endpoint, versioning + migration preview.
- Part 3 — **Custom role builder** + scoped assignments + permission preview,
  configuration export/import, audit events for publish/role changes.
- Part 4 — **Config UI**: field/type builders, role editor, permission preview,
  workflow canvas, transition panel, publish/migration wizard.

## Part 2 ✅ — Workflow builder (backend)
- **Authoring** on draft versions only: statuses (with categories + one initial),
  transitions (from a status or from any), and per-transition rules —
  **conditions** (role, assignee-set), **validators** (field-required,
  comment-required), and **post-actions** (assign actor, set progress).
- **Validate → Publish**: publish runs validation, then marks the version
  **published and immutable** (any further edit is rejected) and points the
  workflow at it.
- **Runtime**: bind an item to the published version at its initial status;
  `available-actions` offers only transitions whose conditions pass for the user;
  `transition` re-checks conditions (precise reason, e.g. requires role "lead"),
  runs validators (precise reason, e.g. field must be set), applies post-actions,
  and syncs the item's status/category.
- **Versioning + migration**: branch a published version into a fresh draft
  (deep clone of statuses/transitions); `migration-preview` maps bound items to
  the new version by status key and flags any that need an explicit mapping;
  `migrate` repoints items (deterministic, mapping-checked).

## Acceptance tests ✅ (Testcontainers)
Published version immutable · available-actions offers only valid transitions ·
invalid transition blocked with precise reason · role-gated transition hidden and
blocked for users without the role · validator enforced with precise reason then
succeeds once satisfied · new version branches and migrates previewed items by key.

## Part 3 ✅ — Role builder + permission preview + config export/import + audit
- **Single permission resolver** now backs BOTH the AuthzGuard and the preview,
  so a preview can never disagree with a real request. Authorization is genuinely
  user-role-based (org- and project-scoped assignments); `organization_admin`
  resolves to every capability.
- Roles are assigned at **setup** (first admin → organization_admin) and on
  **invitation accept** (the invite's role), so authorization keeps working end to end.
- **Custom role builder**: create roles with a permission set, edit non-system role
  permissions, assign/unassign at org or project scope.
- **Permission preview** endpoint returns exactly the resolver's capability set for a
  user (+ optional project scope) — matches actual outcomes by construction.
- **Configuration export/import**: portable document of custom fields (+options,
  +visibility), custom types, and roles (+permissions); import is idempotent on keys.
- **Audit events** for role create / permissions-changed / assign / unassign,
  configuration import, and **workflow publish** (audit dependency is optional so
  it never couples the engine to logging in tests).

## Acceptance tests ✅ (Testcontainers)
Preview list equals the resolver's set and matches per-capability guard checks ·
org admin resolves to every capability · role create/assign write audit events ·
config export→import round-trips fields and roles into another org · workflow
publish records an audit event.

## Part 4 (frontend) ⏳ — NEXT (final Phase 4 turn)
Field/type builders, role editor with live permission preview, workflow canvas +
transition/rule panels, and the publish + migration wizard. Then Phase 4's exit
gate (three project templates using distinct types/fields/workflows without code
change, passing permission + migration tests) is fully demonstrable in the UI.

## Part 4 ✅ — Configuration UI
- **Configure hub** linking the four builders.
- **Custom Fields builder**: create typed fields (options for select, required,
  visibility + allowed roles for restricted); live list.
- **Work Item Types builder**: define a type with an icon and attach fields,
  toggling each attached field required/optional.
- **Roles editor** with a **live permission preview**: build a role from the
  capability catalogue, assign roles to members, and preview a user's exact
  capabilities — rendered from the very endpoint the guard's resolver powers.
- **Workflow editor**: version tabs (draft/published), a status/transition canvas,
  add-status / add-transition panels (draft only), validate, publish (locks the
  version), branch a published version to a new draft, and a migration preview.

**Phase 4 COMPLETE** — Custom Fields, Custom Types, custom Roles, and the Workflow
builder, all configurable from the UI with no code changes. Exit-gate intent met:
distinct types/fields/workflows per team, permission preview that matches real
outcomes, published-workflow immutability, and versioned migration.

Backend read endpoints added for the UI (all additive): `/roles/capabilities`,
`/members`, and workflow reads (`GET /workflows`, `GET /workflows/:id`,
`GET /workflows/versions/:versionId/detail`).
