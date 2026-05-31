// Drift healer for the Wellhub integration.
//
// Webhooks get dropped (network flakes, deploys, Wellhub-side retries that
// give up). The single worst failure is a LOST CANCELLATION: the seat stays
// locked forever, no one on the waitlist gets in, and the studio loses money.
// This cron is the safety net that the per-event handlers can't be.
//
// For every upcoming Wellhub-synced class on an api-mode tenant it:
//   1. Recomputes the platform quota's `bookedSpots` from the authoritative
//      source — the count of consuming PlatformBooking rows. If the stored
//      counter drifted ABOVE reality (the classic lost-cancellation symptom),
//      it corrects the counter and cascades the freed seat(s): promote the
//      Magic waitlist, notify spot-watchers, and re-push availability to
//      Wellhub.
//   2. Always re-pushes total_booked to Wellhub so their app can't get stuck
//      showing a full class after a missed webhook.
//
// It does NOT poll Wellhub's own booking list (that endpoint isn't exposed in
// the partner API we use), so it heals OUR counter drift and keeps Wellhub's
// view fresh — which together cover the reported failure mode.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLATFORM_CONSUMING_STATUSES } from "@/lib/booking/availability";
import { cascadeFreedSeat } from "@/lib/platforms/wellhub";

// Heal classes starting within this window. Past classes don't matter; far
// future ones get healed on their own webhook traffic + later cron passes.
const LOOKAHEAD_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_CLASSES = 500;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + LOOKAHEAD_MS);

  // Tenants running the API integration.
  const configs = await prisma.studioPlatformConfig.findMany({
    where: { platform: "wellhub", wellhubMode: "api", wellhubGymId: { not: null } },
    select: { tenantId: true },
  });
  const tenantIds = configs.map((c) => c.tenantId);
  if (tenantIds.length === 0) {
    return NextResponse.json({ ok: true, tenants: 0, scanned: 0, healed: 0 });
  }

  // Quotas for upcoming, Wellhub-synced classes on those tenants.
  const quotas = await prisma.schedulePlatformQuota.findMany({
    where: {
      platform: "wellhub",
      tenantId: { in: tenantIds },
      class: {
        startsAt: { gte: now, lte: horizon },
        status: "SCHEDULED",
        wellhubSlotId: { not: null },
      },
    },
    take: MAX_CLASSES,
    select: {
      id: true,
      classId: true,
      tenantId: true,
      bookedSpots: true,
    },
  });

  let scanned = 0;
  let healed = 0;
  let resynced = 0;
  let errors = 0;

  for (const quota of quotas) {
    scanned++;
    try {
      // Authoritative count of consuming platform bookings for this class.
      const actualBooked = await prisma.platformBooking.count({
        where: {
          classId: quota.classId,
          platform: "wellhub",
          status: { in: PLATFORM_CONSUMING_STATUSES },
        },
      });

      const drift = quota.bookedSpots - actualBooked;

      if (drift !== 0) {
        // Correct the counter to match reality.
        await prisma.schedulePlatformQuota.update({
          where: { id: quota.id },
          data: { bookedSpots: actualBooked < 0 ? 0 : actualBooked },
        });
      }

      if (drift > 0) {
        // Counter was HIGHER than reality → seat(s) were freed but the
        // cancellation cascade never ran. Heal it now.
        healed++;
        await cascadeFreedSeat(quota.classId, quota.tenantId);
      } else {
        // No freed-seat drift, but keep Wellhub's availability fresh in case a
        // Magic-side change never got pushed.
        const { patchWellhubCapacityForClass } = await import("@/lib/platforms/wellhub/sync");
        await patchWellhubCapacityForClass(quota.classId);
        resynced++;
      }
    } catch (error) {
      errors++;
      console.error("[wellhub-reconcile] class heal failed", {
        classId: quota.classId,
        error,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    tenants: tenantIds.length,
    scanned,
    healed,
    resynced,
    errors,
  });
}
