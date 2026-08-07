# Platform console — instance-level administration (Turn 1)

Adds a super-admin tier above organizations. Migration 0030 adds `platform_admins`.

## Authority model
- Platform administrators live in their own table, deliberately **not** an organization role.
  An `organization_admin` is not a platform admin, and F29 already refuses to map an IdP group
  to an instance-level role — so instance authority cannot be escalated from inside a tenant.
- `PlatformAdminGuard` runs after `SessionGuard` and is the only way into `/superadmin` writes.
- `GET /superadmin/me` is session-guarded only, so the UI can hide the console without leaking.

## Privacy boundary
A platform administrator manages the **instance**, not tenant content. The console exposes
organization metadata and aggregate counts (members, projects, work items) plus module and flag
state — never work item titles, descriptions or comments.

## What it does
- **Organizations**: list with counts; suspend / reactivate / archive.
  Suspension is now genuinely enforced — `OrgContextService.assertMembership` refuses any request
  for a non-active organization, so a suspended tenant is closed at the API, not merely hidden.
- **Module entitlements**: per-organization optional-module toggles (chat, ai, service_management,
  …) written to the existing feature-flag table; disabled modules are refused by the API.
  This is the hook the plan/pricing tier will drive in Turn 2.
- **Platform flags**: instance-wide flags stored on the null-organization scope.
- **Administrators**: grant by email, revoke. The **last administrator cannot be revoked**, which
  prevents permanently locking the instance out.
- **Audit**: every mutation writes an instance-scope `audit_events` row and is listed in the console.

## Bootstrap
First-run setup makes the first account the instance owner (platform admin) and records an audit
event. `PlatformAdminService.bootstrap()` is idempotent for existing installations.

## Verified (real Postgres, 16 checks)
Bootstrap; ordinary member and organization_admin both denied; guard rejects non-admins; grant,
duplicate-grant rejection, revoke; last-admin lockout protection; org list returns metadata only;
suspension blocks access and reactivation restores it; per-org module toggle with unknown-module
rejection; platform flag at instance scope; stats; and all six mutation types present in the audit log.
