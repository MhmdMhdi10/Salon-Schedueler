-- Solo, rented-chair, and mobile service support.
-- Existing salons remain usable and default to the undecided/salon booking path.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SalonWorkMode') THEN
    CREATE TYPE "SalonWorkMode" AS ENUM (
      'fixed_salon',
      'rented_chair',
      'home',
      'mobile',
      'hybrid',
      'not_decided'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChairKind') THEN
    CREATE TYPE "ChairKind" AS ENUM ('physical', 'mobile');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AppointmentLocation') THEN
    CREATE TYPE "AppointmentLocation" AS ENUM ('salon', 'customer');
  END IF;
END $$;

ALTER TABLE "salon"
  ADD COLUMN IF NOT EXISTS "work_mode" "SalonWorkMode" NOT NULL DEFAULT 'not_decided';

ALTER TABLE "staff_member"
  ADD COLUMN IF NOT EXISTS "can_approve_own_appointments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "assigned_chair_id" UUID,
  ADD COLUMN IF NOT EXISTS "mobile_chair_id" UUID;

ALTER TABLE "chair"
  ADD COLUMN IF NOT EXISTS "kind" "ChairKind" NOT NULL DEFAULT 'physical';

ALTER TABLE "appointment"
  ADD COLUMN IF NOT EXISTS "location_type" "AppointmentLocation" NOT NULL DEFAULT 'salon',
  ADD COLUMN IF NOT EXISTS "location_address" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "staff_member_assigned_chair_id_key"
  ON "staff_member"("assigned_chair_id");

-- Older development databases may already contain the first version of the
-- mobile-lane relation in assigned_chair_id. Move those rows before adding the
-- new physical/mobile-specific constraints.
UPDATE "staff_member" AS staff
SET "mobile_chair_id" = staff."assigned_chair_id",
    "assigned_chair_id" = NULL
FROM "chair" AS chair
WHERE chair."id" = staff."assigned_chair_id"
  AND chair."kind" = 'mobile';

CREATE UNIQUE INDEX IF NOT EXISTS "staff_member_mobile_chair_id_key"
  ON "staff_member"("mobile_chair_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_member_assigned_chair_id_fkey'
  ) THEN
    ALTER TABLE "staff_member"
      ADD CONSTRAINT "staff_member_assigned_chair_id_fkey"
      FOREIGN KEY ("assigned_chair_id") REFERENCES "chair"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'staff_member_mobile_chair_id_fkey'
  ) THEN
    ALTER TABLE "staff_member"
      ADD CONSTRAINT "staff_member_mobile_chair_id_fkey"
      FOREIGN KEY ("mobile_chair_id") REFERENCES "chair"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
