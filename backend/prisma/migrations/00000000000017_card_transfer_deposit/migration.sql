-- Manual card-transfer deposits: salon instructions + private receipt storage.
ALTER TABLE "salon"
  ADD COLUMN IF NOT EXISTS "deposit_method" TEXT NOT NULL DEFAULT 'gateway',
  ADD COLUMN IF NOT EXISTS "deposit_card_number" TEXT,
  ADD COLUMN IF NOT EXISTS "deposit_card_holder" TEXT,
  ADD COLUMN IF NOT EXISTS "deposit_bank_name" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DepositReceiptStatus') THEN
    CREATE TYPE "DepositReceiptStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "deposit_receipt" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointment_id" UUID NOT NULL,
  "payment_id" UUID,
  "salon_id" UUID NOT NULL,
  "amount_rial" BIGINT NOT NULL,
  "status" "DepositReceiptStatus" NOT NULL DEFAULT 'pending',
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "note" TEXT,
  "uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMPTZ,
  "reviewed_by" UUID,
  CONSTRAINT "deposit_receipt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deposit_receipt_appointment_id_key" UNIQUE ("appointment_id"),
  CONSTRAINT "deposit_receipt_payment_id_key" UNIQUE ("payment_id"),
  CONSTRAINT "deposit_receipt_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "deposit_receipt_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "deposit_receipt_salon_id_fkey"
    FOREIGN KEY ("salon_id") REFERENCES "salon"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "deposit_receipt_salon_id_status_idx"
  ON "deposit_receipt"("salon_id", "status");
