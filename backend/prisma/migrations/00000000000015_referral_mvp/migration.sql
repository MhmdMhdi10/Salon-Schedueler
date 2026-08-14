-- Customer-led salon acquisition MVP.
CREATE TABLE IF NOT EXISTS "salon_referral" (
    "id" UUID NOT NULL,
    "referrer_id" UUID NOT NULL,
    "salon_id" UUID,
    "salon_name" TEXT NOT NULL,
    "salon_phone" TEXT,
    "salon_instagram" TEXT,
    "city" TEXT,
    "normalized_key" TEXT NOT NULL,
    "claim_token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "qualifying_bookings" INTEGER NOT NULL DEFAULT 0,
    "required_bookings" INTEGER NOT NULL DEFAULT 3,
    "reward_amount_rial" BIGINT NOT NULL DEFAULT 5000000,
    "reward_status" TEXT NOT NULL DEFAULT 'locked',
    "reward_expires_at" TIMESTAMPTZ,
    "claimed_at" TIMESTAMPTZ,
    "qualified_at" TIMESTAMPTZ,
    "redeemed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "salon_referral_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "salon_referral_normalized_key_key" ON "salon_referral" ("normalized_key");
CREATE UNIQUE INDEX IF NOT EXISTS "salon_referral_claim_token_key" ON "salon_referral" ("claim_token");
CREATE INDEX IF NOT EXISTS "salon_referral_referrer_id_created_at_idx" ON "salon_referral" ("referrer_id", "created_at");
CREATE INDEX IF NOT EXISTS "salon_referral_salon_id_status_idx" ON "salon_referral" ("salon_id", "status");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salon_referral_referrer_id_fkey' AND conrelid = 'salon_referral'::regclass) THEN
    ALTER TABLE "salon_referral" ADD CONSTRAINT "salon_referral_referrer_id_fkey"
      FOREIGN KEY ("referrer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salon_referral_salon_id_fkey' AND conrelid = 'salon_referral'::regclass) THEN
    ALTER TABLE "salon_referral" ADD CONSTRAINT "salon_referral_salon_id_fkey"
      FOREIGN KEY ("salon_id") REFERENCES "salon"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
