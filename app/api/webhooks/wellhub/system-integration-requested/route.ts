// Wellhub webhook: `SYSTEM_INTEGRATION_REQUESTED` (CMS-level).
//
// Wellhub fires this when a new gym selects Magic as their CMS. The payload
// gives us a `gym_id` we haven't seen yet. We park it as an unassigned config
// row so a super-admin can match it to an existing tenant from the dashboard.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyAndParseSystemNotificationWebhook } from "@/lib/platforms/wellhub";

export async function POST(request: NextRequest) {
  const result = await verifyAndParseSystemNotificationWebhook(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }

  const { event_data: data } = result.event;

  // If a tenant has already claimed this gym_id, surface the existing claim
  // so Wellhub treats this as idempotent re-delivery.
  const existing = await prisma.studioPlatformConfig.findUnique({
    where: { wellhubGymId: data.gym_id },
    select: { id: true, tenantId: true },
  });
  if (existing) {
    return NextResponse.json({
      received: true,
      status: "already_claimed",
      tenantId: existing.tenantId,
    });
  }

  // No matching tenant yet. We log the announcement; the super-admin discovers
  // unclaimed gyms by calling `GET /v1/systems/gyms` (Setup API) and assigns
  // them from `/super-admin/integrations/wellhub`. Wellhub does not require a
  // particular response shape for this webhook beyond a 2XX status.
  console.info("[wellhub] system-integration-requested for new gym", {
    gym_id: data.gym_id,
    gym_name: data.gym_name,
    partner_id: data.partner_id,
  });
  return NextResponse.json({ received: true, status: "pending_review" });
}
