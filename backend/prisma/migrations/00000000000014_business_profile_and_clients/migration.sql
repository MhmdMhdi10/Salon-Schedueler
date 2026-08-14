-- First-step owner onboarding metadata and a per-salon client book.
ALTER TABLE "salon"
  ADD COLUMN IF NOT EXISTS "business_type" TEXT,
  ADD COLUMN IF NOT EXISTS "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "salon_client" (
  "salon_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "salon_client_pkey" PRIMARY KEY ("salon_id", "customer_id")
);

CREATE INDEX IF NOT EXISTS "salon_client_salon_id_created_at_idx"
  ON "salon_client" ("salon_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salon_client_salon_id_fkey'
      AND conrelid = 'salon_client'::regclass
  ) THEN
    ALTER TABLE "salon_client"
      ADD CONSTRAINT "salon_client_salon_id_fkey"
      FOREIGN KEY ("salon_id") REFERENCES "salon"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'salon_client_customer_id_fkey'
      AND conrelid = 'salon_client'::regclass
  ) THEN
    ALTER TABLE "salon_client"
      ADD CONSTRAINT "salon_client_customer_id_fkey"
      FOREIGN KEY ("customer_id") REFERENCES "customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
