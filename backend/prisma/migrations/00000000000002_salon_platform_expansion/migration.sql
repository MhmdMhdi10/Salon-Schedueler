-- Task 1.1: Salon Platform Expansion — additive data model
-- Requirements: 1.1, 1.6, 3.1, 4.5
--
-- All changes are ADDITIVE: a new ApptSource value, three new enums, and five
-- new tables with their relations. No existing tables/columns are altered or
-- dropped, so existing API/test contracts are preserved.

-- 1. Additive enum value: allow appointments created from the bot channel.
ALTER TYPE "ApptSource" ADD VALUE IF NOT EXISTS 'bot';

-- 2. New enums.
CREATE TYPE "BotPlatform" AS ENUM ('telegram', 'bale');
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'grace', 'expired');
CREATE TYPE "SubscriptionPlanKind" AS ENUM ('trial', 'monthly', 'quarterly', 'annual');

-- 3. Bot chat identity link (one of customer_id / staff_member_id is set).
CREATE TABLE "bot_chat" (
    "id" UUID NOT NULL,
    "platform" "BotPlatform" NOT NULL,
    "chat_id" TEXT NOT NULL,
    "customer_id" UUID,
    "staff_member_id" UUID,
    "linked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bot_chat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_chat_platform_chat_id_key" ON "bot_chat" ("platform", "chat_id");

ALTER TABLE "bot_chat"
    ADD CONSTRAINT "bot_chat_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customer" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bot_chat"
    ADD CONSTRAINT "bot_chat_staff_member_id_fkey"
    FOREIGN KEY ("staff_member_id") REFERENCES "staff_member" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Bot booking conversation state (server-side state machine).
CREATE TABLE "bot_session" (
    "id" UUID NOT NULL,
    "platform" "BotPlatform" NOT NULL,
    "chat_id" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "draft_json" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bot_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bot_session_platform_chat_id_key" ON "bot_session" ("platform", "chat_id");

-- 5. Subscription (one per salon).
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trial',
    "plan_kind" "SubscriptionPlanKind" NOT NULL DEFAULT 'trial',
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "grace_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_salon_id_key" ON "subscription" ("salon_id");

ALTER TABLE "subscription"
    ADD CONSTRAINT "subscription_salon_id_fkey"
    FOREIGN KEY ("salon_id") REFERENCES "salon" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Subscription payment (separate from booking Payment; same PaymentStatus enum).
CREATE TABLE "subscription_payment" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "plan_kind" "SubscriptionPlanKind" NOT NULL,
    "amount_rial" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "gateway" TEXT NOT NULL,
    "authority" TEXT,
    "ref_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscription_payment"
    ADD CONSTRAINT "subscription_payment_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "subscription" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. QR scan counting.
CREATE TABLE "qr_scan_event" (
    "id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_scan_event_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "qr_scan_event"
    ADD CONSTRAINT "qr_scan_event_salon_id_fkey"
    FOREIGN KEY ("salon_id") REFERENCES "salon" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
