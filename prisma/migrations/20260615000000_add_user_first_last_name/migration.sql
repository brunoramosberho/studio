-- Structured given/family name on User. The legacy `name` column stays as the
-- canonical display value ("firstName lastName") so existing `name.split(" ")`
-- consumers keep working; firstName/lastName carry the structured data captured
-- at signup (or in the complete-profile gate for Google/OAuth users).
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- Best-effort backfill from the existing single name field: first token ->
-- firstName, remaining tokens -> lastName.
UPDATE "User"
SET
  "firstName" = NULLIF(split_part(trim("name"), ' ', 1), ''),
  "lastName"  = NULLIF(trim(substring(trim("name") from position(' ' in trim("name")) + 1)), '')
WHERE "name" IS NOT NULL AND trim("name") <> '';

-- Rows whose name had no space: keep firstName, ensure lastName is null.
UPDATE "User"
SET "lastName" = NULL
WHERE "name" IS NOT NULL AND position(' ' in trim("name")) = 0;
