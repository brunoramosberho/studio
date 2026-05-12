// Wellhub webhook: `checkin` (Access Control). The handler is the Automated
// Trigger: receiving this event obliges us to synchronously call
// POST /access/v1/validate, which is what generates payment to the studio.

import { NextRequest, NextResponse } from "next/server";
import {
  processCheckinWebhook,
  verifyAndParseGymWebhook,
  type WellhubCheckinEvent,
} from "@/lib/platforms/wellhub";

export async function POST(request: NextRequest) {
  const result = await verifyAndParseGymWebhook<WellhubCheckinEvent>(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  try {
    const outcome = await processCheckinWebhook(result.event);
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    console.error("[wellhub] checkin handler crashed", error);
    return NextResponse.json({ received: true, error: "deferred" });
  }
}
