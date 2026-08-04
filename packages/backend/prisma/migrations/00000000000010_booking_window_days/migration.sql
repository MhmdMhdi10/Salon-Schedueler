ALTER TABLE "salon"
ADD COLUMN "booking_window_days" INTEGER NOT NULL DEFAULT 14;

ALTER TABLE "salon"
ADD CONSTRAINT "salon_booking_window_days_check"
CHECK ("booking_window_days" BETWEEN 0 AND 365);
