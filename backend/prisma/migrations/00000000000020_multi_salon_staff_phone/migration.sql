-- A person can be a member of more than one salon. The old global unique
-- index prevented adding an existing salon owner to another salon's team.
DROP INDEX IF EXISTS "staff_member_phone_key";
CREATE INDEX IF NOT EXISTS "staff_member_phone_active_idx"
  ON "staff_member" ("phone", "active");
