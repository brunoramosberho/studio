import { NextRequest, NextResponse } from "next/server";
import {
  processBookingCanceled,
  verifyAndParseGymWebhook,
  type WellhubBookingCanceledEvent,
} from "@/lib/platforms/wellhub";

export async function POST(request: NextRequest) {
  const result = await verifyAndParseGymWebhook<WellhubBookingCanceledEvent>(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  try {
    const outcome = await processBookingCanceled(result.event, { late: false });
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    // Return 5xx so Wellhub redelivers — losing a cancellation locks a seat
    // and is the #1 money leak. Processing is idempotent, so a retry is safe.
    console.error("[wellhub] booking-canceled handler failed", error);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
