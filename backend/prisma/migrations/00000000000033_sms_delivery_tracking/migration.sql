CREATE TABLE IF NOT EXISTS "sms_delivery" (
  "id" UUID NOT NULL,
  "phone" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "provider_id" TEXT,
  "error" TEXT,
  "next_retry_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_delivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "sms_delivery_status_created_at_idx" ON "sms_delivery"("status", "created_at");
CREATE INDEX IF NOT EXISTS "sms_delivery_phone_created_at_idx" ON "sms_delivery"("phone", "created_at");
CREATE TABLE IF NOT EXISTS "sms_delivery_attempt" (
  "id" UUID NOT NULL,
  "delivery_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "provider_id" TEXT,
  "error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sms_delivery_attempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sms_delivery_attempt_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "sms_delivery"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "sms_delivery_attempt_delivery_id_created_at_idx" ON "sms_delivery_attempt"("delivery_id", "created_at");
