-- First-step owner onboarding metadata and a per-salon client book.
ALTER TABLE "salon"
  ADD COLUMN "business_type" TEXT,
  ADD COLUMN "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "salon_client" (
  "salon_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "salon_client_pkey" PRIMARY KEY ("salon_id", "customer_id")
);

CREATE INDEX "salon_client_salon_id_created_at_idx"
  ON "salon_client" ("salon_id", "created_at");

ALTER TABLE "salon_client"
  ADD CONSTRAINT "salon_client_salon_id_fkey"
  FOREIGN KEY ("salon_id") REFERENCES "salon"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "salon_client"
  ADD CONSTRAINT "salon_client_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
