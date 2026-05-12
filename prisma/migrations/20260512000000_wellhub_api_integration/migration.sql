-- Wellhub API integration: rename PlatformType enum value, extend platforms
-- models with Wellhub Booking/Access Control fields, add WellhubProduct and
-- WellhubUserLink. ClassPass branch is untouched.

-- ── Enums ────────────────────────────────────────────────────────────────

-- Rename existing enum value in-place (Postgres-native, no data churn).
ALTER TYPE "PlatformType" RENAME VALUE 'gympass' TO 'wellhub';

-- Extend PlatformBookingStatus with the two new states needed for the
-- 15-minute booking confirmation SLA.
ALTER TYPE "PlatformBookingStatus" ADD VALUE IF NOT EXISTS 'pending_confirmation';
ALTER TYPE "PlatformBookingStatus" ADD VALUE IF NOT EXISTS 'rejected';

CREATE TYPE "WellhubMode" AS ENUM ('disabled', 'legacy_email', 'api');
CREATE TYPE "WellhubSyncStatus" AS ENUM ('synced', 'pending', 'error', 'excluded');
CREATE TYPE "WellhubImplementationMethod" AS ENUM ('attendance_trigger', 'gate_trigger');

-- ── StudioPlatformConfig ────────────────────────────────────────────────

ALTER TABLE "StudioPlatformConfig"
    ADD COLUMN "wellhubGymId" INTEGER,
    ADD COLUMN "wellhubMode" "WellhubMode" NOT NULL DEFAULT 'disabled',
    ADD COLUMN "wellhubImplMethod" "WellhubImplementationMethod" NOT NULL DEFAULT 'attendance_trigger',
    ADD COLUMN "wellhubLocale" TEXT,
    ADD COLUMN "wellhubWebhooksRegistered" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "wellhubWebhookSecret" TEXT,
    ADD COLUMN "wellhubLastSyncAt" TIMESTAMP(3),
    ADD COLUMN "wellhubLastError" TEXT;

CREATE UNIQUE INDEX "StudioPlatformConfig_wellhubGymId_key" ON "StudioPlatformConfig"("wellhubGymId");

-- ── PlatformBooking ─────────────────────────────────────────────────────

ALTER TABLE "PlatformBooking"
    ADD COLUMN "source" TEXT NOT NULL DEFAULT 'email',
    ADD COLUMN "wellhubBookingNumber" TEXT,
    ADD COLUMN "wellhubSlotId" INTEGER,
    ADD COLUMN "wellhubUserUniqueToken" TEXT,
    ADD COLUMN "wellhubProductId" INTEGER,
    ADD COLUMN "confirmationDeadline" TIMESTAMP(3),
    ADD COLUMN "rejectionReason" TEXT;

CREATE UNIQUE INDEX "PlatformBooking_wellhubBookingNumber_key" ON "PlatformBooking"("wellhubBookingNumber");
CREATE INDEX "PlatformBooking_wellhubUserUniqueToken_idx" ON "PlatformBooking"("wellhubUserUniqueToken");
CREATE INDEX "PlatformBooking_status_confirmationDeadline_idx" ON "PlatformBooking"("status", "confirmationDeadline");

-- ── ClassType ───────────────────────────────────────────────────────────

ALTER TABLE "ClassType"
    ADD COLUMN "wellhubClassId" INTEGER,
    ADD COLUMN "wellhubProductId" INTEGER,
    ADD COLUMN "wellhubCategoryIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

CREATE UNIQUE INDEX "ClassType_tenantId_wellhubClassId_key" ON "ClassType"("tenantId", "wellhubClassId");

-- ── Class ───────────────────────────────────────────────────────────────

ALTER TABLE "Class"
    ADD COLUMN "wellhubSlotId" INTEGER,
    ADD COLUMN "wellhubSyncStatus" "WellhubSyncStatus" NOT NULL DEFAULT 'excluded',
    ADD COLUMN "wellhubLastSyncAt" TIMESTAMP(3),
    ADD COLUMN "wellhubLastError" TEXT;

CREATE UNIQUE INDEX "Class_wellhubSlotId_key" ON "Class"("wellhubSlotId");
CREATE INDEX "Class_wellhubSyncStatus_idx" ON "Class"("wellhubSyncStatus");

-- ── WellhubProduct ──────────────────────────────────────────────────────

CREATE TABLE "WellhubProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gymId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "virtual" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellhubProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellhubProduct_tenantId_productId_key" ON "WellhubProduct"("tenantId", "productId");
CREATE INDEX "WellhubProduct_tenantId_idx" ON "WellhubProduct"("tenantId");

ALTER TABLE "WellhubProduct"
    ADD CONSTRAINT "WellhubProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── WellhubUserLink ─────────────────────────────────────────────────────

CREATE TABLE "WellhubUserLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "wellhubUniqueToken" TEXT NOT NULL,
    "customCode" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastValidatedAt" TIMESTAMP(3),

    CONSTRAINT "WellhubUserLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WellhubUserLink_tenantId_wellhubUniqueToken_key" ON "WellhubUserLink"("tenantId", "wellhubUniqueToken");
CREATE INDEX "WellhubUserLink_tenantId_customCode_idx" ON "WellhubUserLink"("tenantId", "customCode");
CREATE INDEX "WellhubUserLink_userId_idx" ON "WellhubUserLink"("userId");

ALTER TABLE "WellhubUserLink"
    ADD CONSTRAINT "WellhubUserLink_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "WellhubUserLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
