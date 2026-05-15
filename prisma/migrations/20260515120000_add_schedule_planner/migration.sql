-- Spark schedule planner: multi-turn conversations between admin and Spark
-- to draft a class schedule. `contextJson` holds the running structured
-- constraints (studios, excluded windows, discipline mix, etc.).
-- `proposalJson` holds the latest proposal pending admin review.
-- `appliedClassIds` snapshots the class ids actually created on apply.

CREATE TYPE "SchedulePlanStatus" AS ENUM ('GATHERING', 'PROPOSED', 'APPLIED', 'ARCHIVED');

CREATE TABLE "SchedulePlanConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Planeación de horario',
    "status" "SchedulePlanStatus" NOT NULL DEFAULT 'GATHERING',
    "contextJson" JSONB,
    "proposalJson" JSONB,
    "appliedClassIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchedulePlanConversation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchedulePlanConversation_tenantId_adminUserId_updatedAt_idx" ON "SchedulePlanConversation"("tenantId", "adminUserId", "updatedAt");
CREATE INDEX "SchedulePlanConversation_tenantId_status_idx" ON "SchedulePlanConversation"("tenantId", "status");

CREATE TABLE "SchedulePlanMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolsUsed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulePlanMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchedulePlanMessage_conversationId_createdAt_idx" ON "SchedulePlanMessage"("conversationId", "createdAt");

ALTER TABLE "SchedulePlanConversation" ADD CONSTRAINT "SchedulePlanConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePlanMessage" ADD CONSTRAINT "SchedulePlanMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "SchedulePlanConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
