-- Allow salons to prevent same-day public bookings while keeping the existing
-- inclusive booking horizon for future dates.
ALTER TABLE "salon"
  ADD COLUMN IF NOT EXISTS "booking_start_offset_days" INTEGER NOT NULL DEFAULT 0;

-- PostgreSQL has no `ADD CONSTRAINT IF NOT EXISTS`; the dev entrypoint may
-- apply this migration more than once, so guard the constraint explicitly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'salon_booking_start_offset_days_check'
      AND conrelid = 'salon'::regclass
  ) THEN
    ALTER TABLE "salon"
      ADD CONSTRAINT "salon_booking_start_offset_days_check"
      CHECK ("booking_start_offset_days" BETWEEN 0 AND 1);
  END IF;
END $$;

-- New salon registrations default to today + tomorrow. Existing salons keep
-- their persisted horizon values; only the database default changes.
ALTER TABLE "salon"
  ALTER COLUMN "booking_window_days" SET DEFAULT 1;
