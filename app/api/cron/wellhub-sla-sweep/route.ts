// Safety net for the 15-minute Wellhub PATCH SLA. Runs every 5 min and
// retries any PlatformBooking that is still `pending_confirmation` and
// whose confirmation deadline is < 3 minutes away. Best effort — Wellhub
// auto-rejects on its own past the deadline, but issuing the PATCH gives us
// a deterministic local state and surfaces failures earlier.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  WellhubApiError,
  patchWellhubBooking,
  resolveTenantByWellhubGymId,
} from "@/lib/platforms/wellhub";

const SAFETY_WINDOW_MS = 3 * 60 * 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() + SAFETY_WINDOW_MS);

  const stale = await prisma.platformBooking.findMany({
    where: {
      platform: "wellhub",
      status: "pending_confirmation",
      confirmationDeadline: { lte: cutoff },
      wellhubBookingNumber: { not: null },
    },
    take: 200,
    select: {
      id: true,
      classId: true,
      wellhubBookingNumber: true,
      tenantId: true,
    },
  });

  let confirmed = 0;
  let rejected = 0;
  let errors = 0;

  for (const booking of stale) {
    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId: booking.tenantId, platform: "wellhub" },
      select: { wellhubGymId: true },
    });
    if (!config?.wellhubGymId || !booking.wellhubBookingNumber) {
      errors++;
      continue;
    }

    const quota = await prisma.schedulePlatformQuota.findUnique({
      where: { classId_platform: { classId: booking.classId, platform: "wellhub" } },
      select: { quotaSpots: true, bookedSpots: true, isClosedManually: true },
    });

    const shouldReserve =
      !!quota &&
      !quota.isClosedManually &&
      quota.bookedSpots <= quota.quotaSpots; // already incremented by inbound

    try {
      await patchWellhubBooking(config.wellhubGymId, booking.wellhubBookingNumber, {
        status: shouldReserve ? "RESERVED" : "REJECTED",
        reason_category: shouldReserve ? undefined : "CLASS_IS_FULL",
      });
      await prisma.platformBooking.update({
        where: { id: booking.id },
        data: {
          status: shouldReserve ? "confirmed" : "rejected",
          parsedAt: new Date(),
        },
      });
      if (shouldReserve) confirmed++;
      else rejected++;
    } catch (error) {
      errors++;
      if (error instanceof WellhubApiError) {
        console.error("[wellhub-sla-sweep] PATCH failed", {
          id: booking.id,
          status: error.status,
          body: error.body,
        });
      } else {
        console.error("[wellhub-sla-sweep] PATCH crashed", { id: booking.id, error });
      }
    }
  }

  // Touch this so we know the cron ran even when there is no work.
  void resolveTenantByWellhubGymId;

  return NextResponse.json({
    ok: true,
    scanned: stale.length,
    confirmed,
    rejected,
    errors,
  });
}
