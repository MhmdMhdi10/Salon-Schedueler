-- Keep notification delivery idempotent across reminder scheduler restarts.
ALTER TABLE "notification_log"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'generic';

CREATE INDEX IF NOT EXISTS "notification_log_appointment_type_status_idx"
  ON "notification_log" ("appointment_id", "type", "channel", "status");
