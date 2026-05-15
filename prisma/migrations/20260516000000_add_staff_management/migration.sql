-- Staff Management: clock-in/out with geofence, payroll rates, commissions.
--
-- Adds:
--   - StaffShift            (clock-in/out records, geofenced to a Studio)
--   - StaffPayRate          (hourly / monthly-fixed compensation per user/studio)
--   - StaffCommissionRule   (commission percentages per source type)
--   - StaffCommissionEarning (immutable accrual records, idempotent per sale+rule)
--
-- Modifies:
--   - Tenant: staffMaxShiftHours
--   - Studio: geofenceRadiusMeters
--   - StripePayment: soldByUserId (manual sale attribution for online sales)
--   - PosTransaction: index on (tenantId, processedById) for commission queries

-- ── Tenant config ──────────────────────────────────────────────────────
ALTER TABLE "Tenant"
    ADD COLUMN "staffMaxShiftHours" INTEGER NOT NULL DEFAULT 12;

-- ── Studio: geofence radius ────────────────────────────────────────────
ALTER TABLE "Studio"
    ADD COLUMN "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 150;

-- ── StripePayment: sale attribution ────────────────────────────────────
ALTER TABLE "StripePayment"
    ADD COLUMN "soldByUserId" TEXT;
CREATE INDEX "StripePayment_tenantId_soldByUserId_idx"
    ON "StripePayment"("tenantId", "soldByUserId");
