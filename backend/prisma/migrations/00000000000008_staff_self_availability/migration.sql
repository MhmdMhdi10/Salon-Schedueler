-- Stylist self-service availability.
--
-- 1) Per-stylist time-of-day window on a `day_off` row — mirrors the `holiday`
--    closure model. Both columns NULL => the stylist is off the WHOLE day (the
--    prior behaviour, preserved for existing rows); both set => only the
--    [start_time, end_time) window on `on_date` is blocked for that stylist
--    (e.g. a midday break, or "no bookings after 17:00"). The scheduling engine
--    drops overlapping availability slots and rejects overlapping bookings for
--    that staff member only — the rest of the salon is unaffected.
--
-- 2) Per-stylist permission flag: when true, the salon has granted this stylist
--    the right to manage their OWN availability (block their own day/hours).
--    Default false => only Owner/Admin can block their time. Additive and
--    backward-compatible.

ALTER TABLE "day_off" ADD COLUMN IF NOT EXISTS "start_time" TIME;
ALTER TABLE "day_off" ADD COLUMN IF NOT EXISTS "end_time" TIME;

ALTER TABLE "staff_member"
  ADD COLUMN IF NOT EXISTS "manage_own_availability" BOOLEAN NOT NULL DEFAULT false;
