-- Track when (and how) a Wellhub user gets associated with a Magic User.
-- Powers the migration / conversion funnel metric on the admin dashboard.

ALTER TABLE "WellhubUserLink"
    ADD COLUMN "userLinkedAt" TIMESTAMP(3),
    ADD COLUMN "linkedVia"    TEXT;

-- Back-fill: any pre-existing link with a non-null userId counts as a
-- pre-existing match. Stamp it as `manual` so we don't confuse it with
-- new matches and keep timestamps roughly accurate via firstSeenAt.
UPDATE "WellhubUserLink"
   SET "userLinkedAt" = COALESCE("firstSeenAt", NOW()),
       "linkedVia" = 'manual'
 WHERE "userId" IS NOT NULL;

CREATE INDEX "WellhubUserLink_tenantId_userLinkedAt_idx" ON "WellhubUserLink"("tenantId", "userLinkedAt");
