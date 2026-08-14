-- Role-aware SMS routing. Defaults intentionally notify the assigned stylist,
-- while owner delivery remains opt-in to reduce noise for salon owners.
CREATE TABLE IF NOT EXISTS salon_sms_settings (
    id                   UUID NOT NULL DEFAULT gen_random_uuid(),
    salon_id             UUID NOT NULL,
    owner_booking        BOOLEAN NOT NULL DEFAULT false,
    stylist_booking      BOOLEAN NOT NULL DEFAULT true,
    owner_reminder       BOOLEAN NOT NULL DEFAULT false,
    stylist_reminder     BOOLEAN NOT NULL DEFAULT true,
    owner_cancellation   BOOLEAN NOT NULL DEFAULT false,
    stylist_cancellation BOOLEAN NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT salon_sms_settings_pkey PRIMARY KEY (id),
    CONSTRAINT salon_sms_settings_salon_id_key UNIQUE (salon_id),
    CONSTRAINT salon_sms_settings_salon_id_fkey
      FOREIGN KEY (salon_id) REFERENCES salon(id)
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS salon_sms_settings_salon_id_idx
  ON salon_sms_settings (salon_id);
