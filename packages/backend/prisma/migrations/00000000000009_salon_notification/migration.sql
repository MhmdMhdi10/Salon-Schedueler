-- Salon Inbox Notification: realtime-delivered events the owner/staff see in the
-- dashboard inbox (booking pending, approved/rejected, card order, new customer,
-- subscribing-expiring, ...). Stored for the Inbox UI + to track readAt. WebSocket
-- pipe delivers a transient copy of the row; this table is the durable copy.

CREATE TABLE "salon_notification" (
    "id"              UUID            NOT NULL,
    "salon_id"        UUID            NOT NULL,
    "audience"        TEXT            NOT NULL DEFAULT 'owner',
    "staff_member_id" UUID,
    "type"            TEXT            NOT NULL,
    "title"           TEXT            NOT NULL,
    "body"            TEXT            NOT NULL,
    "payload"         JSONB,
    "read_at"         TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salon_notification_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "salon_notification_salon_id_fkey"
        FOREIGN KEY ("salon_id") REFERENCES "salon"("id")
            ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "salon_notification_staff_member_id_fkey"
        FOREIGN KEY ("staff_member_id") REFERENCES "staff_member"("id")
            ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "salon_notification_salon_id_created_at_idx"
    ON "salon_notification"("salon_id", "created_at");
CREATE INDEX "salon_notification_salon_id_read_at_idx"
    ON "salon_notification"("salon_id", "read_at");
CREATE INDEX "salon_notification_salon_id_audience_read_at_idx"
    ON "salon_notification"("salon_id", "audience", "read_at");
CREATE INDEX "salon_notification_salon_id_staff_member_id_read_at_idx"
    ON "salon_notification"("salon_id", "staff_member_id", "read_at");
