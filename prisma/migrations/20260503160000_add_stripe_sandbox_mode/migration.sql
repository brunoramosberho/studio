-- AlterTable
ALTER TABLE "saas_plans" ADD COLUMN "stripePriceIdSandbox" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "stripeSandboxMode" BOOLEAN NOT NULL DEFAULT false;
