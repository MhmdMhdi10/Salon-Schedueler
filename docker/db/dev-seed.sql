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
-- salon   : 11111111-1111-1111-1111-111111111111  (qr_token "salon-rose" =
--           the public profile slug in web data/salons.ts, so the QR campaign
--           URL /s/salon-rose resolves to a real profile)
-- staff   : 22222222-2222-2222-2222-222222222222
-- chair   : 33333333-3333-3333-3333-333333333333
-- services: 44444444-... (cut), 55555555-... (color)

INSERT INTO salon (id, name, qr_token, timezone, created_at)
VALUES (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'سالن رز',
  'salon-rose',
  'Asia/Tehran',
  NOW()
)
ON CONFLICT (id) DO UPDATE SET qr_token = EXCLUDED.qr_token;

INSERT INTO staff_member (id, salon_id, full_name, role, active, phone)
VALUES (
  '22222222-2222-2222-2222-222222222222'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'سارا محمدی',
  'Owner',
  true,
  '09120000001'
)
ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;

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

-- ─── Dev Test Users ────────────────────────────────────────────────────────────
-- Customer records linked to staff and a standalone customer for testing all
-- roles through OTP-based auth. Phone numbers are deterministic for dev docs.
--
-- These INSERTs conflict on the unique `phone`, not just `id`: OTP login may have
-- already created a customer row with one of these phones under a random id, so
-- ON CONFLICT (phone) DO NOTHING keeps the seed idempotent against that drift
-- (ON CONFLICT (id) would miss the independent phone-uniqueness collision).

-- Owner customer record (links phone 09120000001 to the Owner staff member)
INSERT INTO customer (id, phone, full_name)
VALUES (
  'cccccccc-1111-1111-1111-111111111111'::uuid,
  '09120000001',
  'سارا محمدی'
)
ON CONFLICT (phone) DO NOTHING;

-- Admin staff member + customer record
INSERT INTO staff_member (id, salon_id, full_name, role, active, phone)
VALUES (
  'dddddddd-2222-2222-2222-222222222222'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'مریم احمدی',
  'Admin',
  true,
  '09120000002'
)
ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;

INSERT INTO customer (id, phone, full_name)
VALUES (
  'cccccccc-2222-2222-2222-222222222222'::uuid,
  '09120000002',
  'مریم احمدی'
)
ON CONFLICT (phone) DO NOTHING;

-- Stylist staff member + customer record
INSERT INTO staff_member (id, salon_id, full_name, role, active, phone)
VALUES (
  'dddddddd-3333-3333-3333-333333333333'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'زهرا رضایی',
  'Stylist',
  true,
  '09120000003'
)
ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;

INSERT INTO customer (id, phone, full_name)
VALUES (
  'cccccccc-3333-3333-3333-333333333333'::uuid,
  '09120000003',
  'زهرا رضایی'
)
ON CONFLICT (phone) DO NOTHING;

-- Link services to the new stylist so she has bookable appointments
INSERT INTO service_staff (service_id, staff_member_id)
VALUES
  ('44444444-4444-4444-4444-444444444444'::uuid, 'dddddddd-3333-3333-3333-333333333333'::uuid),
  ('55555555-5555-5555-5555-555555555555'::uuid, 'dddddddd-3333-3333-3333-333333333333'::uuid)
ON CONFLICT (service_id, staff_member_id) DO NOTHING;

-- Working hours for the new stylist (same schedule as the owner for simplicity)
DELETE FROM working_hours
WHERE owner_id = 'dddddddd-3333-3333-3333-333333333333'::uuid;

INSERT INTO working_hours (id, owner_kind, owner_id, weekday, start_time, end_time)
SELECT
  ('eeeeeeee-0000-0000-0000-00000000000' || d::text)::uuid,
  'staff',
  'dddddddd-3333-3333-3333-333333333333'::uuid,
  d, TIME '09:00', TIME '20:00'
FROM generate_series(0, 6) AS d;

-- Regular customer (no staff role)
INSERT INTO customer (id, phone, full_name)
VALUES (
  'cccccccc-4444-4444-4444-444444444444'::uuid,
  '09120000004',
  'نازنین کریمی'
)
ON CONFLICT (phone) DO NOTHING;

-- ─── Subscription ────────────────────────────────────────────────────────────
-- An ACTIVE annual subscription for the dev salon so the owner panel's «اشتراک»
-- surface shows real data (status + expiry + plan). expires_at is set ~1 year
-- out and grace_until a week after, so it reads as `active`. Idempotent on the
-- salon_id unique key.
INSERT INTO subscription (id, salon_id, status, plan_kind, started_at, expires_at, grace_until, created_at)
VALUES (
  'eeeeeeee-1111-1111-1111-111111111111'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'active',
  'annual',
  NOW(),
  NOW() + INTERVAL '365 days',
  NOW() + INTERVAL '372 days',
  NOW()
)
ON CONFLICT (salon_id) DO UPDATE SET
  status = EXCLUDED.status,
  plan_kind = EXCLUDED.plan_kind,
  expires_at = EXCLUDED.expires_at,
  grace_until = EXCLUDED.grace_until;

COMMIT;
