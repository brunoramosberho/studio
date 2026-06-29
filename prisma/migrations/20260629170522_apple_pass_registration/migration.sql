-- Devices registered to receive Apple Wallet pass updates (PassKit web service).
CREATE TABLE IF NOT EXISTS "ApplePassRegistration" (
    "id" TEXT NOT NULL,
    "deviceLibraryIdentifier" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "passTypeIdentifier" TEXT NOT NULL,
    "pushToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApplePassRegistration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ApplePassRegistration_deviceLibraryIdentifier_serialNumber_key" ON "ApplePassRegistration"("deviceLibraryIdentifier", "serialNumber");
CREATE INDEX IF NOT EXISTS "ApplePassRegistration_serialNumber_idx" ON "ApplePassRegistration"("serialNumber");
CREATE INDEX IF NOT EXISTS "ApplePassRegistration_userId_tenantId_idx" ON "ApplePassRegistration"("userId", "tenantId");
