-- Per-tenant default Wellhub quota, auto-applied to classes as they enter the
-- client-visible schedule window (so Wellhub never gets unreleased classes).

ALTER TABLE "StudioPlatformConfig"
    ADD COLUMN "wellhubDefaultQuota" INTEGER;
