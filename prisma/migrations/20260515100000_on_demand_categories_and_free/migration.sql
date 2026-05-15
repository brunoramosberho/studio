-- On-demand library v2: per-tenant categories, free videos, file-uploaded thumbnails.

-- Categories.
CREATE TABLE IF NOT EXISTS "OnDemandCategory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#C9A96E',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnDemandCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OnDemandCategory_tenantId_isActive_sortOrder_idx"
  ON "OnDemandCategory"("tenantId", "isActive", "sortOrder");

ALTER TABLE "OnDemandCategory"
  ADD CONSTRAINT "OnDemandCategory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add categoryId + isFree to OnDemandVideo.
ALTER TABLE "OnDemandVideo"
  ADD COLUMN IF NOT EXISTS "categoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "isFree" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "OnDemandVideo_categoryId_idx"
  ON "OnDemandVideo"("categoryId");

ALTER TABLE "OnDemandVideo"
  ADD CONSTRAINT "OnDemandVideo_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "OnDemandCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
