import { NextRequest, NextResponse } from "next/server";
import {
  processBookingCanceled,
  verifyAndParseGymWebhook,
  type WellhubBookingLateCanceledEvent,
} from "@/lib/platforms/wellhub";

export async function POST(request: NextRequest) {
  const result = await verifyAndParseGymWebhook<WellhubBookingLateCanceledEvent>(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  try {
    const outcome = await processBookingCanceled(result.event, { late: true });
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    // Return 5xx so Wellhub redelivers — a lost cancellation locks a seat.
    // Processing is idempotent, so a retry is safe.
    console.error("[wellhub] booking-late-canceled handler failed", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
