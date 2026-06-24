-- Wellhub (and other platform) commercial-condition fields, used by the
-- liquidation estimate to mirror the partner contract beyond the per-check-in
-- rate: per-visitor monthly cap, no-show / late-cancel percentages, and free
-- (non-paying) visits per month.

ALTER TABLE "StudioPlatformConfig"
    ADD COLUMN "maxPayoutPerVisitor" DOUBLE PRECISION,
    ADD COLUMN "noShowPercent"       DOUBLE PRECISION,
    ADD COLUMN "lateCancelPercent"   DOUBLE PRECISION,
    ADD COLUMN "freeVisitsPerMonth"  INTEGER;
