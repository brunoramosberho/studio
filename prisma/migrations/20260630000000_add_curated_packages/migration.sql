-- Curated package merchandising (behavioural-economics decoy effect) on the
-- per-tenant conversion config. Additive + off by default — existing rows get
-- false / empty arrays and the booking flow + /packages keep the full list until
-- an admin enables and configures it.
ALTER TABLE "MembershipConversionConfig"
  ADD COLUMN "curatedEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "curatedFirstTimerIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "curatedFirstTimerRecommendedId" TEXT,
  ADD COLUMN "curatedReturningIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "curatedReturningRecommendedId" TEXT;