ALTER TABLE "StripePayment"
    ADD CONSTRAINT "StripePayment_soldByUserId_fkey"
    FOREIGN KEY ("soldByUserId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PosTransaction: index for commission queries ───────────────────────
CREATE INDEX "PosTransaction_tenantId_processedById_idx"
    ON "PosTransaction"("tenantId", "processedById");

-- ── Enums ──────────────────────────────────────────────────────────────
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED', 'AUTO_CLOSED', 'EDITED', 'VOIDED');
CREATE TYPE "CommissionSource" AS ENUM ('POS_ANY', 'PACKAGE', 'PRODUCT', 'SUBSCRIPTION', 'PENALTY');
CREATE TYPE "CommissionStatus" AS ENUM ('EARNED', 'PAID', 'VOIDED');

-- ── StaffShift ─────────────────────────────────────────────────────────
CREATE TABLE "StaffShift" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "membershipId" TEXT,
    "studioId" TEXT NOT NULL,
    "clockInAt" TIMESTAMP(3) NOT NULL,
    "clockInLat" DOUBLE PRECISION NOT NULL,
    "clockInLng" DOUBLE PRECISION NOT NULL,
    "clockInAccuracy" DOUBLE PRECISION,
    "clockInDistance" DOUBLE PRECISION,
    "clockOutAt" TIMESTAMP(3),
    "clockOutLat" DOUBLE PRECISION,
    "clockOutLng" DOUBLE PRECISION,
    "clockOutAccuracy" DOUBLE PRECISION,
    "clockOutDistance" DOUBLE PRECISION,
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "editedById" TEXT,
    "editReason" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffShift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffShift_tenantId_userId_clockInAt_idx"
    ON "StaffShift"("tenantId", "userId", "clockInAt");
CREATE INDEX "StaffShift_tenantId_studioId_clockInAt_idx"
    ON "StaffShift"("tenantId", "studioId", "clockInAt");
CREATE INDEX "StaffShift_tenantId_status_idx"
    ON "StaffShift"("tenantId", "status");
CREATE INDEX "StaffShift_userId_status_idx"
    ON "StaffShift"("userId", "status");

ALTER TABLE "StaffShift"
    ADD CONSTRAINT "StaffShift_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffShift"
    ADD CONSTRAINT "StaffShift_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffShift"
    ADD CONSTRAINT "StaffShift_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "Membership"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffShift"
    ADD CONSTRAINT "StaffShift_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StaffShift"
    ADD CONSTRAINT "StaffShift_editedById_fkey"
    FOREIGN KEY ("editedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── StaffPayRate ───────────────────────────────────────────────────────
CREATE TABLE "StaffPayRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studioId" TEXT,
    "hourlyRateCents" INTEGER,
    "monthlyFixedCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPayRate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffPayRate_tenantId_userId_isActive_idx"
    ON "StaffPayRate"("tenantId", "userId", "isActive");
CREATE INDEX "StaffPayRate_tenantId_studioId_idx"
    ON "StaffPayRate"("tenantId", "studioId");

ALTER TABLE "StaffPayRate"
    ADD CONSTRAINT "StaffPayRate_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffPayRate"
    ADD CONSTRAINT "StaffPayRate_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffPayRate"
    ADD CONSTRAINT "StaffPayRate_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── StaffCommissionRule ────────────────────────────────────────────────
CREATE TABLE "StaffCommissionRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studioId" TEXT,
    "sourceType" "CommissionSource" NOT NULL,
    "packageId" TEXT,
    "productId" TEXT,
    "percentBps" INTEGER,
    "flatAmountCents" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCommissionRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StaffCommissionRule_tenantId_userId_isActive_idx"
    ON "StaffCommissionRule"("tenantId", "userId", "isActive");
CREATE INDEX "StaffCommissionRule_tenantId_sourceType_idx"
    ON "StaffCommissionRule"("tenantId", "sourceType");
CREATE INDEX "StaffCommissionRule_tenantId_studioId_idx"
    ON "StaffCommissionRule"("tenantId", "studioId");

ALTER TABLE "StaffCommissionRule"
    ADD CONSTRAINT "StaffCommissionRule_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionRule"
    ADD CONSTRAINT "StaffCommissionRule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionRule"
    ADD CONSTRAINT "StaffCommissionRule_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionRule"
    ADD CONSTRAINT "StaffCommissionRule_packageId_fkey"
    FOREIGN KEY ("packageId") REFERENCES "Package"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionRule"
    ADD CONSTRAINT "StaffCommissionRule_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── StaffCommissionEarning ─────────────────────────────────────────────
CREATE TABLE "StaffCommissionEarning" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studioId" TEXT,
    "ruleId" TEXT,
    "sourceType" "CommissionSource" NOT NULL,
    "posTransactionId" TEXT,
    "stripePaymentId" TEXT,
    "baseAmountCents" INTEGER NOT NULL,
    "percentBps" INTEGER,
    "commissionAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'EARNED',
    "voidReason" TEXT,
    "paidInPeriod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCommissionEarning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StaffCommissionEarning_posTransactionId_ruleId_key"
    ON "StaffCommissionEarning"("posTransactionId", "ruleId");
CREATE UNIQUE INDEX "StaffCommissionEarning_stripePaymentId_ruleId_key"
    ON "StaffCommissionEarning"("stripePaymentId", "ruleId");
CREATE INDEX "StaffCommissionEarning_tenantId_userId_occurredAt_idx"
    ON "StaffCommissionEarning"("tenantId", "userId", "occurredAt");
CREATE INDEX "StaffCommissionEarning_tenantId_studioId_occurredAt_idx"
    ON "StaffCommissionEarning"("tenantId", "studioId", "occurredAt");
CREATE INDEX "StaffCommissionEarning_tenantId_status_idx"
    ON "StaffCommissionEarning"("tenantId", "status");

ALTER TABLE "StaffCommissionEarning"
    ADD CONSTRAINT "StaffCommissionEarning_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionEarning"
    ADD CONSTRAINT "StaffCommissionEarning_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionEarning"
    ADD CONSTRAINT "StaffCommissionEarning_studioId_fkey"
    FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionEarning"
    ADD CONSTRAINT "StaffCommissionEarning_ruleId_fkey"
    FOREIGN KEY ("ruleId") REFERENCES "StaffCommissionRule"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionEarning"
    ADD CONSTRAINT "StaffCommissionEarning_posTransactionId_fkey"
    FOREIGN KEY ("posTransactionId") REFERENCES "PosTransaction"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StaffCommissionEarning"
    ADD CONSTRAINT "StaffCommissionEarning_stripePaymentId_fkey"
    FOREIGN KEY ("stripePaymentId") REFERENCES "StripePayment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
