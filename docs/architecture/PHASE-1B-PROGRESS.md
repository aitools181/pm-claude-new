# Phase 1B — Operations, Audit, Jobs, Backup Foundation

## Part 1 (this increment) ✅ — Operations core
- **Invitations**: single-use hashed tokens, 7-day expiry, revoke, resend;
  accept creates membership for a new OR existing global user; one pending
  invite per email per org (DB unique). Every action writes an audit event.
- **Security audit events**: append-only; `scope_type` = instance | organization
  with a CHECK constraint (`organization_id` NULL iff instance). Org-scoped read
  behind `audit.read`; no update/delete surface anywhere.
- **Health**: real readiness probes (Postgres `SELECT 1`, Redis `PING`);
  liveness separate.
- **Feature flags**: org flag overrides instance/global default; `feature_flags.manage`.
- **Worker hardening**: idempotency (job_idempotency table, run-once),
  exponential retry/backoff (5 attempts), dead-letter queue on exhaustion,
  and Organization Context verification — scoped jobs refuse without an active
  membership.
- **Frontend**: public invite-accept page, People → invite/list/revoke wired to
  the API, append-only audit log viewer.

## Acceptance tests ✅
- Audit CHECK constraint (all four scope/nullability cases).
- One-pending-invite-per-email uniqueness.
- Worker: effect runs once per idempotency key; scoped job refuses without membership.

## Part 2 (NEXT) ⏳ — Backup / restore foundation
Backup records, manual `pg_dump` + object-storage export + configuration export,
manifest + checksums + history, and maintenance-mode **clean-environment** restore
(the normal API process never runs `pg_restore`). Scheduled backups / Restore
Wizard remain Phase 5B.

## Part 2 ✅ — Backup / restore foundation
Separate **Maintenance runtime** (never the API). CLI: `backup | verify | restore`.
- Backup: `pg_dump` (custom format) + object-storage export + config export;
  sha256 + byte length per artifact; `manifest.json`; records `backup_runs` /
  `backup_artifacts`.
- Verify: recomputes and reconciles every checksum against the manifest.
- Restore: **isolated database + isolated object namespace only** — refuses when
  the target host+db equal the live primary (in-place prohibited); verifies
  checksums before touching anything; records `restore_runs` evidence.
- Compose `maintenance` service (profile-gated, based on postgres:18 so
  pg_dump/pg_restore versions match the server). Operator runbook in
  docs/operations/runbooks/backup-restore.md.

Tests: checksum reconcile (match + tamper); in-place restore refusal (exact and
credentials-only-differ cases).

**Phase 1B COMPLETE** (core + backup foundation). Exit-gate items covered:
audit scope constraints, idempotent/observable jobs, manual backup artefacts
verify against manifest+checksums, and command-based isolated restore with
recorded evidence. Scheduled backups + Restore Wizard remain Phase 5B.
