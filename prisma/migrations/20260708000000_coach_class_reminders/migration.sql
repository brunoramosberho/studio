-- Instructor class reminders: a per-tenant toggle plus per-class dedupe
-- timestamps for the day-before and hour-before reminders. All additive with
-- safe defaults — existing tenants opt in by default, existing classes start
-- with no reminder sent.
ALTER TABLE "Tenant"
  ADD COLUMN "notifyCoachClassReminder" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Class"
  ADD COLUMN "coachReminderDaySentAt" TIMESTAMP(3),
  ADD COLUMN "coachReminderHourSentAt" TIMESTAMP(3);
