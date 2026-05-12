-- Capture Wellhub user profile fields delivered via webhooks. These are
-- best-effort: Wellhub does not guarantee every field on every event.

ALTER TABLE "WellhubUserLink"
    ADD COLUMN "fullName" TEXT,
    ADD COLUMN "firstName" TEXT,
    ADD COLUMN "lastName" TEXT,
    ADD COLUMN "email" TEXT,
    ADD COLUMN "phone" TEXT;

CREATE INDEX "WellhubUserLink_tenantId_email_idx" ON "WellhubUserLink"("tenantId", "email");
