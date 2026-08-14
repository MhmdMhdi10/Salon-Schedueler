-- Global admin identity, audit trail, and salon lifecycle state.
-- Additive/idempotent because local development databases are bootstrapped with
-- prisma db push and then replay these migrations on every backend start.

ALTER TABLE salon
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS platform_admin (
    id            UUID NOT NULL,
    phone         TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'super_admin',
    active        BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ(6),
    CONSTRAINT platform_admin_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_phone_key
  ON platform_admin (phone);

CREATE TABLE IF NOT EXISTS platform_audit_log (
    id          UUID NOT NULL,
    admin_id    UUID NOT NULL,
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID,
    metadata    JSONB,
    created_at  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT platform_audit_log_pkey PRIMARY KEY (id),
    CONSTRAINT platform_audit_log_admin_id_fkey
      FOREIGN KEY (admin_id) REFERENCES platform_admin(id)
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS platform_audit_log_created_at_idx
  ON platform_audit_log (created_at);
CREATE INDEX IF NOT EXISTS platform_audit_log_entity_idx
  ON platform_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS platform_audit_log_admin_created_idx
  ON platform_audit_log (admin_id, created_at);
