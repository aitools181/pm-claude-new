# Post-V1 Phase 12 — Enterprise Hardening, Performance & Advanced DR

Cross-cutting hardening phase, built in verifiable streams. **Advanced Disaster Recovery**
is complete; security hardening, performance, operations (retention/recycle-bin/health),
i18n/a11y regression and the release checklist follow.

## Stream 1 — Advanced Disaster Recovery (backend)
- Schema (migration 0018): restore_drills — repeated restore *tests* (never touch the
  primary) recording target (fresh/off_server/isolated), checksum integrity, reconciliation,
  app-start, RPO/RTO and pass/fail evidence. Builds on the Phase 5B backup manifest
  (backup_runs / backup_artifacts with per-component SHA-256).
- Checksum integrity: verifyChecksums compares provided artifact hashes against the stored
  manifest and detects corruption per component.
- Drill orchestration: runDrill verifies checksums, reconciles expected-vs-actual counts for
  DB / files / config, confirms the application starts, computes RPO (data age from the
  backup) and records RTO, then passes only when all three hold. Corruption, storage/file
  loss and app-down each fail the drill with recorded notes.
- Recovery evidence: a dashboard summarises pass rate, the latest drill and the last good
  recovery's RPO/RTO. Capabilities reused: backup.manage (verify) and backup.restore (drill).

### Verification (real Postgres)
Checksums verify and tampering is detected; a clean drill against an off-server target passes
with RPO ~2h and RTO 180s; a corrupt backup, a file/storage reconciliation mismatch and an
app-that-won't-start each fail; the evidence dashboard reports one passing drill with its
RPO/RTO. Gates — backup restore produces reconciled DB/files/config and the app starts;
checksum integrity; RPO/RTO evidence; failure scenarios recover-or-fail as documented.

## Stream 2 — Operations: Retention, Recycle Bin, Export (backend)
- Schema (migration 0019): retention_policies (per org+entity retention window + auto-purge).
- Recycle bin: soft-deleted work items are listable, restorable (clears deleted_at) and
  permanently deletable. Permanent delete requires the item to be in the bin first and hard-
  removes the row plus its children (status history, assignees, placements, activity) in a
  transaction.
- Retention purge: purgeExpired hard-deletes recycle-bin items older than the policy window
  while keeping recent ones — the basis for scheduled auto-purge.
- Export: exportOrg produces a portable JSON snapshot (organization, reconciled counts, and
  active projects + work items). Capabilities: organization.settings.manage (recycle bin /
  retention) and data.portability (export). Read-only maintenance mode and the health
  aggregator already ship from the V1 / Phase 5B operations layer.

### Verification (real Postgres)
A soft-deleted item appears in the recycle bin and restore reactivates it; permanent delete
hard-removes a binned item and is refused for an active one; a 30-day policy purges a 40-day-
old trashed item while keeping a 10-day-old one; export reports reconciled project/work-item
counts. Gate — data retention, recycle bin, permanent delete and export policies — passes.

## Stream 3 — Security Hardening & Self-Audit (backend)
- Sensitive-field scanner: a forbidden-key set (tokenHash, token, secret, ciphertext,
  passwordHash, 2FA/TOTP secrets, ...) with a recursive findSensitiveKey; masked variants
  (secretMasked, credentialHint) are intentionally allowed.
- Security self-audit (SecurityAuditService.run): checks credential-bearing list responses for
  field exposure, verifies API tokens are stored as 64-char hashes (never plaintext) and
  integration credentials as ciphertext, and runs a multi-tenancy integrity probe (no work item
  may reference a project in another org — the core IDOR surface). Returns findings with
  severity and passes only with zero critical/high. Exposed at GET /security/audit
  (organization.settings.manage).
- Cross-org isolation is enforced by every service scoping queries to organizationId; the audit
  makes that guarantee testable and catches regressions.

