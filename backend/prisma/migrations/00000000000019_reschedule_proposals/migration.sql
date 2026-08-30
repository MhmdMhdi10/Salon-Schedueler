-- Keep staff-initiated reschedules pending until the customer confirms them.
ALTER TABLE "appointment"
  ADD COLUMN IF NOT EXISTS "pending_reschedule_start_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pending_reschedule_end_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pending_reschedule_requested_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pending_reschedule_requested_by" UUID;

CREATE INDEX IF NOT EXISTS "appointment_pending_reschedule_idx"
  ON "appointment" ("customer_id", "pending_reschedule_start_at")
  WHERE "pending_reschedule_start_at" IS NOT NULL;
