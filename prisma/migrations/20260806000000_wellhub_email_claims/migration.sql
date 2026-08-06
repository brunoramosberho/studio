-- Self-serve Wellhub linking from the member profile ("Connected apps").
-- A member verifies, via a one-time code emailed to the address, that they own
-- the email their employer registered on Wellhub (often a corporate address
-- that differs from their Magic login). The claim then powers matching:
-- existing WellhubUserLink rows bind immediately and future webhook traffic
-- auto-links. Guarded with IF NOT EXISTS so re-running (or db push racing this
-- file) is a no-op.

CREATE TABLE IF NOT EXISTS "WellhubEmailClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellhubEmailClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WellhubEmailClaim_email_key" ON "WellhubEmailClaim"("email");
CREATE INDEX IF NOT EXISTS "WellhubEmailClaim_userId_idx" ON "WellhubEmailClaim"("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'WellhubEmailClaim_userId_fkey'
    ) THEN
        ALTER TABLE "WellhubEmailClaim"
            ADD CONSTRAINT "WellhubEmailClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- One-time codes for the claim flow. Ephemeral throttling/audit state — no FK
-- relations on purpose (mirrors PendingLogin).
CREATE TABLE IF NOT EXISTS "WellhubLinkCode" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WellhubLinkCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WellhubLinkCode_userId_tenantId_createdAt_idx" ON "WellhubLinkCode"("userId", "tenantId", "createdAt");
