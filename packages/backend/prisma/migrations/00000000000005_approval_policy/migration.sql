-- Booking approval policy.
--
-- Adds a per-salon default approval policy and an optional per-stylist override:
--   - salon.auto_approve (NOT NULL, default false): when true, new deposit-free
--     bookings are auto-confirmed on creation; when false they are created
--     'pending' and require manual admin approval.
--   - staff_member.auto_approve (NULLABLE): null inherits the salon default;
--     true/false overrides it for that stylist's bookings.
--
-- Additive and backward-compatible: existing rows keep manual approval.

ALTER TABLE "salon" ADD COLUMN IF NOT EXISTS "auto_approve" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "staff_member" ADD COLUMN IF NOT EXISTS "auto_approve" BOOLEAN;
