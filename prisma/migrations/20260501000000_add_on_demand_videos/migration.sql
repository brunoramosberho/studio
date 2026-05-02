-- Add ON_DEMAND_SUBSCRIPTION to PackageType enum.
ALTER TYPE "PackageType" ADD VALUE IF NOT EXISTS 'ON_DEMAND_SUBSCRIPTION';

-- Add on_demand to EntitlementType enum.
ALTER TYPE "EntitlementType" ADD VALUE IF NOT EXISTS 'on_demand';

-- Add includesOnDemand flag on Package (lets existing unlimited subs grant
-- on-demand access without a separate Stripe charge).
ALTER TABLE "Package"
  ADD COLUMN IF NOT EXISTS "includesOnDemand" BOOLEAN NOT NULL DEFAULT false;

-- New enums for on-demand library.
DO $$ BEGIN
  CREATE TYPE "OnDemandVideoStatus" AS ENUM ('processing', 'ready', 'errored');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "OnDemandSessionEndReason" AS ENUM ('user_ended', 'heartbeat_timeout', 'superseded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Video catalogue (one row per uploaded asset on Cloudflare Stream).
CREATE TABLE IF NOT EXISTS "OnDemandVideo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "cloudflareStreamUid" TEXT NOT NULL,
  "status" "OnDemandVideoStatus" NOT NULL DEFAULT 'processing',
  "published" BOOLEAN NOT NULL DEFAULT false,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "coachProfileId" TEXT,
  "classTypeId" TEXT,
  "level" "Level" NOT NULL DEFAULT 'ALL',
  "durationSeconds" INTEGER,
  "widthPx" INTEGER,
  "heightPx" INTEGER,
  "thumbnailUrl" TEXT,
  "cloudflareThumbnailUrl" TEXT,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnDemandVideo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnDemandVideo_cloudflareStreamUid_key"
  ON "OnDemandVideo"("cloudflareStreamUid");
CREATE INDEX IF NOT EXISTS "OnDemandVideo_tenantId_published_idx"
  ON "OnDemandVideo"("tenantId", "published");
CREATE INDEX IF NOT EXISTS "OnDemandVideo_tenantId_status_idx"
  ON "OnDemandVideo"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "OnDemandVideo_coachProfileId_idx"
  ON "OnDemandVideo"("coachProfileId");
CREATE INDEX IF NOT EXISTS "OnDemandVideo_classTypeId_idx"
  ON "OnDemandVideo"("classTypeId");

ALTER TABLE "OnDemandVideo"
  ADD CONSTRAINT "OnDemandVideo_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnDemandVideo"
  ADD CONSTRAINT "OnDemandVideo_coachProfileId_fkey"
  FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnDemandVideo"
  ADD CONSTRAINT "OnDemandVideo_classTypeId_fkey"
  FOREIGN KEY ("classTypeId") REFERENCES "ClassType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Singleton-per-tenant config for the on-demand product (price, copy, link to
-- the Stripe Package SKU).
CREATE TABLE IF NOT EXISTS "OnDemandConfig" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "packageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnDemandConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OnDemandConfig_tenantId_key"
  ON "OnDemandConfig"("tenantId");

ALTER TABLE "OnDemandConfig"
  ADD CONSTRAINT "OnDemandConfig_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnDemandConfig"
  ADD CONSTRAINT "OnDemandConfig_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Active playback sessions for concurrency enforcement (1 stream per user).
CREATE TABLE IF NOT EXISTS "OnDemandStreamSession" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "videoId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "endedReason" "OnDemandSessionEndReason",
  "clientIp" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "OnDemandStreamSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OnDemandStreamSession_tenantId_userId_endedAt_idx"
  ON "OnDemandStreamSession"("tenantId", "userId", "endedAt");
CREATE INDEX IF NOT EXISTS "OnDemandStreamSession_videoId_idx"
  ON "OnDemandStreamSession"("videoId");
CREATE INDEX IF NOT EXISTS "OnDemandStreamSession_lastHeartbeatAt_idx"
  ON "OnDemandStreamSession"("lastHeartbeatAt");

ALTER TABLE "OnDemandStreamSession"
  ADD CONSTRAINT "OnDemandStreamSession_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnDemandStreamSession"
  ADD CONSTRAINT "OnDemandStreamSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnDemandStreamSession"
  ADD CONSTRAINT "OnDemandStreamSession_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "OnDemandVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
