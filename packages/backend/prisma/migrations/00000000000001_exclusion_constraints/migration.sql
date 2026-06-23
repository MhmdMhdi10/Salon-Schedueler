-- Task 2.2: Occupancy ranges and exclusion constraints
-- Requirements: 5.3, 5.4, 9.3, 9.4, 10.4

-- 1. Enable the btree_gist extension (required for EXCLUDE with non-btree operators)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Add a generated tstzrange column representing the appointment occupancy interval
ALTER TABLE appointment
  ADD COLUMN time_range tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;

-- 3. Exclusion constraints: prevent overlapping held/confirmed appointments per staff and per chair
-- These enforce R9.3 (no staff double-booking) and R9.4 (no chair double-booking)
-- Scoped to status IN ('held','confirmed') so cancelled/completed/no_show/expired don't block

ALTER TABLE appointment
  ADD CONSTRAINT no_staff_overlap
  EXCLUDE USING gist (
    staff_member_id WITH =,
    time_range WITH &&
  ) WHERE (status IN ('held', 'confirmed'));

ALTER TABLE appointment
  ADD CONSTRAINT no_chair_overlap
  EXCLUDE USING gist (
    chair_id WITH =,
    time_range WITH &&
  ) WHERE (status IN ('held', 'confirmed'));

-- 4. CHECK constraints on service table (R5.3, R5.4)
ALTER TABLE service
  ADD CONSTRAINT chk_duration_positive CHECK (duration_min > 0);

ALTER TABLE service
  ADD CONSTRAINT chk_buffer_non_negative CHECK (buffer_min >= 0);

ALTER TABLE service
  ADD CONSTRAINT chk_price_non_negative CHECK (price_rial >= 0);

ALTER TABLE service
  ADD CONSTRAINT chk_deposit_non_negative CHECK (deposit_rial >= 0 OR deposit_rial IS NULL);