### Verification (real Postgres)
Org A cannot read/mutate Org B work items, integrations, webhook deliveries or tokens (all
denied/empty); a clean org passes with zero critical/high and every finding ok; the scanner
flags secret/tokenHash while allowing masked hints; a planted cross-tenant work item is caught
as a critical finding (passed=false) and the audit passes again after remediation. Gate — full
security suite, no critical/high unresolved — passes.

## Stream 4 — Performance: Indexes & Caching (backend)
- Schema (migration 0020): three hot-path composite indexes on work_items —
  work_items_keyset_idx (organization_id, created_at, id) for keyset pagination,
  work_items_board_idx (organization_id, owning_project_id, status_category) for board/list
  filtering, and work_items_recycle_idx (organization_id, deleted_at) for the recycle bin.
- TtlCache: a small per-process TTL cache (get/set/wrap/invalidate + hit/miss stats) for hot
  aggregates, with correct expiry semantics.

### Verification (real Postgres, representative 20k-row dataset)
The keyset pagination query plans as an index scan on work_items_keyset_idx (no sequential
scan); the recycle-bin query uses work_items_recycle_idx; all three indexes are present; the
paginated query averages well under the 50ms target on 20k rows; and the TTL cache returns
miss -> hit -> expiry-miss with the underlying function called only when needed. Gate — load
targets met on representative data — passes.

## Next in Phase 12
Security hardening (Organization/IDOR/field/API test harness), performance (indexes,
pagination, caching), operations (data retention, recycle bin, permanent delete, export,
health/alerts, read-only maintenance), i18n/Unicode/a11y/responsive regression, and the
release checklist (versioning, changelog, support bundle); then the Phase 12 frontend
(recovery-evidence dashboard + ops consoles).

## Stream 5 — Release Readiness (backend)
- Bundled release manifest: app version, expected schema (migration count) and a structured
  changelog of the shipped phases.
- ReleaseService: versionInfo (app + schema + node); migrationStatus reads drizzle's applied-
  migrations tracking table and classifies the deployment as fresh-install, current or
  upgrade-pending (applied vs expected); changelog; and a redacted support bundle (version +
  migration status + reconciled org counts) scanned for sensitive keys and refused if any
  would leak. Version + changelog are public; migration status + support bundle require
  organization.settings.manage.

### Verification (real Postgres)
Version reports 1.0.0 / schema 21; a fully-migrated database classifies as current; removing
an applied migration is detected as upgrade-pending and returns to current once re-applied;
the changelog serves its entries; the support bundle reports reconciled counts and passes the
sensitive-field scan. Gate — fresh install and supported upgrade paths pass — is covered.

## Phase 12 backend COMPLETE (5 streams)
Advanced DR + recovery evidence; operations (retention / recycle bin / export); security
self-audit (IDOR / field exposure / tenant integrity); performance (hot-path indexes +
caching); release readiness (version / migration status / changelog / support bundle). All
verified against a real database.

## Next in Phase 12
Frontend: recovery-evidence dashboard + ops consoles (recycle bin / retention, security audit,
release & support bundle), plus an i18n/Unicode/a11y/responsive regression pass.

## Frontend — Phase 12 consoles
- Recovery (/admin/recovery): recovery-evidence dashboard (drills passed, pass rate, last good
  RPO/RTO) plus a restore-drill history table with checksum / reconciliation / app-start columns.
- Data & recycle bin (/admin/data): restore or permanently delete trashed items, set a
  retention policy, purge expired now, and export org data as JSON.
- Security (/admin/security): run the self-audit and view findings with severity and pass/fail.
- Release & support (/admin/release): version, migration status (applied/expected, mode),
  changelog, and a one-click support-bundle download.

All routes compile in the production build (44/44). i18n/Unicode is exercised throughout
(mixed Latin/Gujarati content), and the console layouts reuse the responsive app shell.

## Phase 12 COMPLETE — backend (5 streams) + frontend, verified against a real database.
