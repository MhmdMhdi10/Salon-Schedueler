-- Per-salon Brand_Accent key (signature-ui-system R4.1).
--
-- Adds a nullable storefront accent key to the salon. null = use the signature
-- default palette; a non-null value is an opaque accent key (e.g. "rose")
-- resolved client-side against the curated ACCENTS palette.
--
-- Additive and backward-compatible: existing rows keep null (signature default).

ALTER TABLE "salon" ADD COLUMN IF NOT EXISTS "brand_accent" TEXT;
