-- Optional eligible-class date window on a package: credits can only be used to
-- book classes whose start time falls within [from, until]. Null = no limit.
ALTER TABLE "Package" ADD COLUMN "eligibleClassesFrom" TIMESTAMP(3);
ALTER TABLE "Package" ADD COLUMN "eligibleClassesUntil" TIMESTAMP(3);
