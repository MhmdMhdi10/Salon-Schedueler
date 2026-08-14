-- Salon closures: optional time-of-day window on a holiday row.
--
-- Turns the full-day-only `holiday` into a unified "closure": both columns null
-- means the whole day is closed (the prior behavior, preserved for existing
-- rows); both set means only that [start_time, end_time) window on `on_date` is
-- blocked (e.g. a midday break or an early close). The scheduling engine reads
-- these to drop overlapping availability slots and reject overlapping bookings.
--
-- Additive and backward-compatible: existing rows keep NULL/NULL = full day.

ALTER TABLE "holiday" ADD COLUMN IF NOT EXISTS "start_time" TIME;
ALTER TABLE "holiday" ADD COLUMN IF NOT EXISTS "end_time" TIME;
