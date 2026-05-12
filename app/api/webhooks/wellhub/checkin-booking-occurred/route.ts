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
    console.error("[wellhub] checkin-booking-occurred handler crashed", error);
    return NextResponse.json({ received: true, error: "deferred" });
  }
}
