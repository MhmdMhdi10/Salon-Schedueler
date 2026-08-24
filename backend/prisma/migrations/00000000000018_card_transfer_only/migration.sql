-- Card-to-card is the only active deposit checkout method for now.
ALTER TABLE "salon"
  ALTER COLUMN "deposit_method" SET DEFAULT 'card_transfer';

UPDATE "salon"
SET "deposit_method" = 'card_transfer'
WHERE "deposit_method" <> 'card_transfer';
