ALTER TABLE "service"
  ADD COLUMN IF NOT EXISTS "duration_mode" TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS "min_duration_min" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_duration_min" INTEGER,
  ADD COLUMN IF NOT EXISTS "deposit_type" TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS "deposit_percent" INTEGER;

ALTER TABLE "appointment"
  ADD COLUMN IF NOT EXISTS "customer_note" TEXT,
  ADD COLUMN IF NOT EXISTS "duration_min_override" INTEGER;

UPDATE "service"
SET "min_duration_min" = "duration_min"
WHERE "duration_mode" = 'variable' AND "min_duration_min" IS NULL;

UPDATE "service"
SET "max_duration_min" = COALESCE("min_duration_min", "duration_min")
WHERE "duration_mode" = 'variable' AND "max_duration_min" IS NULL;

CREATE INDEX IF NOT EXISTS "service_duration_mode_idx"
  ON "service" ("salon_id", "duration_mode");
