-- Development seed data (idempotent) for the Salon Booking System.
--
-- Creates ONE bookable salon with a service, a staff member, a chair, the
-- service↔staff link, and working hours for every weekday, so the web booking
-- funnel (service → date → slot → confirm) has real data to run against in dev.
--
-- The salon id is a FIXED, well-known UUID so the frontend can deep-link into
-- `/salon/<id>/book` deterministically. This file is applied on every backend
-- start and must stay idempotent — re-running it never duplicates rows.
--
-- This is DEV-ONLY sample data; it is never part of a production migration.

BEGIN;

-- Fixed UUIDs so the funnel + QR can target this salon deterministically.
-- salon   : 11111111-1111-1111-1111-111111111111
-- staff   : 22222222-2222-2222-2222-222222222222
-- chair   : 33333333-3333-3333-3333-333333333333
-- services: 44444444-... (cut), 55555555-... (color)

INSERT INTO salon (id, name, qr_token, timezone, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'سالن رز',
  'dev-salon-rose',
  'Asia/Tehran',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_member (id, salon_id, full_name, role, active)
VALUES (
  '22222222-2222-2222-2222-222222222222'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'سارا محمدی',
  'Owner',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chair (id, salon_id, name, active)
VALUES (
  '33333333-3333-3333-3333-333333333333'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'صندلی ۱',
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO service (id, salon_id, name, duration_min, buffer_min, price_rial, requires_deposit, deposit_rial)
VALUES
  (
    '44444444-4444-4444-4444-444444444444'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'کوتاهی مو', 30, 5, 2500000, false, NULL
  ),
  (
    '55555555-5555-5555-5555-555555555555'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'رنگ مو', 90, 10, 8000000, false, NULL
  )
ON CONFLICT (id) DO NOTHING;

-- Link both services to the staff member so they are bookable.
INSERT INTO service_staff (service_id, staff_member_id)
VALUES
  ('44444444-4444-4444-4444-444444444444'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
  ('55555555-5555-5555-5555-555555555555'::uuid, '22222222-2222-2222-2222-222222222222'::uuid)
ON CONFLICT (service_id, staff_member_id) DO NOTHING;

-- Working hours for every weekday (0=Sunday … 6=Saturday), 09:00–20:00, for
-- both the staff member and the chair. Availability requires both the staff and
-- the chair to be open for a slot to be offered. Rebuilt each run (delete then
-- insert) so it stays idempotent. Row ids are deterministic fixed-prefix UUIDs
-- with the weekday in the final hex digit — so we avoid depending on any UUID
-- extension (pgcrypto/uuid-ossp) being installed.
DELETE FROM working_hours
WHERE owner_id IN (
  '22222222-2222-2222-2222-222222222222'::uuid,
  '33333333-3333-3333-3333-333333333333'::uuid
);

INSERT INTO working_hours (id, owner_kind, owner_id, weekday, start_time, end_time)
SELECT
  ('aaaaaaaa-0000-0000-0000-00000000000' || d::text)::uuid,
  'staff',
  '22222222-2222-2222-2222-222222222222'::uuid,
  d, TIME '09:00', TIME '20:00'
FROM generate_series(0, 6) AS d;

INSERT INTO working_hours (id, owner_kind, owner_id, weekday, start_time, end_time)
SELECT
  ('bbbbbbbb-0000-0000-0000-00000000000' || d::text)::uuid,
  'chair',
  '33333333-3333-3333-3333-333333333333'::uuid,
  d, TIME '09:00', TIME '20:00'
FROM generate_series(0, 6) AS d;

COMMIT;
