import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getZone, getStatusForZone } from "@/lib/availability";
import { validateBlockPayload } from "@/lib/availability-validation";
import { notifyAdminsOfAvailabilityRequest } from "@/lib/availability-notifications";

export async function GET() {
  try {
    const { session, tenant } = await requireRole("COACH");

    const [blocks, studios] = await Promise.all([
      prisma.coachAvailabilityBlock.findMany({
        where: { tenantId: tenant.id, coachId: session.user.id },
        orderBy: { createdAt: "desc" },
        include: {
          studioPreferences: { select: { studioId: true, preference: true } },
        },
      }),
      prisma.studio.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    return NextResponse.json({
      blocks,
      studios,
      zoneRedDays: tenant.zoneRedDays,
      zoneYellowDays: tenant.zoneYellowDays,
      studioOpenTime: tenant.studioOpenTime,
      studioCloseTime: tenant.studioCloseTime,
      operatingDays: tenant.operatingDays,
    });
  } catch (error) {
    console.error("GET /api/coaches/availability error:", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireRole("COACH");
    const body = await request.json();

    const studios = await prisma.studio.findMany({
      where: { tenantId: tenant.id },
      select: { id: true },
    });
    const validStudioIds = new Set(studios.map((s) => s.id));

    const validation = validateBlockPayload(
      body,
      {
        studioOpenTime: tenant.studioOpenTime,
        studioCloseTime: tenant.studioCloseTime,
        operatingDays: tenant.operatingDays,
      },
      { validStudioIds },
    );

    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const data = validation.data;

    // Zone gating: only applies to one-time blocks (recurring don't have
    // a specific date — they take effect on every matching weekday from
    // now on). Time-off near the date needs admin approval; new
    // availability declared near the date is also gated to give admins a
    // chance to react (e.g. avoid surprise new slots within the locked
    // schedule window).
    let status: "active" | "pending_approval" = "active";
    if (data.type === "one_time" && data.startDate) {
      const zone = getZone(data.startDate, tenant);
      status = getStatusForZone(zone);
    }

    const block = await prisma.coachAvailabilityBlock.create({
      data: {
        tenantId: tenant.id,
        coachId: session.user.id,
        kind: data.kind,
        type: data.type,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        startDate: data.startDate,
        endDate: data.endDate,
        isAllDay: data.isAllDay,
        reasonType: data.reasonType,
        reasonNote: data.reasonNote,
        status,
        studioPreferences:
          data.studioPreferences.length > 0
            ? {
                create: data.studioPreferences.map((p) => ({
                  studioId: p.studioId,
                  preference: p.preference,
                  tenantId: tenant.id,
                })),
              }
            : undefined,
      },
      include: {
        studioPreferences: { select: { studioId: true, preference: true } },
      },
    });

    if (status === "pending_approval") {
      const zone = block.startDate ? getZone(block.startDate, tenant) : "green";
      const coachName =
        session.user.name ?? session.user.email ?? "Un instructor";
      notifyAdminsOfAvailabilityRequest({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        block: {
          id: block.id,
          kind: block.kind as "availability" | "time_off",
          type: block.type as "one_time" | "recurring",
          startDate: block.startDate,
          endDate: block.endDate,
          dayOfWeek: block.dayOfWeek,
          startTime: block.startTime,
          endTime: block.endTime,
          isAllDay: block.isAllDay,
          reasonType: block.reasonType,
          reasonNote: block.reasonNote,
        },
        coachName,
        zone,
      }).catch((err) => {
        console.error("Failed to notify admins of availability request:", err);
      });
    }

    return NextResponse.json(block, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create block";
    const isZoneError = message.includes("zona roja");
    console.error("POST /api/coaches/availability error:", error);
    return NextResponse.json(
      { error: message },
      { status: isZoneError ? 403 : 500 },
    );
  }
}
