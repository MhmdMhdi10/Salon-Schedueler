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

-- ─── Rich dashboard fixtures ─────────────────────────────────────────────────
-- A second chair, two extra services, four customers, and appointments around
-- "today" make calendar/analytics/inbox screens useful immediately. Every row
-- has a deterministic UUID and is updated in place, so restarting the backend
-- refreshes relative dates without duplicating fixtures.

INSERT INTO chair (id, salon_id, name, active)
VALUES (
  '33333333-3333-3333-3333-333333333334'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'صندلی ۲',
  true
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active;

INSERT INTO service (
  id, salon_id, name, duration_min, buffer_min, price_rial,
  requires_deposit, deposit_rial
)
VALUES
  (
    '66666666-6666-6666-6666-666666666666'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'براشینگ و استایل', 45, 5, 3500000, false, NULL
  ),
  (
    '77777777-7777-7777-7777-777777777777'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'کراتین و احیا', 120, 15, 15000000, true, 3000000
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  duration_min = EXCLUDED.duration_min,
  buffer_min = EXCLUDED.buffer_min,
  price_rial = EXCLUDED.price_rial,
  requires_deposit = EXCLUDED.requires_deposit,
  deposit_rial = EXCLUDED.deposit_rial;

INSERT INTO service_staff (service_id, staff_member_id)
VALUES
  ('66666666-6666-6666-6666-666666666666'::uuid, '22222222-2222-2222-2222-222222222222'::uuid),
  ('66666666-6666-6666-6666-666666666666'::uuid, 'dddddddd-3333-3333-3333-333333333333'::uuid),
  ('77777777-7777-7777-7777-777777777777'::uuid, '22222222-2222-2222-2222-222222222222'::uuid)
ON CONFLICT (service_id, staff_member_id) DO NOTHING;

DELETE FROM working_hours
WHERE owner_id = '33333333-3333-3333-3333-333333333334'::uuid;

INSERT INTO working_hours (id, owner_kind, owner_id, weekday, start_time, end_time)
SELECT
  ('bbbbbbbb-1000-0000-0000-00000000000' || d::text)::uuid,
  'chair',
  '33333333-3333-3333-3333-333333333334'::uuid,
  d, TIME '09:00', TIME '20:00'
FROM generate_series(0, 6) AS d;

INSERT INTO customer (id, phone, full_name, preferred_staff_id, no_show_count)
VALUES
  (
    'cccccccc-5555-5555-5555-555555555555'::uuid,
    '09121000005', 'نیلوفر حسینی',
    'dddddddd-3333-3333-3333-333333333333'::uuid, 0
  ),
  (
    'cccccccc-6666-6666-6666-666666666666'::uuid,
    '09121000006', 'الهام اکبری',
    '22222222-2222-2222-2222-222222222222'::uuid, 1
  ),
  (
    'cccccccc-7777-7777-7777-777777777777'::uuid,
    '09121000007', 'رها مرادی',
    'dddddddd-3333-3333-3333-333333333333'::uuid, 0
  ),
  (
    'cccccccc-8888-8888-8888-888888888888'::uuid,
    '09121000008', 'ترانه موسوی',
    '22222222-2222-2222-2222-222222222222'::uuid, 0
  )
ON CONFLICT (phone) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  preferred_staff_id = EXCLUDED.preferred_staff_id,
  no_show_count = EXCLUDED.no_show_count;

INSERT INTO holiday (id, salon_id, on_date, start_time, end_time)
VALUES
  (
    '88000000-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    (NOW() AT TIME ZONE 'Asia/Tehran')::date + 5,
    NULL, NULL
  ),
  (
    '88000000-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    (NOW() AT TIME ZONE 'Asia/Tehran')::date + 8,
    TIME '13:00', TIME '15:30'
  )
ON CONFLICT (id) DO UPDATE SET
  on_date = EXCLUDED.on_date,
  start_time = EXCLUDED.start_time,
  end_time = EXCLUDED.end_time;

-- Remove only our deterministic fixtures before rebuilding them. This avoids
-- conflicts with generated occupancy ranges when the relative day changes.
DELETE FROM appointment
WHERE id IN (
  '90000000-0000-0000-0000-000000000001'::uuid,
  '90000000-0000-0000-0000-000000000002'::uuid,
  '90000000-0000-0000-0000-000000000003'::uuid,
  '90000000-0000-0000-0000-000000000004'::uuid,
  '90000000-0000-0000-0000-000000000005'::uuid,
  '90000000-0000-0000-0000-000000000006'::uuid,
  '90000000-0000-0000-0000-000000000007'::uuid,
  '90000000-0000-0000-0000-000000000008'::uuid
);

WITH tehran_day AS (
  SELECT date_trunc('day', NOW() AT TIME ZONE 'Asia/Tehran') AS local_day
)
INSERT INTO appointment (
  id, salon_id, customer_id, staff_member_id, chair_id, service_id,
  start_at, end_at, status, source, created_at
)
SELECT
  row.id, '11111111-1111-1111-1111-111111111111'::uuid,
  row.customer_id, row.staff_id, row.chair_id, row.service_id,
  (tehran_day.local_day + row.start_offset) AT TIME ZONE 'Asia/Tehran',
  (tehran_day.local_day + row.end_offset) AT TIME ZONE 'Asia/Tehran',
  row.status::"ApptStatus", row.source::"ApptSource",
  NOW() - row.created_ago
FROM tehran_day
CROSS JOIN (
  VALUES
    (
      '90000000-0000-0000-0000-000000000001'::uuid,
      'cccccccc-5555-5555-5555-555555555555'::uuid,
      'dddddddd-3333-3333-3333-333333333333'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid,
      INTERVAL '-1 day 10 hours', INTERVAL '-1 day 10 hours 35 minutes',
      'completed', 'web', INTERVAL '2 days'
    ),
    (
      '90000000-0000-0000-0000-000000000002'::uuid,
      'cccccccc-6666-6666-6666-666666666666'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '33333333-3333-3333-3333-333333333334'::uuid,
      '55555555-5555-5555-5555-555555555555'::uuid,
      INTERVAL '-1 day 14 hours', INTERVAL '-1 day 15 hours 40 minutes',
      'completed', 'mobile', INTERVAL '3 days'
    ),
    (
      '90000000-0000-0000-0000-000000000003'::uuid,
      'cccccccc-7777-7777-7777-777777777777'::uuid,
      'dddddddd-3333-3333-3333-333333333333'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '66666666-6666-6666-6666-666666666666'::uuid,
      INTERVAL '10 hours', INTERVAL '10 hours 50 minutes',
      'confirmed', 'web', INTERVAL '18 hours'
    ),
    (
      '90000000-0000-0000-0000-000000000004'::uuid,
      'cccccccc-8888-8888-8888-888888888888'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '33333333-3333-3333-3333-333333333334'::uuid,
      '77777777-7777-7777-7777-777777777777'::uuid,
      INTERVAL '11 hours', INTERVAL '13 hours 15 minutes',
      'pending', 'bot', INTERVAL '45 minutes'
    ),
    (
      '90000000-0000-0000-0000-000000000005'::uuid,
      'cccccccc-5555-5555-5555-555555555555'::uuid,
      'dddddddd-3333-3333-3333-333333333333'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '55555555-5555-5555-5555-555555555555'::uuid,
      INTERVAL '15 hours', INTERVAL '16 hours 40 minutes',
      'confirmed', 'walkin', INTERVAL '3 hours'
    ),
    (
      '90000000-0000-0000-0000-000000000006'::uuid,
      'cccccccc-6666-6666-6666-666666666666'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '33333333-3333-3333-3333-333333333334'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid,
      INTERVAL '1 day 9 hours 30 minutes', INTERVAL '1 day 10 hours 5 minutes',
      'confirmed', 'mobile', INTERVAL '5 hours'
    ),
    (
      '90000000-0000-0000-0000-000000000007'::uuid,
      'cccccccc-7777-7777-7777-777777777777'::uuid,
      'dddddddd-3333-3333-3333-333333333333'::uuid,
      '33333333-3333-3333-3333-333333333333'::uuid,
      '66666666-6666-6666-6666-666666666666'::uuid,
      INTERVAL '1 day 12 hours', INTERVAL '1 day 12 hours 50 minutes',
      'pending', 'web', INTERVAL '20 minutes'
    ),
    (
      '90000000-0000-0000-0000-000000000008'::uuid,
      'cccccccc-8888-8888-8888-888888888888'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      '33333333-3333-3333-3333-333333333334'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid,
      INTERVAL '2 days 16 hours', INTERVAL '2 days 16 hours 35 minutes',
      'cancelled', 'web', INTERVAL '1 day'
    )
) AS row(
  id, customer_id, staff_id, chair_id, service_id,
  start_offset, end_offset, status, source, created_ago
);

INSERT INTO salon_notification (
  id, salon_id, audience, staff_member_id, type, title, body,
  payload, read_at, created_at
)
VALUES
  (
    '91000000-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'owner', NULL, 'booking.pending', 'رزرو جدید در انتظار تأیید',
    'ترانه موسوی برای خدمت کراتین و احیا درخواست رزرو ثبت کرده است.',
    '{"appointmentId":"90000000-0000-0000-0000-000000000004","customerName":"ترانه موسوی"}'::jsonb,
    NULL, NOW() - INTERVAL '12 minutes'
  ),
  (
    '91000000-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'admin', NULL, 'booking.pending', 'یک رزرو نیاز به بررسی دارد',
    'رزرو فردا ساعت ۱۲ برای زهرا رضایی هنوز تأیید نشده است.',
    '{"appointmentId":"90000000-0000-0000-0000-000000000007"}'::jsonb,
    NULL, NOW() - INTERVAL '20 minutes'
  ),
  (
    '91000000-0000-0000-0000-000000000003'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'stylist', 'dddddddd-3333-3333-3333-333333333333'::uuid,
    'booking.approved', 'رزرو شما تأیید شد',
    'امروز ساعت ۱۰، نیلوفر حسینی برای براشینگ و استایل مراجعه می‌کند.',
    '{"appointmentId":"90000000-0000-0000-0000-000000000003"}'::jsonb,
    NULL, NOW() - INTERVAL '35 minutes'
  ),
  (
    '91000000-0000-0000-0000-000000000004'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'all-staff', NULL, 'subscription.expiring', 'اشتراک سالانه فعال است',
    'اشتراک آرا بیز سالن رز تا یک سال آینده فعال است.',
    '{"plan":"annual"}'::jsonb,
    NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 days'
  ),
  (
    '91000000-0000-0000-0000-000000000005'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'owner', NULL, 'new.customer', 'مشتری جدید',
    'رها مرادی برای اولین بار از آرا وقت رزرو کرده است.',
    '{"customerName":"رها مرادی"}'::jsonb,
    NULL, NOW() - INTERVAL '3 hours'
  )
ON CONFLICT (id) DO UPDATE SET
  audience = EXCLUDED.audience,
  staff_member_id = EXCLUDED.staff_member_id,
  type = EXCLUDED.type,
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  payload = EXCLUDED.payload,
  read_at = EXCLUDED.read_at,
  created_at = EXCLUDED.created_at;

-- ─── Marketplace demo salons (booking-data UUID contract) ────────────────────
-- Every demo profile in packages/web/src/data/salons.ts points its
-- `bookingSalonId` at one of these FIXED UUIDs (implementation contract):
--   salon-maryam      → aa000001-0000-4000-8000-000000000001
--   shahin-barbershop → aa000002-0000-4000-8000-000000000002
--   salon-niloofar    → aa000003-0000-4000-8000-000000000003
--   arash-studio      → aa000004-0000-4000-8000-000000000004
--   salon-parisa      → aa000005-0000-4000-8000-000000000005
-- Each salon gets: a salon row (qr_token = its public profile slug), 1–2 staff,
-- 1 chair, services MIRRORING that profile's service list (names/durations/
-- prices), service_staff links, and working hours for every weekday — so every
-- «رزرو نوبت» CTA on the marketplace lands in a bookable funnel. Idempotent.
--
-- Deterministic child UUIDs (n = salon number 1–5):
--   staff    ab0n0000-0000-4000-8000-00000000000o   (o = staff ordinal)
--   chair    ac0n0000-0000-4000-8000-000000000001
--   service  ad0n0000-0000-4000-8000-00000000000k   (k = service ordinal)
--   hours    ae0n0o00-0000-4000-8000-00000000000d   (d = weekday 0–6)

INSERT INTO salon (id, name, qr_token, timezone, auto_approve, created_at)
VALUES
  ('aa000001-0000-4000-8000-000000000001'::uuid, 'سالن مریم',       'salon-maryam',      'Asia/Tehran', false, NOW()),
  ('aa000002-0000-4000-8000-000000000002'::uuid, 'آرایشگاه شاهین',  'shahin-barbershop', 'Asia/Tehran', true,  NOW()),
  ('aa000003-0000-4000-8000-000000000003'::uuid, 'سالن نیلوفر',     'salon-niloofar',    'Asia/Tehran', false, NOW()),
  ('aa000004-0000-4000-8000-000000000004'::uuid, 'استودیو آرش',     'arash-studio',      'Asia/Tehran', true,  NOW()),
  ('aa000005-0000-4000-8000-000000000005'::uuid, 'سالن پریسا',      'salon-parisa',      'Asia/Tehran', false, NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  qr_token = EXCLUDED.qr_token,
  auto_approve = EXCLUDED.auto_approve;

WITH demo_staff (id, salon_id, full_name, role, active, phone) AS (
  VALUES
    ('ab010000-0000-4000-8000-000000000001'::uuid, 'aa000001-0000-4000-8000-000000000001'::uuid, 'مریم رضوی',   'Owner',   true, '09120000101'),
    ('ab010000-0000-4000-8000-000000000002'::uuid, 'aa000001-0000-4000-8000-000000000001'::uuid, 'آیدا شریفی',  'Stylist', true, '09120000102'),
    ('ab020000-0000-4000-8000-000000000001'::uuid, 'aa000002-0000-4000-8000-000000000002'::uuid, 'شاهین قاسمی', 'Owner',   true, '09120000201'),
    ('ab030000-0000-4000-8000-000000000001'::uuid, 'aa000003-0000-4000-8000-000000000003'::uuid, 'نیلوفر صادقی','Owner',   true, '09120000301'),
    ('ab030000-0000-4000-8000-000000000002'::uuid, 'aa000003-0000-4000-8000-000000000003'::uuid, 'مینا جلالی',  'Stylist', true, '09120000302'),
    ('ab040000-0000-4000-8000-000000000001'::uuid, 'aa000004-0000-4000-8000-000000000004'::uuid, 'آرش کمالی',   'Owner',   true, '09120000401'),
    ('ab050000-0000-4000-8000-000000000001'::uuid, 'aa000005-0000-4000-8000-000000000005'::uuid, 'پریسا نعمتی', 'Owner',   true, '09120000501'),
    ('ab050000-0000-4000-8000-000000000002'::uuid, 'aa000005-0000-4000-8000-000000000005'::uuid, 'شبنم راد',    'Stylist', true, '09120000502')
)
INSERT INTO staff_member (id, salon_id, full_name, role, active, phone)
SELECT
  demo.id,
  demo.salon_id,
  demo.full_name,
  demo.role::"StaffRole",
  demo.active,
  CASE WHEN conflict.id IS NULL THEN demo.phone ELSE NULL END
FROM demo_staff AS demo
LEFT JOIN staff_member AS conflict
  ON conflict.phone = demo.phone AND conflict.id <> demo.id
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  active = EXCLUDED.active,
  phone = EXCLUDED.phone;

INSERT INTO chair (id, salon_id, name, active)
VALUES
  ('ac010000-0000-4000-8000-000000000001'::uuid, 'aa000001-0000-4000-8000-000000000001'::uuid, 'صندلی ۱', true),
  ('ac020000-0000-4000-8000-000000000001'::uuid, 'aa000002-0000-4000-8000-000000000002'::uuid, 'صندلی ۱', true),
  ('ac030000-0000-4000-8000-000000000001'::uuid, 'aa000003-0000-4000-8000-000000000003'::uuid, 'صندلی ۱', true),
  ('ac040000-0000-4000-8000-000000000001'::uuid, 'aa000004-0000-4000-8000-000000000004'::uuid, 'صندلی ۱', true),
  ('ac050000-0000-4000-8000-000000000001'::uuid, 'aa000005-0000-4000-8000-000000000005'::uuid, 'صندلی ۱', true)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active;

-- Services mirror data/salons.ts service lists exactly (names/durations/prices).
INSERT INTO service (id, salon_id, name, duration_min, buffer_min, price_rial, requires_deposit, deposit_rial)
VALUES
  -- salon-maryam
  ('ad010000-0000-4000-8000-000000000001'::uuid, 'aa000001-0000-4000-8000-000000000001'::uuid, 'رنگ مو',                 120, 10,  7500000, false, NULL),
  ('ad010000-0000-4000-8000-000000000002'::uuid, 'aa000001-0000-4000-8000-000000000001'::uuid, 'کراتین مو',              180, 15, 15000000, false, NULL),
  ('ad010000-0000-4000-8000-000000000003'::uuid, 'aa000001-0000-4000-8000-000000000001'::uuid, 'کوتاهی مو',               45,  5,  2000000, false, NULL),
  -- shahin-barbershop
  ('ad020000-0000-4000-8000-000000000001'::uuid, 'aa000002-0000-4000-8000-000000000002'::uuid, 'اصلاح مو',                30,  5,  1500000, false, NULL),
  ('ad020000-0000-4000-8000-000000000002'::uuid, 'aa000002-0000-4000-8000-000000000002'::uuid, 'اصلاح ریش',               20,  5,  1000000, false, NULL),
  -- salon-niloofar
  ('ad030000-0000-4000-8000-000000000001'::uuid, 'aa000003-0000-4000-8000-000000000003'::uuid, 'کاشت ناخن',               90, 10,  5000000, false, NULL),
  ('ad030000-0000-4000-8000-000000000002'::uuid, 'aa000003-0000-4000-8000-000000000003'::uuid, 'مانیکور',                 60,  5,  3000000, false, NULL),
  ('ad030000-0000-4000-8000-000000000003'::uuid, 'aa000003-0000-4000-8000-000000000003'::uuid, 'پاکسازی صورت',            75, 10,  4500000, false, NULL),
  -- arash-studio
  ('ad040000-0000-4000-8000-000000000001'::uuid, 'aa000004-0000-4000-8000-000000000004'::uuid, 'اصلاح مو',                40,  5,  2500000, false, NULL),
  ('ad040000-0000-4000-8000-000000000002'::uuid, 'aa000004-0000-4000-8000-000000000004'::uuid, 'گریم داماد',             120, 15,  8000000, false, NULL),
  ('ad040000-0000-4000-8000-000000000003'::uuid, 'aa000004-0000-4000-8000-000000000004'::uuid, 'پاکسازی پوست مردانه',     60, 10,  4000000, false, NULL),
  -- salon-parisa
  ('ad050000-0000-4000-8000-000000000001'::uuid, 'aa000005-0000-4000-8000-000000000005'::uuid, 'میکاپ عروس',             180, 15, 25000000, true, 5000000),
  ('ad050000-0000-4000-8000-000000000002'::uuid, 'aa000005-0000-4000-8000-000000000005'::uuid, 'شینیون',                  90, 10, 10000000, false, NULL),
  ('ad050000-0000-4000-8000-000000000003'::uuid, 'aa000005-0000-4000-8000-000000000005'::uuid, 'مراقبت و تقویت مو',       60,  5,  6000000, false, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  duration_min = EXCLUDED.duration_min,
  buffer_min = EXCLUDED.buffer_min,
  price_rial = EXCLUDED.price_rial,
  requires_deposit = EXCLUDED.requires_deposit,
  deposit_rial = EXCLUDED.deposit_rial;

-- Every service is performable by every staff member of its salon.
INSERT INTO service_staff (service_id, staff_member_id)
SELECT s.id, st.id
FROM service s
JOIN staff_member st ON st.salon_id = s.salon_id
WHERE s.salon_id IN (
  'aa000001-0000-4000-8000-000000000001'::uuid,
  'aa000002-0000-4000-8000-000000000002'::uuid,
  'aa000003-0000-4000-8000-000000000003'::uuid,
  'aa000004-0000-4000-8000-000000000004'::uuid,
  'aa000005-0000-4000-8000-000000000005'::uuid
)
ON CONFLICT (service_id, staff_member_id) DO NOTHING;

-- Working hours 09:00–20:00 every weekday for each new staff member + chair.
-- Rebuilt each run (delete then insert) so the block stays idempotent.
DELETE FROM working_hours
WHERE owner_id IN (
  'ab010000-0000-4000-8000-000000000001'::uuid,
  'ab010000-0000-4000-8000-000000000002'::uuid,
  'ab020000-0000-4000-8000-000000000001'::uuid,
  'ab030000-0000-4000-8000-000000000001'::uuid,
  'ab030000-0000-4000-8000-000000000002'::uuid,
  'ab040000-0000-4000-8000-000000000001'::uuid,
  'ab050000-0000-4000-8000-000000000001'::uuid,
  'ab050000-0000-4000-8000-000000000002'::uuid,
  'ac010000-0000-4000-8000-000000000001'::uuid,
  'ac020000-0000-4000-8000-000000000001'::uuid,
  'ac030000-0000-4000-8000-000000000001'::uuid,
  'ac040000-0000-4000-8000-000000000001'::uuid,
  'ac050000-0000-4000-8000-000000000001'::uuid
);

INSERT INTO working_hours (id, owner_kind, owner_id, weekday, start_time, end_time)
SELECT
  (o.id_prefix || d::text)::uuid,
  o.kind,
  o.owner_id,
  d, TIME '09:00', TIME '20:00'
FROM (
  VALUES
    ('staff', 'ab010000-0000-4000-8000-000000000001'::uuid, 'ae010100-0000-4000-8000-00000000000'),
    ('staff', 'ab010000-0000-4000-8000-000000000002'::uuid, 'ae010200-0000-4000-8000-00000000000'),
    ('staff', 'ab020000-0000-4000-8000-000000000001'::uuid, 'ae020100-0000-4000-8000-00000000000'),
    ('staff', 'ab030000-0000-4000-8000-000000000001'::uuid, 'ae030100-0000-4000-8000-00000000000'),
    ('staff', 'ab030000-0000-4000-8000-000000000002'::uuid, 'ae030200-0000-4000-8000-00000000000'),
    ('staff', 'ab040000-0000-4000-8000-000000000001'::uuid, 'ae040100-0000-4000-8000-00000000000'),
    ('staff', 'ab050000-0000-4000-8000-000000000001'::uuid, 'ae050100-0000-4000-8000-00000000000'),
    ('staff', 'ab050000-0000-4000-8000-000000000002'::uuid, 'ae050200-0000-4000-8000-00000000000'),
    ('chair', 'ac010000-0000-4000-8000-000000000001'::uuid, 'ae010300-0000-4000-8000-00000000000'),
    ('chair', 'ac020000-0000-4000-8000-000000000001'::uuid, 'ae020300-0000-4000-8000-00000000000'),
    ('chair', 'ac030000-0000-4000-8000-000000000001'::uuid, 'ae030300-0000-4000-8000-00000000000'),
    ('chair', 'ac040000-0000-4000-8000-000000000001'::uuid, 'ae040300-0000-4000-8000-00000000000'),
    ('chair', 'ac050000-0000-4000-8000-000000000001'::uuid, 'ae050300-0000-4000-8000-00000000000')
) AS o(kind, owner_id, id_prefix)
CROSS JOIN generate_series(0, 6) AS d;

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
