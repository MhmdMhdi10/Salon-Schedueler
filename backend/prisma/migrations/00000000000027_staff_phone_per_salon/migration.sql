-- Keep staff login phones reusable across salons while preventing duplicate
-- identities inside one salon. PostgreSQL permits multiple NULLs in a unique
-- index, so non-login staff members remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS "staff_member_salon_id_phone_key"
  ON "staff_member" ("salon_id", "phone");
