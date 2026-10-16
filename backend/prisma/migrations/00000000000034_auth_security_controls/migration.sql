ALTER TABLE "otp"
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "auth_refresh_session" (
  "token_id_hash" TEXT NOT NULL,
  "subject_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auth_refresh_session_pkey" PRIMARY KEY ("token_id_hash")
);
CREATE INDEX IF NOT EXISTS "auth_refresh_session_subject_id_revoked_at_idx"
  ON "auth_refresh_session"("subject_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "auth_refresh_session_expires_at_idx"
  ON "auth_refresh_session"("expires_at");

CREATE TABLE IF NOT EXISTS "auth_rate_limit_bucket" (
  "key" TEXT NOT NULL,
  "window_started_at" TIMESTAMPTZ NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "auth_rate_limit_bucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX IF NOT EXISTS "auth_rate_limit_bucket_window_started_at_idx"
  ON "auth_rate_limit_bucket"("window_started_at");
