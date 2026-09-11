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
  backend/prisma/migrations/00000000000011_notification_event_type/migration.sql \
  backend/prisma/migrations/00000000000012_platform_admin/migration.sql \
  backend/prisma/migrations/00000000000013_salon_sms_settings/migration.sql \
  backend/prisma/migrations/00000000000014_business_profile_and_clients/migration.sql \
  backend/prisma/migrations/00000000000015_referral_mvp/migration.sql \
  backend/prisma/migrations/00000000000016_solo_work_modes/migration.sql \
  backend/prisma/migrations/00000000000017_card_transfer_deposit/migration.sql \
  backend/prisma/migrations/00000000000018_card_transfer_only/migration.sql \
  backend/prisma/migrations/00000000000019_reschedule_proposals/migration.sql \
  backend/prisma/migrations/00000000000020_multi_salon_staff_phone/migration.sql \
  backend/prisma/migrations/00000000000021_multi_business_types/migration.sql \
  backend/prisma/migrations/00000000000022_soft_delete_resources/migration.sql \
  backend/prisma/migrations/00000000000023_booking_options/migration.sql \
  backend/prisma/migrations/00000000000024_service_approval_staff/migration.sql \
  backend/prisma/migrations/00000000000025_qa_workflows/migration.sql \
  backend/prisma/migrations/00000000000026_platform_admin_customer_lifecycle/migration.sql \
  backend/prisma/migrations/00000000000027_staff_phone_per_salon/migration.sql \
  backend/prisma/migrations/00000000000028_booking_start_offset_days/migration.sql
do
  psql "$cli_database_url" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

if [ "${RUN_DB_SCHEMA_PUSH:-false}" = "true" ]; then
  (cd backend && npx prisma db push --skip-generate)
fi

exec "$@"
