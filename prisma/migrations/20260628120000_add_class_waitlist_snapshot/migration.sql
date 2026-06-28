-- AlterTable
-- Snapshot of who was still on the waitlist when a class started (the live
-- entries are refunded + cleared at that point). Lets the check-in roster show
-- "was on the waitlist" for past classes. null = no snapshot; existing rows
-- unaffected. Applied to production manually via Supabase before this file
-- landed, so guard with IF NOT EXISTS to keep `migrate deploy` idempotent.
ALTER TABLE "Class" ADD COLUMN IF NOT EXISTS "waitlistSnapshot" JSONB;
