# Runbook — Backup and Restore (Phase 1B foundation)

The Maintenance runtime is separate from the API. The API never runs pg_restore.
Restore is ALWAYS into an isolated database + isolated object namespace.

## Create a backup
```bash
docker compose run --rm maintenance backup --out /backups --operator "$(whoami)"
```
Produces `/backups/<backupRunId>/` with:
- `database.dump`      pg_dump custom format
- `objects/` + `objects.index.json`  exported object storage
- `config.json`        feature flags + organization settings
- `manifest.json`      sha256 + byte length for every artifact
Records: `backup_runs` + `backup_artifacts`.

## Verify a backup
```bash
docker compose run --rm maintenance verify --manifest /backups/<id>/manifest.json
```
Recomputes every checksum and reconciles against the manifest. Exit 0 = intact.

## Restore into an ISOLATED environment
Never restore onto the live primary — the command refuses if the target host+db
match the primary DATABASE_URL.
```bash
docker compose run --rm maintenance restore \
  --manifest /backups/<id>/manifest.json \
  --into postgresql://pm:pm_password@postgres:5432/pm_restore_check \
  --object-prefix restore/$(date +%s)
```
Steps performed: verify checksums → `pg_restore` into the isolated DB →
re-import objects under the isolated prefix → record `restore_runs` evidence.

## Out of scope here (Phase 5B)
Scheduled backups, retention enforcement, failure notifications, the Restore
Wizard, and isolated cutover automation.
