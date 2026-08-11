#!/usr/bin/env bash
# Backend development entrypoint.
#
# Waits for Postgres, ensures the Prisma client + schema exist, applies the
# exclusion/CHECK constraints (which live outside the Prisma schema), then runs
# the API with watch-driven rebuild + restart.
set -euo pipefail
cd /app

# Seed deps only if the node_modules volume is empty (first run on a fresh volume).
if [ ! -x node_modules/.bin/tsc ]; then
  echo "[backend] installing dependencies..."
  npm install
fi

# 1. Wait for Postgres to accept connections (uses PG* env vars).
echo "[backend] waiting for Postgres at ${PGHOST:-postgres}:${PGPORT:-5432}..."
until pg_isready -q; do
  sleep 1
done
echo "[backend] Postgres is ready."

# 2. Generate the Prisma client (no DB connection required).
#    The prisma CLI and @prisma/client are backend-workspace dependencies and are
#    NOT hoisted to the root node_modules, so run prisma FROM packages/backend
#    (npx searches that dir's node_modules/.bin and up). Running it from /app would
#    fail with "prisma: not found". The default prisma/schema.prisma resolves there.
echo "[backend] generating Prisma client..."
( cd packages/backend && npx prisma generate )

# 3. Create the schema on first run only (when the 'salon' table is absent).
#    There is no table-creating Prisma migration, so we use `db push`. psql uses
#    the PG* env vars; to_regclass returns an empty string when the table is missing.
SALON_TABLE="$(psql -tAc "SELECT to_regclass('public.salon')" || true)"
if [ -z "${SALON_TABLE//[[:space:]]/}" ]; then
  echo "[backend] no schema detected — pushing Prisma schema (creates tables)..."
  ( cd packages/backend && npx prisma db push --skip-generate )
else
  echo "[backend] schema already present — skipping db push."
fi

# 4. Apply additive schema migrations that must also reach existing dev DBs.
#    Development bootstraps databases with db push, so these idempotent
#    statements keep an already-created database in sync too.
echo "[backend] applying additive schema migrations (idempotent)..."
psql -v ON_ERROR_STOP=1 -f packages/backend/prisma/migrations/00000000000011_notification_event_type/migration.sql
psql -v ON_ERROR_STOP=1 -f packages/backend/prisma/migrations/00000000000012_platform_admin/migration.sql
psql -v ON_ERROR_STOP=1 -f packages/backend/prisma/migrations/00000000000013_salon_sms_settings/migration.sql
psql -v ON_ERROR_STOP=1 -f packages/backend/prisma/migrations/00000000000014_business_profile_and_clients/migration.sql
psql -v ON_ERROR_STOP=1 -f packages/backend/prisma/migrations/00000000000015_referral_mvp/migration.sql

# 5. Apply the occupancy range + exclusion/CHECK constraints (idempotent).
echo "[backend] applying exclusion constraints (idempotent)..."
psql -v ON_ERROR_STOP=1 -f docker/db/dev-constraints.sql

# 5b. Seed dev-only sample data (idempotent): one bookable salon + service +
#     staff + chair + working hours, with fixed UUIDs the web funnel targets.
echo "[backend] applying dev seed data (idempotent)..."
psql -v ON_ERROR_STOP=1 -f docker/db/dev-seed.sql

# 6. Initial build of shared + backend, then start with watch reload.
#    Use --force so the initial build ignores the incremental .tsbuildinfo cache
#    and re-emits every output. A container killed mid-emit can leave 0-byte .js
#    files that the cache still records as "built", so a plain `tsc -b` would
#    skip them — leaving empty modules that crash at runtime (e.g. an imported
#    class resolves to undefined → "X is not a constructor"). Forcing a clean
#    emit on start makes the dev container self-heal from an interrupted build.
echo "[backend] building @salon/shared + @salon/backend..."
npx tsc -b packages/shared packages/backend --force

echo "[backend] starting API (watch reload) on http://localhost:${PORT:-3000}"
npx tsc -b packages/shared packages/backend --watch --preserveWatchOutput &
exec node --watch packages/backend/dist/main.js
