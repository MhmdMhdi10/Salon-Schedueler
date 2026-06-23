-- Dev-only, IDEMPOTENT application of the occupancy-range column and the
-- exclusion / CHECK constraints.
--
-- It mirrors:
--   packages/backend/prisma/migrations/00000000000001_exclusion_constraints/migration.sql
-- but is safe to run repeatedly. These objects are not represented in the
-- Prisma schema, so the Docker dev entrypoint applies them with psql AFTER
-- `prisma db push` has created the base tables.

-- Required for EXCLUDE constraints that combine equality with range overlap.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Generated occupancy interval [start_at, end_at). ADD COLUMN IF NOT EXISTS is
-- supported by PostgreSQL, so this is idempotent on its own.
ALTER TABLE appointment
  ADD COLUMN IF NOT EXISTS time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;

-- PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS", so each constraint is
-- guarded by a pg_constraint existence check inside a DO block.
DO $$
BEGIN
  -- No two held/confirmed appointments may overlap for the same staff member.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'no_staff_overlap') THEN
    ALTER TABLE appointment
      ADD CONSTRAINT no_staff_overlap
      EXCLUDE USING gist (staff_member_id WITH =, time_range WITH &&)
      WHERE (status IN ('held', 'confirmed'));
  END IF;

  -- No two held/confirmed appointments may overlap for the same chair.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'no_chair_overlap') THEN
    ALTER TABLE appointment
      ADD CONSTRAINT no_chair_overlap
      EXCLUDE USING gist (chair_id WITH =, time_range WITH &&)
      WHERE (status IN ('held', 'confirmed'));
  END IF;

  -- Service field sanity checks (mirror the Zod validation).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_duration_positive') THEN
    ALTER TABLE service ADD CONSTRAINT chk_duration_positive CHECK (duration_min > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_buffer_non_negative') THEN
    ALTER TABLE service ADD CONSTRAINT chk_buffer_non_negative CHECK (buffer_min >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_price_non_negative') THEN
    ALTER TABLE service ADD CONSTRAINT chk_price_non_negative CHECK (price_rial >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_deposit_non_negative') THEN
    ALTER TABLE service ADD CONSTRAINT chk_deposit_non_negative
      CHECK (deposit_rial >= 0 OR deposit_rial IS NULL);
  END IF;
END $$;
