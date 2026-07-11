// Manual assignment for an unmatched Wellhub check-in alert.
//
// GET  → candidate classes around the check-in time (±3h, Wellhub-enabled
//        types, not cancelled) with studio-local times, so the admin can pick.
// POST → { classId }: create the walk-in (same path the automatic matcher
//        uses) and resolve the alert.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";
import { formatDateTimeInZone } from "@/lib/utils";

interface UnmatchedCheckinMetadata {
  kind: "unmatched_checkin";
  wellhubUniqueToken: string;
  memberName: string | null;
  checkinAt: string;
  productId: number | null;
}

async function loadAlert(id: string, tenantId: string) {
  const alert = await prisma.platformAlert.findFirst({
    where: { id, tenantId, type: "unmatched_checkin" },
  });
  if (!alert) return null;
  const meta = alert.metadata as UnmatchedCheckinMetadata | null;
  if (!meta?.wellhubUniqueToken || !meta.checkinAt) return { alert, meta: null };
  return { alert, meta };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { id } = await params;

    const loaded = await loadAlert(id, tenant.id);
    if (!loaded) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    if (!loaded.meta) {
      // Older alerts (pre-metadata) can't offer candidates — resolve manually.
      return NextResponse.json({ candidates: [], metadata: null });
    }

    const checkinAt = new Date(loaded.meta.checkinAt);
    // Generous window: a bit before the check-in through the rest of that day
    // (and early next day). An odd-hour check-in (e.g. 00:30) has no class
    // within ±3h, but the member surely attended one later that day — the admin
    // must still be able to pick it. Sorted closest-first; the UI only flags a
    // truly-near class as "closest".
    const windowStart = new Date(checkinAt.getTime() - 3 * 60 * 60 * 1000);
    const windowEnd = new Date(checkinAt.getTime() + 21 * 60 * 60 * 1000);

    // Include COMPLETED too — unmatched check-ins are often assigned after the
    // class already ran (the whole point of the manual flow).
    const classes = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["SCHEDULED", "COMPLETED"] },
        startsAt: { gte: windowStart, lte: windowEnd },
        classType: { wellhubProductId: { not: null } },
      },
      select: {
        id: true,
        startsAt: true,
        classType: { select: { name: true } },
        room: { select: { name: true } },
        coach: { select: { name: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    const tz = await resolveScheduleTimezone(tenant);
    const candidates = classes.map((c) => {
      const distanceMinutes = Math.round(
        Math.abs(c.startsAt.getTime() - checkinAt.getTime()) / 60_000,
      );
      return {
        id: c.id,
        name: c.classType.name,
        coachName: c.coach?.name ?? null,
        roomName: c.room?.name ?? null,
        startsAt: c.startsAt.toISOString(),
        startsAtLabel: formatDateTimeInZone(c.startsAt, tz),
        distanceMinutes,
        // Only a genuinely-near class earns the "closest" hint — avoids
        // flagging a class 7h away on an odd-hour check-in.
        isNear: distanceMinutes <= 45,
      };
    });

    return NextResponse.json({
      metadata: {
        ...loaded.meta,
        checkinAtLabel: formatDateTimeInZone(checkinAt, tz),
      },
      candidates,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/alerts/[id]/assign error:", error);
    return NextResponse.json({ error: "Failed to load candidates" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { tenant, session } = await requireRole("ADMIN");
    const { id } = await params;
    const { classId } = (await request.json()) as { classId?: string };
    if (!classId) {
      return NextResponse.json({ error: "classId is required" }, { status: 400 });
    }

    const loaded = await loadAlert(id, tenant.id);
    if (!loaded) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
    if (!loaded.meta) {
      return NextResponse.json(
        { error: "Alert has no check-in metadata (created before this feature)" },
        { status: 422 },
      );
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
      select: { id: true, status: true },
    });
    if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 });
    if (cls.status === "CANCELLED") {
      return NextResponse.json({ error: "Class is cancelled" }, { status: 422 });
    }

    const { createWalkinBooking } = await import("@/lib/platforms/wellhub/access-control");
    await createWalkinBooking({
      tenantId: tenant.id,
      classId: cls.id,
      uniqueToken: loaded.meta.wellhubUniqueToken,
      checkinAt: new Date(loaded.meta.checkinAt),
    });

    // Typical case: the class already ran and its feed post exists — append
    // the attendee so the post reflects them. Best-effort, never blocks.
    if (cls.status === "COMPLETED") {
      try {
        const { syncCompletedClassAttendees } = await import("@/lib/feed/attendees");
        await syncCompletedClassAttendees(cls.id, tenant.id);
      } catch (err) {
        console.error("[wellhub] feed attendee sync after manual assign failed", err);
      }
    }

    await prisma.platformAlert.update({
      where: { id },
      data: { isResolved: true, resolvedAt: new Date(), resolvedBy: session.user.id },
    });

    return NextResponse.json({ ok: true, classId: cls.id });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/alerts/[id]/assign error:", error);
    return NextResponse.json({ error: "Failed to assign check-in" }, { status: 500 });
  }
}
