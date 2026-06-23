-- Runs once, on first initialization of the postgres data volume.
-- The scheduling integrity guarantees rely on btree_gist (EXCLUDE constraints),
-- so make the extension available up front. It is also created idempotently by
-- the backend dev entrypoint, so this is belt-and-suspenders.
CREATE EXTENSION IF NOT EXISTS btree_gist;
