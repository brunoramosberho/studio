// Keeps Wellhub's published schedule aligned with the client-visible window.
//
// Runs hourly. For each api-mode tenant with a default Wellhub quota:
//   1. SYNC IN — classes that are now inside the client-visible window, mapped
//      to a Wellhub product, and not yet synced get the default quota applied
//      and pushed to Wellhub. (syncClassToWellhub enforces the visibility gate
//      + auto-quota itself; we just feed it the right candidates.)
//   2. SYNC OUT — classes we previously synced (wellhubSlotId set) that have
//      since fallen outside the window (e.g. moved later) get unsynced so
//      Wellhub can't sell an unreleased class.
//
// This is what lets a studio apply quotas "to everything" without exposing
// the whole future schedule: classes surface in Wellhub only as members can
// see them, one release window at a time.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncClassToWellhub, unsyncClassFromWellhub } from "@/lib/platforms/wellhub";
import { computeVisibleUntil, resolveScheduleTimezone } from "@/lib/schedule/visibility";

const MAX_CLASSES_PER_TENANT = 1000;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  const configs = await prisma.studioPlatformConfig.findMany({
    where: {
      platform: "wellhub",
      wellhubMode: "api",
      wellhubGymId: { not: null },
      wellhubDefaultQuota: { gt: 0 },
    },
    select: { tenantId: true },
  });

  let syncedIn = 0;
  let syncedOut = 0;
  let errors = 0;

  for (const cfg of configs) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: cfg.tenantId },
      select: {
        id: true,
        scheduleVisibilityMode: true,
        visibleScheduleDays: true,
        scheduleReleaseDayOfWeek: true,
        scheduleReleaseHour: true,
        scheduleReleaseWeeksAhead: true,
        scheduleReleaseTimezone: true,
      },
    });
    if (!tenant) continue;

    const timezone = await resolveScheduleTimezone(tenant);
    const visibleUntil = computeVisibleUntil(now, tenant, timezone);

    // 1) SYNC IN — in-window, mapped, not yet synced, and NOT closed-to-Wellhub.
    // A class with an explicit closed override (isClosedManually) is skipped so
    // the default never re-opens it.
    const toSync = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        status: "SCHEDULED",
        startsAt: { gte: now, lte: visibleUntil },
        wellhubSlotId: null,
        classType: { wellhubProductId: { not: null } },
        NOT: { platformQuotas: { some: { platform: "wellhub", isClosedManually: true } } },
      },
      take: MAX_CLASSES_PER_TENANT,
      select: { id: true },
    });
    for (const c of toSync) {
      try {
        const r = await syncClassToWellhub(c.id);
        if (r.status === "synced") syncedIn++;
      } catch (err) {
        errors++;
        console.error("[wellhub-window-sync] sync-in failed", { classId: c.id, err });
      }
    }

    // 2) SYNC OUT — already synced but now outside the window (moved later or
    // window shrank). Past classes are left alone (they naturally age out).
    const toUnsync = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        status: "SCHEDULED",
        wellhubSlotId: { not: null },
        startsAt: { gt: visibleUntil },
      },
      take: MAX_CLASSES_PER_TENANT,
      select: { id: true },
    });
    for (const c of toUnsync) {
      try {
        const r = await unsyncClassFromWellhub(c.id);
        if (r.status === "excluded") syncedOut++;
      } catch (err) {
        errors++;
        console.error("[wellhub-window-sync] sync-out failed", { classId: c.id, err });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    tenants: configs.length,
    syncedIn,
    syncedOut,
    errors,
  });
}
