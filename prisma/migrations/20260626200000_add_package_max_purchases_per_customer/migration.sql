-- AlterTable
-- Per-customer purchase cap for packages (null = unlimited; existing rows
-- unaffected). Applied to production manually via Supabase before this file
-- landed, so guard with IF NOT EXISTS to keep `migrate deploy` idempotent.
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "maxPurchasesPerCustomer" INTEGER;
