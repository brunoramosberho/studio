-- Adds a soft-delete marker on Package. We hard-delete when nothing
-- references the package, otherwise stamp deletedAt + flip isActive so the
-- catalog hides it everywhere while preserving historical UserPackage /
-- MemberSubscription rows.

ALTER TABLE "Package"
    ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Package_tenantId_deletedAt_idx" ON "Package"("tenantId", "deletedAt");
