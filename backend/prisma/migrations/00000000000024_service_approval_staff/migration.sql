ALTER TABLE "service"
  ADD COLUMN IF NOT EXISTS "approval_staff_id" UUID;

CREATE INDEX IF NOT EXISTS "service_approval_staff_id_idx"
  ON "service" ("approval_staff_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_approval_staff_id_fkey'
  ) THEN
    ALTER TABLE "service"
      ADD CONSTRAINT "service_approval_staff_id_fkey"
      FOREIGN KEY ("approval_staff_id") REFERENCES "staff_member"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
