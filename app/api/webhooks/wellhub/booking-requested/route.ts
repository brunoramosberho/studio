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
    // Return 5xx so Wellhub redelivers. Processing is idempotent (re-PATCHes
    // the existing decision without double-counting), and the SLA sweep cron
    // is a second backstop before the 15-min auto-reject.
    console.error("[wellhub] booking-requested handler failed", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
