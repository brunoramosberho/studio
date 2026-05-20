-- Schedule visibility: rolling window OR weekly release drop
--
-- Adds:
--   - ScheduleVisibilityMode enum (ROLLING_DAYS, WEEKLY_RELEASE)
--   - Tenant.scheduleVisibilityMode (default ROLLING_DAYS — preserves existing behaviour)
--   - Tenant.scheduleReleaseDayOfWeek / scheduleReleaseHour / scheduleReleaseWeeksAhead / scheduleReleaseTimezone
--     (all nullable; only consulted when scheduleVisibilityMode = WEEKLY_RELEASE)

CREATE TYPE "ScheduleVisibilityMode" AS ENUM ('ROLLING_DAYS', 'WEEKLY_RELEASE');

ALTER TABLE "Tenant"
  ADD COLUMN "scheduleVisibilityMode" "ScheduleVisibilityMode" NOT NULL DEFAULT 'ROLLING_DAYS',
  ADD COLUMN "scheduleReleaseDayOfWeek" INTEGER,
  ADD COLUMN "scheduleReleaseHour" INTEGER,
  ADD COLUMN "scheduleReleaseWeeksAhead" INTEGER,
  ADD COLUMN "scheduleReleaseTimezone" TEXT;
