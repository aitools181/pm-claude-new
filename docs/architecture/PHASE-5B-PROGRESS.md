# Phase 5B — Backup & Restore Completion

Builds on the Phase 1B foundation (Maintenance runtime, isolated-restore refusal,
manifests/checksums). Normal API never runs pg_restore — execution is CLI-only.

## Backend / orchestration (this increment) ✅
- **Mandatory maintenance mode + mutation blocking**: a singleton flag; a global
  guard returns 503 for every mutation while active, allowing reads and the
  maintenance/auth/health endpoints so an operator can always exit or drive a restore.
- **Scheduled backups**: interval schedules with `nextRunAt`; a `tick` runs due
  schedules, records the run, and advances the schedule.
- **Missed-run detection**: elapsed intervals since the due time are counted and
  raise a `missed_run` alert.
- **Retention**: backups (and their children) beyond the retention window are pruned.
- **Verification + failure notifications**: per-run verification records, plus
  `backup_failed` / `missed_run` / `verification_failed` alerts.
- **Restore Wizard orchestration** (CLI-executed state machine):
  enter maintenance → pause/drain workers → **pre-restore backup** →
  **validate** checksums/manifest, **schema version**, **application version** →
  **restore to a NEW isolated database + object namespace** (in-place refused) →
  **reconcile** db/object/manifest → **reversible cutover** → **post-restore
  validation** (auto-revert on failure) → **immutable audit evidence** → exit
  maintenance. All validations happen BEFORE cutover.
- **API vs CLI boundary**: the API only records a restore *request*; the actual
  restore runs out-of-process. `ApiRefusingExecutors` hard-refuses pg_restore in
  the API process.

## Acceptance tests ✅ (Testcontainers)
Maintenance mode blocks mutations, allows reads + maintenance endpoints, and
clears · schedule tick runs due backups, detects missed runs, advances next run ·
retention prunes old backups · verification recorded · full restore completes with
evidence + audit and exits maintenance · in-place restore refused · version
mismatch aborts before cutover · reconciliation mismatch aborts before cutover ·
post-validation failure reverts the cutover.

## Next ⏳
- **Backup Config UI + Restore Wizard UI** (schedules, alerts, restore request +
  live evidence/log view). Then the eighteen-capability exit gate is demonstrable
  end to end.

## Backup Config UI + Restore Wizard UI ✅ (completes Phase 5B)
- **Maintenance banner** with Enter/Exit (reason captured); clearly signals when
  mutations are blocked.
- **Schedules**: create (interval, retention, timezone, first run), list with
  missed-run counts and last status, and "Run due now".
- **Alerts** surfaced inline (missed_run / backup_failed / verification_failed).
- **Recent backups** with status + a **Verify** action.
- **Restore Wizard**: request a restore against a chosen backup with an explicit
  **new isolated target database + object namespace**; the run list shows each
  restore's status and cutover state, expandable into the full **evidence trail**
  (pre-restore backup, checksums, schema/app version, isolated restore, reconcile,
  cutover, post-validate) — the same immutable evidence recorded server-side.

**Phase 5B COMPLETE** — all eighteen capabilities implemented, tested at the
orchestration layer, and operable from the UI. Restore execution remains CLI-only;
the UI records requests and renders evidence/logs.
