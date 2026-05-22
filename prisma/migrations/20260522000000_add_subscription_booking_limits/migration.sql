-- Subscription booking-rate limits on Package
--
-- maxBookingsPerDay              caps slots-per-calendar-day (studio TZ) on this Package.
-- maxConcurrentUpcomingBookings  caps open future CONFIRMED bookings on this Package.
-- Both nullable: NULL = unlimited (existing behaviour).

ALTER TABLE "Package" ADD COLUMN "maxBookingsPerDay" INTEGER;
ALTER TABLE "Package" ADD COLUMN "maxConcurrentUpcomingBookings" INTEGER;
