# Deploying on Coolify

The stack builds four images (api, worker, web, maintenance) from one
`docker-compose.yml`. Only `web` is exposed; it proxies `/api` and `/socket.io`
to the internal API service.

## 1. Required environment variables

`docker-compose.yml` uses `${VAR:?message}` guards. If a variable is not set,
Compose substitutes nothing and the deploy fails — but in some Coolify versions
the guard *message itself* ends up as the value, which produces confusing
downstream errors such as a 29-character database password reading
`Set POSTGRES_PASSWORD in .env`.

Set these before the first deploy:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 16` |
| `SESSION_SECRET` | `openssl rand -hex 32` (32+ characters required) |
| `MINIO_ROOT_USER` | any name, 3+ characters, e.g. `pmplatform` |
| `MINIO_ROOT_PASSWORD` | `openssl rand -hex 16` |
| `APP_URL` | the public URL of the web service, e.g. `https://pm.example.com` |
| `CORS_ORIGINS` | empty unless the API is called from another origin |

Do **not** set `POSTGRES_USER` or `POSTGRES_DB` — both are hardcoded in the
compose file (`pm` / `pm_platform`).

### Where to set them in Coolify

Application → **Configuration** → **Environment variables**. Entries tagged
*Managed* are read-only projections of the compose file; the values above are
added as new variables. Use **Developer view** for a bulk textarea, or **+ Add**
one at a time. After saving, searching for `POSTGRES_PASSWORD` should show two
rows: the managed one and yours.

## 2. Rotating secrets against an existing volume

**Postgres applies `POSTGRES_PASSWORD` only when it initialises an empty data
volume.** On an existing `pgdata18` volume the password inside the database
keeps its original value. Changing the variable alone then produces:

    PostgreSQL Database directory appears to contain a database; Skipping initialization
    FATAL: password authentication failed for user "pm"

The API cannot connect, `drizzle-kit migrate` fails, the migration guard refuses
to start the API, and the container exits within a few seconds. The
orchestrator reports only `dependency failed to start: container api-... is
unhealthy`, which hides the real cause — see the `BOOT:HINT` lines the api
container now prints.

To change the password on a live volume:

```bash
PGC=$(docker ps --format '{{.Names}}' | grep '^postgres-<resource-uuid>' | head -1)
NEWPW=$(openssl rand -hex 16)
printf "ALTER USER pm WITH PASSWORD :'pw';\n" \
  | docker exec -i "$PGC" psql -U pm -d pm_platform -v pw="$NEWPW"
docker exec "$PGC" psql "postgresql://pm:$NEWPW@127.0.0.1:5432/pm_platform" -c "SELECT 1;"
echo "Set POSTGRES_PASSWORD in Coolify to: $NEWPW"
```

Then set the same value in Coolify and redeploy. No data is lost.

Notes:
- `psql -c` does not expand `:'var'`; pipe the statement in via stdin as above.
- Generate the password with `openssl` rather than typing a placeholder — a
  literal placeholder will be accepted and set as the real password.
- MinIO behaves the same way: `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` apply
  only to a fresh `miniodata` volume. If `minio-init` fails after a rotation,
  that is the reason.
- Changing `SESSION_SECRET` invalidates every active login session. Users sign
  in again; no data is affected.

## 3. Verifying a deploy

```bash
docker logs --tail 60 $(docker ps --format '{{.Names}}' | grep '^api-<resource-uuid>')
```

A healthy boot prints:

```
BOOT:migrating
BOOT:migrate-ok
BOOT:starting-api
API listening on http://0.0.0.0:4000/api/v1
```

If `BOOT:FATAL` appears instead, the Postgres error immediately above it is the
real failure, and the `BOOT:HINT` lines name the most common cause.

## 4. Reading logs from a failed deploy

Coolify removes containers after a failed deploy, so logs can disappear before
they are read. Capture them as the deploy runs:

```bash
while true; do
  C=$(docker ps -a --format '{{.Names}}' | grep '^api-<resource-uuid>' | head -1)
  if [ -n "$C" ]; then docker logs -f "$C" 2>&1 | tee /root/api-boot.log; break; fi
  sleep 0.5
done
```

Start this before pressing Redeploy.
