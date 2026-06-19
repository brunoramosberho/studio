-- Per-studio coach pay rates: a rate can optionally apply to a single studio
-- (null = any studio). The cost calculation prefers the most specific rate.
ALTER TABLE "CoachPayRate" ADD COLUMN "studioId" TEXT;

CREATE INDEX "CoachPayRate_studioId_idx" ON "CoachPayRate"("studioId");

ALTER TABLE "CoachPayRate"
  ADD CONSTRAINT "CoachPayRate_studioId_fkey"
  FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
