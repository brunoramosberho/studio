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
    console.error("[wellhub] booking-canceled handler crashed", error);
    return NextResponse.json({ received: true, error: "deferred" });
  }
}
