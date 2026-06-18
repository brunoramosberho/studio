-- Per-tenant Shopify Storefront connection. Read-only catalog mirroring for
-- the public shop / PWA; no checkout or write-back. Token stored encrypted.

CREATE TABLE "ShopifyConfig" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "storefrontAccessToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShopifyConfig_tenantId_key" ON "ShopifyConfig"("tenantId");

CREATE INDEX "ShopifyConfig_tenantId_idx" ON "ShopifyConfig"("tenantId");

ALTER TABLE "ShopifyConfig"
    ADD CONSTRAINT "ShopifyConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
