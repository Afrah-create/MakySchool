-- Multiple school contact phones/emails (idempotent)

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS phones TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS emails TEXT[] NOT NULL DEFAULT '{}';

-- Backfill from legacy single-value columns when arrays are empty.
UPDATE schools
SET phones = ARRAY[btrim(phone)]
WHERE phone IS NOT NULL
  AND btrim(phone) <> ''
  AND cardinality(phones) = 0;

UPDATE schools
SET emails = ARRAY[btrim(email)]
WHERE email IS NOT NULL
  AND btrim(email) <> ''
  AND cardinality(emails) = 0;
