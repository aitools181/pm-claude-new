# Plans & pricing (Turn 2)

Migration 0031 adds `plans` and `organization_plans`.

## Model
- A **plan** carries a price (minor units, so no float drift), **limits**
  (`maxMembers`, `maxProjects`, `maxWorkItems`; `null` = unlimited) and the list of **optional
  modules** the tier includes. Shipped catalogue: Free, Pro, Business, Enterprise — seeding is
  idempotent and never overwrites edited prices.
- An organization has at most one subscription. Organizations without one fall back to Free, so
  entitlements always resolve.

## Enforcement (the important part)
- **Limits** are checked before the billable record is created: `ProjectsService.create` calls
  `assertWithinLimit`, which refuses with a plan-aware message once the tier's cap is reached.
- **Modules are plan-gated in both directions**: enabling a module outside the plan is refused,
  and `ModulesService.isEnabled` treats the plan as a ceiling — after a downgrade the module stops
  working even though the organization's flag is still on, and re-upgrading restores it without
  losing any data or configuration.
- `seats` on a subscription overrides the plan's member limit for negotiated deals.
- Retiring a plan hides it from pricing but never strips organizations already on it.

## Surfaces
- `GET /pricing` — public, no session: powers `/pricing`.
- `GET /billing/entitlements` — the signed-in organization's plan, limits, modules and live usage;
  surfaced on Workspace settings.
- `/superadmin/plans` — platform-only CRUD: edit monthly/yearly price and limits inline, toggle
  public/hidden, retire, and assign a plan to any organization. Assignments are audited.

## Versioning
`APP_VERSION` in `packages/shared/src/version.ts` is exposed via `GET /superadmin/version` and
rendered as a badge in the platform console — visible to platform administrators only.
MAJOR for big updates, MINOR for small ones. See VERSION.md.
