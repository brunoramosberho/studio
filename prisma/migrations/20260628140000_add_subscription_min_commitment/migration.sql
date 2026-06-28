-- AlterTable
-- Minimum-commitment for subscription packages: the member can't end the
-- subscription before this many months (a cancellation is scheduled for the
-- commitment end instead). `commitmentEndsAt` snapshots the end at signup;
-- `cancelRequested` tracks a commitment-aware cancellation separately from the
-- webhook-owned `cancelAtPeriodEnd`. Existing rows unaffected. Applied to
-- production manually via Supabase before this file landed, so guard with
-- IF NOT EXISTS to keep `migrate deploy` idempotent.
ALTER TABLE "Package" ADD COLUMN IF NOT EXISTS "minCommitmentMonths" INTEGER;
ALTER TABLE "MemberSubscription" ADD COLUMN IF NOT EXISTS "commitmentEndsAt" TIMESTAMP(3);
ALTER TABLE "MemberSubscription" ADD COLUMN IF NOT EXISTS "cancelRequested" BOOLEAN NOT NULL DEFAULT false;
