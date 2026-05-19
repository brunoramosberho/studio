-- Substitution v2: manual assign + targeted request + swap + admin gating
--
-- Adds:
--   - SubstitutionMode: REQUEST, MANUAL_ASSIGN, SWAP   (legacy OPEN/DIRECT kept)
--   - SubstitutionStatus: PENDING_ADMIN                (legacy PENDING/ACCEPTED/REJECTED/CANCELLED/EXPIRED kept)
--   - SubstitutionReasonType: PERSONAL, ILLNESS, EMERGENCY, TRAVEL, OTHER
--   - SubstitutionRequest.reasonType, reasonNote
--   - SubstitutionRequest.swapWithClassId + FK + index
--   - SubstitutionRequest.adminReviewedAt, adminReviewedBy
--   - Tenant.subRequestAdminApprovalHours (default 24)

-- ── Enum extensions ──────────────────────────────────────────────────
ALTER TYPE "SubstitutionMode" ADD VALUE 'REQUEST';
ALTER TYPE "SubstitutionMode" ADD VALUE 'MANUAL_ASSIGN';
ALTER TYPE "SubstitutionMode" ADD VALUE 'SWAP';

ALTER TYPE "SubstitutionStatus" ADD VALUE 'PENDING_ADMIN';

CREATE TYPE "SubstitutionReasonType" AS ENUM ('PERSONAL', 'ILLNESS', 'EMERGENCY', 'TRAVEL', 'OTHER');

-- ── SubstitutionRequest: new columns ─────────────────────────────────
ALTER TABLE "SubstitutionRequest"
    ADD COLUMN "reasonType"      "SubstitutionReasonType",
    ADD COLUMN "reasonNote"      TEXT,
    ADD COLUMN "swapWithClassId" TEXT,
    ADD COLUMN "adminReviewedAt" TIMESTAMP(3),
    ADD COLUMN "adminReviewedBy" TEXT;

ALTER TABLE "SubstitutionRequest"
    ADD CONSTRAINT "SubstitutionRequest_swapWithClassId_fkey"
    FOREIGN KEY ("swapWithClassId") REFERENCES "Class"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "SubstitutionRequest_swapWithClassId_idx"
    ON "SubstitutionRequest"("swapWithClassId");

-- ── Tenant: admin-approval threshold ─────────────────────────────────
ALTER TABLE "Tenant"
    ADD COLUMN "subRequestAdminApprovalHours" INTEGER NOT NULL DEFAULT 24;
