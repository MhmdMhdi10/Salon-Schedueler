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

-- Booking approval workflow: ensure the 'pending' appointment status exists on an
-- already-provisioned dev DB (db push only runs on a fresh volume, so a running
-- DB won't pick up the new enum value from schema.prisma otherwise). This is a
-- top-level statement (not inside the DO block below) so psql autocommits it
-- before the exclusion constraints reference 'pending' — PostgreSQL forbids using
-- a new enum value in the same transaction that adds it. Idempotent.
ALTER TYPE "ApptStatus" ADD VALUE IF NOT EXISTS 'pending';

-- Booking approval policy (additive, idempotent). Default is manual approval:
-- salon.auto_approve defaults to false; staff_member.auto_approve is nullable
-- (null = inherit the salon default). Existing rows are unaffected.
ALTER TABLE salon ADD COLUMN IF NOT EXISTS auto_approve boolean NOT NULL DEFAULT false;
ALTER TABLE staff_member ADD COLUMN IF NOT EXISTS auto_approve boolean;

-- Per-salon Brand_Accent key for storefront theming (signature-ui-system R4.1).
-- Additive + nullable: null = signature default palette. Existing rows unaffected.
ALTER TABLE salon ADD COLUMN IF NOT EXISTS brand_accent text;

-- Optional staff login phone (StaffMember.phone String? @unique in schema.prisma).
-- Additive + nullable + unique. db push only runs on a fresh volume, so an
-- existing dev DB needs this to pick up the column BEFORE dev-seed.sql (which
-- inserts staff phones) runs. Idempotent.
ALTER TABLE staff_member ADD COLUMN IF NOT EXISTS phone text;

-- Match Prisma's @unique index (default name staff_member_phone_key). Guarded so
-- it can never introduce a NEW abort if duplicate non-null phones somehow exist
-- on an old dev DB: catch unique_violation/duplicate_table and NOTICE instead of
-- erroring. The column ALTER above is the essential fix; this preserves fidelity.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'staff_member_phone_key') THEN
    BEGIN
      CREATE UNIQUE INDEX staff_member_phone_key ON staff_member (phone);
    EXCEPTION
      WHEN unique_violation THEN
        RAISE NOTICE 'staff_member_phone_key not created: duplicate phones present (dev DB).';
      WHEN duplicate_table THEN
        RAISE NOTICE 'staff_member_phone_key already exists; skipping.';
    END;
  END IF;
END $$;

-- Generated occupancy interval [start_at, end_at). ADD COLUMN IF NOT EXISTS is
-- supported by PostgreSQL, so this is idempotent on its own.
ALTER TABLE appointment
  ADD COLUMN IF NOT EXISTS time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;

-- Overlap constraints: a held/confirmed appointment reserves staff + chair, and
-- so does a 'pending' (awaiting-admin-approval) booking — otherwise two customers
-- could hold the same slot and an admin could approve both. The status set has
-- changed over time, so DROP + recreate unconditionally (idempotent) rather than
-- guarding with IF NOT EXISTS, which would keep a stale definition on an existing
-- dev DB. ADD COLUMN IF NOT EXISTS above keeps time_range idempotent on its own.
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS no_staff_overlap;
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS no_chair_overlap;

-- No two pending/held/confirmed appointments may overlap for the same staff member.
ALTER TABLE appointment
  ADD CONSTRAINT no_staff_overlap
  EXCLUDE USING gist (staff_member_id WITH =, time_range WITH &&)
  WHERE (status IN ('pending', 'held', 'confirmed'));

-- No two pending/held/confirmed appointments may overlap for the same chair.
ALTER TABLE appointment
  ADD CONSTRAINT no_chair_overlap
  EXCLUDE USING gist (chair_id WITH =, time_range WITH &&)
  WHERE (status IN ('pending', 'held', 'confirmed'));

-- PostgreSQL has no "ADD CONSTRAINT IF NOT EXISTS", so each CHECK constraint is
-- guarded by a pg_constraint existence check inside a DO block.
DO $$
BEGIN
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
