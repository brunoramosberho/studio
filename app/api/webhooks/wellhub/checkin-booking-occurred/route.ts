import { NextRequest, NextResponse } from "next/server";
import {
  processCheckinBookingOccurred,
  verifyAndParseGymWebhook,
  type WellhubCheckinBookingOccurredEvent,
} from "@/lib/platforms/wellhub";

export async function POST(request: NextRequest) {
  const result = await verifyAndParseGymWebhook<WellhubCheckinBookingOccurredEvent>(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  try {
    const outcome = await processCheckinBookingOccurred(result.event);
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    // Return 5xx so Wellhub redelivers. Idempotent: re-marking checked_in is safe.
    console.error("[wellhub] checkin-booking-occurred handler failed", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
