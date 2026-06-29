-- Distinguish auto-applied default quota from a manual per-class override.
-- isAutoQuota=true → row came from the tenant default (follows default changes).
-- isAutoQuota=false → explicit manual override set in the class editor.

ALTER TABLE "SchedulePlatformQuota"
    ADD COLUMN "isAutoQuota" BOOLEAN NOT NULL DEFAULT false;
