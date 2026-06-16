-- Per-admin opt-in to receive an email on every new client booking. Off by
-- default so enabling it for one staff member never emails the rest.
ALTER TABLE "Membership" ADD COLUMN "notifyEmailOnBooking" BOOLEAN NOT NULL DEFAULT false;
