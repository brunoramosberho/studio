// Wellhub webhook: `booking-requested`.
//
// SLA: we must PATCH /booking/v2/.../bookings/:booking_number within 15 min
// or Wellhub auto-rejects. The processor below does it inline.

import { NextRequest, NextResponse } from "next/server";
import {
  processBookingRequested,
  verifyAndParseGymWebhook,
  type WellhubBookingRequestedEvent,
} from "@/lib/platforms/wellhub";

export async function POST(request: NextRequest) {
  const result = await verifyAndParseGymWebhook<WellhubBookingRequestedEvent>(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  try {
    const decision = await processBookingRequested(result.event);
    return NextResponse.json({ received: true, decision });
  } catch (error) {
    console.error("[wellhub] booking-requested handler crashed", error);
    // Still 200 so Wellhub doesn't retry the same body. The booking row stays
    // in `pending_confirmation` and the SLA sweep cron will reissue the PATCH.
    return NextResponse.json({ received: true, error: "deferred" });
  }
}
