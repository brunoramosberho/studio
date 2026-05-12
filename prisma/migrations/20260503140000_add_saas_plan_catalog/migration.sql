-- CreateTable
CREATE TABLE "saas_plans" (
    "id" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT '__',
    "stripePriceId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "amountCents" INTEGER,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saas_plans_planKey_countryCode_key" ON "saas_plans"("planKey", "countryCode");

-- CreateIndex
CREATE INDEX "saas_plans_planKey_isActive_idx" ON "saas_plans"("planKey", "isActive");

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "saasStripePriceIdOverride" TEXT;
