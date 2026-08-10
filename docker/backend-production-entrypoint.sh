#!/usr/bin/env bash
set -euo pipefail

cd /app
: "${DATABASE_URL:?DATABASE_URL is required}"

# Prisma's schema query parameter is valid for Prisma but rejected by the
# PostgreSQL CLI tools used for readiness/migrations.
cli_database_url="${DATABASE_URL%%\?*}"

until pg_isready -d "$cli_database_url" -t 2 >/dev/null 2>&1; do
  sleep 1
done

# Production image applies only reviewed, idempotent migrations. It never runs
# development seed data or development-only constraint bootstrap.
for migration in \
  packages/backend/prisma/migrations/00000000000011_notification_event_type/migration.sql \
  packages/backend/prisma/migrations/00000000000012_platform_admin/migration.sql \
  packages/backend/prisma/migrations/00000000000013_salon_sms_settings/migration.sql
do
  psql "$cli_database_url" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

if [ "${RUN_DB_SCHEMA_PUSH:-false}" = "true" ]; then
  (cd packages/backend && npx prisma db push --skip-generate)
fi

exec "$@"
