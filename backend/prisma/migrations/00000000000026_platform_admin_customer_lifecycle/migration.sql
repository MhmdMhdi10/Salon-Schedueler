-- Global customer lifecycle for platform moderation. Deactivation is used for
-- blocking; deleted_at is a recoverable soft-delete marker that preserves
-- appointment/payment history.
ALTER TABLE "customer"
  ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "customer"
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "customer_active_deleted_at_idx"
  ON "customer" ("active", "deleted_at");
