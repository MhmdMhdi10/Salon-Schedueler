-- Booking approval workflow — step 2: a 'pending' booking must reserve its slot.
-- Requirements: 9.3, 9.4 (no double-booking) extended to the pre-approval state.
--
-- The no-overlap exclusion constraints originally covered only ('held','confirmed')
-- (migration 00000000000001). A 'pending' booking is awaiting admin approval but
-- must still hold the staff member and chair for its interval, otherwise two
-- customers could each book the same slot and an admin could approve both,
-- producing a double-booking. We widen both constraints to include 'pending'.
--
-- Constraints cannot be altered in place, so drop and recreate them. This runs in
-- its own migration (after 00000000000003 committed 'pending') because PostgreSQL
-- forbids using a new enum value in the same transaction that introduced it.

ALTER TABLE appointment DROP CONSTRAINT IF EXISTS no_staff_overlap;
ALTER TABLE appointment DROP CONSTRAINT IF EXISTS no_chair_overlap;

ALTER TABLE appointment
  ADD CONSTRAINT no_staff_overlap
  EXCLUDE USING gist (
    staff_member_id WITH =,
    time_range WITH &&
  ) WHERE (status IN ('pending', 'held', 'confirmed'));

ALTER TABLE appointment
  ADD CONSTRAINT no_chair_overlap
  EXCLUDE USING gist (
    chair_id WITH =,
    time_range WITH &&
  ) WHERE (status IN ('pending', 'held', 'confirmed'));
