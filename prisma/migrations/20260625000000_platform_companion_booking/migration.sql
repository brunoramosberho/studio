-- Companion Booking for platform reservations.
--
-- A Wellhub/ClassPass reservation lives in PlatformBooking, a table separate
-- from Booking. The spot map, attendance list, and capacity counters only read
-- Booking, so a platform member floated outside the seat model (oversell risk).
--
-- This adds an optional 1:1 link so each platform reservation can own a
-- seat-holding "companion" Booking (guest-style: no charge, no credit, no
-- revenue). Deleting the PlatformBooking cascades to free the seat.

ALTER TABLE "Booking"
    ADD COLUMN "platformBookingId" TEXT;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_platformBookingId_fkey"
    FOREIGN KEY ("platformBookingId") REFERENCES "PlatformBooking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Booking_platformBookingId_key"
    ON "Booking"("platformBookingId");
