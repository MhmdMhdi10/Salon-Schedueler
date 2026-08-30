ALTER TABLE "staff_member" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "chair" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "equipment" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
ALTER TABLE "service" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS "staff_member_salon_deleted_idx"
  ON "staff_member" ("salon_id", "deleted_at");
CREATE INDEX IF NOT EXISTS "service_salon_deleted_idx"
  ON "service" ("salon_id", "deleted_at");
