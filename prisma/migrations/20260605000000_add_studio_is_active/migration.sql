-- Soft-deactivate flag for studios. Studios accumulate classes that block hard
-- deletion, so deactivation is the supported way to retire a location.
ALTER TABLE "Studio" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
