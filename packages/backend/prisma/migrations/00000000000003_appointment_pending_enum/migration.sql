-- Booking approval workflow — step 1: add the 'pending' appointment status.
-- Requirements: admin must approve a booking before the customer is notified.
--
-- A new booking is created as 'pending' (awaiting salon admin approval) instead
-- of going straight to 'confirmed'. This value is added in its OWN migration so
-- it is committed before any later migration references it: PostgreSQL forbids
-- using a freshly added enum value in the same transaction that adds it.

ALTER TYPE "ApptStatus" ADD VALUE IF NOT EXISTS 'pending';
