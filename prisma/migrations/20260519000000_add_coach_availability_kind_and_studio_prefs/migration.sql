-- Coach Availability: dual model (positive "availability" + negative "time_off")
--
-- Today CoachAvailabilityBlock only represented time-off (when a coach is NOT
-- available). Going forward, blocks come in two flavours:
--   - kind = 'availability'  → "I CAN teach in this window" (positive base)
--   - kind = 'time_off'      → "I CANNOT teach in this window" (overrides)
--
-- A coach is available for a (day, hour, studio) iff some availability block
-- covers it, no time_off block covers it, and the studio has a preference row
-- on that availability block (preferred or ok_if_needed).
--
-- All existing rows are time_off (the old behaviour), so kind defaults to
-- 'time_off'. Existing reasonType values are preserved; reasonType becomes
-- nullable because availability blocks don't carry a reason.

-- ── Enums ──────────────────────────────────────────────────────────────
CREATE TYPE "AvailabilityKind" AS ENUM ('availability', 'time_off');

CREATE TYPE "CoachStudioPreference" AS ENUM ('preferred', 'ok_if_needed');

-- ── CoachAvailabilityBlock: add kind, relax reasonType ─────────────────
ALTER TABLE "CoachAvailabilityBlock"
    ADD COLUMN "kind" "AvailabilityKind" NOT NULL DEFAULT 'time_off';

ALTER TABLE "CoachAvailabilityBlock"
    ALTER COLUMN "reasonType" DROP NOT NULL;

CREATE INDEX "CoachAvailabilityBlock_tenantId_kind_idx"
    ON "CoachAvailabilityBlock"("tenantId", "kind");

-- ── CoachAvailabilityStudioPreference ──────────────────────────────────
CREATE TABLE "CoachAvailabilityStudioPreference" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "preference" "CoachStudioPreference" NOT NULL DEFAULT 'preferred',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachAvailabilityStudioPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachAvailabilityStudioPreference_blockId_studioId_key"
    ON "CoachAvailabilityStudioPreference"("blockId", "studioId");

CREATE INDEX "CoachAvailabilityStudioPreference_studioId_idx"
    ON "CoachAvailabilityStudioPreference"("studioId");

CREATE INDEX "CoachAvailabilityStudioPreference_tenantId_idx"
    ON "CoachAvailabilityStudioPreference"("tenantId");

ALTER TABLE "CoachAvailabilityStudioPreference"
    ADD CONSTRAINT "CoachAvailabilityStudioPreference_blockId_fkey"
    FOREIGN KEY ("blockId") REFERENCES "CoachAvailabilityBlock"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachAvailabilityStudioPreference"
    ADD CONSTRAINT "CoachAvailabilityStudioPreference_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachAvailabilityStudioPreference"
    ADD CONSTRAINT "CoachAvailabilityStudioPreference_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
