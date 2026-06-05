-- Soft-delete markers for ClassType (disciplines) and Studio. We hard-delete
-- when nothing references the row, otherwise flip isActive=false so it hides
-- from every public surface (schedule filters, booking) while preserving
-- historical Class / Booking / revenue rows.

ALTER TABLE "ClassType"
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Studio"
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "ClassType_tenantId_isActive_idx" ON "ClassType"("tenantId", "isActive");
CREATE INDEX "Studio_tenantId_isActive_idx" ON "Studio"("tenantId", "isActive");
