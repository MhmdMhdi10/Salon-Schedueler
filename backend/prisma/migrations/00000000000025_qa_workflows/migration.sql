CREATE TABLE IF NOT EXISTS "appointment_service" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointment_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "duration_min" INTEGER NOT NULL,
  "buffer_min" INTEGER NOT NULL,
  "price_rial" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_service_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_service_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "appointment_service_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "appointment_service_appointment_id_position_key" ON "appointment_service" ("appointment_id", "position");
CREATE INDEX IF NOT EXISTS "appointment_service_service_id_idx" ON "appointment_service" ("service_id");

CREATE TABLE IF NOT EXISTS "appointment_cancellation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "appointment_id" UUID NOT NULL,
  "cancelled_by" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'standard',
  "reason" TEXT NOT NULL,
  "refund_status" TEXT NOT NULL DEFAULT 'not_required',
  "refund_due_at" TIMESTAMPTZ,
  "proof_file_name" TEXT,
  "proof_mime_type" TEXT,
  "proof_size_bytes" INTEGER,
  "proof_data" BYTEA,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_cancellation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_cancellation_appointment_id_key" UNIQUE ("appointment_id"),
  CONSTRAINT "appointment_cancellation_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "appointment_cancellation_refund_status_refund_due_at_idx" ON "appointment_cancellation" ("refund_status", "refund_due_at");

CREATE TABLE IF NOT EXISTS "customer_notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" UUID NOT NULL,
  "appointment_id" UUID,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payload" JSONB,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_notification_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_notification_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "customer_notification_customer_id_created_at_idx" ON "customer_notification" ("customer_id", "created_at");
CREATE INDEX IF NOT EXISTS "customer_notification_customer_id_read_at_idx" ON "customer_notification" ("customer_id", "read_at");

CREATE TABLE IF NOT EXISTS "customer_salon_block" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "salon_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "appointment_id" UUID,
  "reason" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_salon_block_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_salon_block_salon_id_customer_id_key" UNIQUE ("salon_id", "customer_id"),
  CONSTRAINT "customer_salon_block_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salon"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_salon_block_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_salon_block_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "customer_salon_block_salon_id_active_idx" ON "customer_salon_block" ("salon_id", "active");

CREATE TABLE IF NOT EXISTS "customer_moderation_report" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "salon_id" UUID NOT NULL,
  "customer_id" UUID NOT NULL,
  "appointment_id" UUID,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_moderation_report_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customer_moderation_report_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salon"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_moderation_report_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "customer_moderation_report_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "customer_moderation_report_salon_id_created_at_idx" ON "customer_moderation_report" ("salon_id", "created_at");

CREATE TABLE IF NOT EXISTS "card_order" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_number" TEXT NOT NULL,
  "salon_id" UUID NOT NULL,
  "template" TEXT NOT NULL,
  "accent" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "contact_name" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "notes" TEXT,
  "print_specs" JSONB,
  "status" TEXT NOT NULL DEFAULT 'received',
  "handled_by_admin_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "card_order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "card_order_order_number_key" UNIQUE ("order_number"),
  CONSTRAINT "card_order_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salon"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "card_order_handled_by_admin_id_fkey" FOREIGN KEY ("handled_by_admin_id") REFERENCES "platform_admin"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "card_order_salon_id_created_at_idx" ON "card_order" ("salon_id", "created_at");
CREATE INDEX IF NOT EXISTS "card_order_status_created_at_idx" ON "card_order" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "support_ticket" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticket_number" TEXT NOT NULL,
  "reporter_id" UUID,
  "reporter_staff_id" UUID,
  "reporter_role" TEXT,
  "salon_id" UUID,
  "page" TEXT,
  "action" TEXT,
  "message" TEXT NOT NULL,
  "error_code" TEXT,
  "request_id" TEXT,
  "user_agent" TEXT,
  "browser" TEXT,
  "device" TEXT,
  "screenshot_name" TEXT,
  "screenshot_mime" TEXT,
  "screenshot_size" INTEGER,
  "screenshot_data" BYTEA,
  "status" TEXT NOT NULL DEFAULT 'open',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "assigned_admin_id" UUID,
  "resolution" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "support_ticket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_ticket_ticket_number_key" UNIQUE ("ticket_number"),
  CONSTRAINT "support_ticket_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "customer"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_ticket_reporter_staff_id_fkey" FOREIGN KEY ("reporter_staff_id") REFERENCES "staff_member"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_ticket_salon_id_fkey" FOREIGN KEY ("salon_id") REFERENCES "salon"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "support_ticket_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "platform_admin"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "support_ticket_status_created_at_idx" ON "support_ticket" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "support_ticket_reporter_id_created_at_idx" ON "support_ticket" ("reporter_id", "created_at");
CREATE INDEX IF NOT EXISTS "support_ticket_salon_id_created_at_idx" ON "support_ticket" ("salon_id", "created_at");
