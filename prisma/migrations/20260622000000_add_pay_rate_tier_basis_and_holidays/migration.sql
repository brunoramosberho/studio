-- Coach pay rate: tier basis (occupancy % vs absolute headcount) and an
-- automatic holiday surcharge flag.
ALTER TABLE "CoachPayRate" ADD COLUMN "tierBasis" TEXT NOT NULL DEFAULT 'occupancy';
ALTER TABLE "CoachPayRate" ADD COLUMN "bonusOnHolidays" BOOLEAN NOT NULL DEFAULT false;

-- Per-tenant custom / regional festivos. National holidays are computed in code
-- (lib/holidays/calendar.ts) from the tenant's country.
CREATE TABLE "TenantHoliday" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TenantHoliday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantHoliday_tenantId_date_key" ON "TenantHoliday"("tenantId", "date");
CREATE INDEX "TenantHoliday_tenantId_idx" ON "TenantHoliday"("tenantId");

ALTER TABLE "TenantHoliday"
  ADD CONSTRAINT "TenantHoliday_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
