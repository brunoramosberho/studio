import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";

/**
 * Returns class types enriched with slot-aware context for the admin
 * class form dropdown. For each class type, given a (startsAt, duration,
 * roomId) slot we tell the admin:
 *  - How many of this type are already scheduled at this studio today
 *    and this week (helps avoid over-stacking the same discipline).
 *  - Whether the same type is being taught at another studio at an
 *    overlapping time (helps avoid parallel duplicates).
 *
 * Query params:
 *  - startsAt    ISO datetime (required)
 *  - duration    minutes (required)
 *  - roomId      optional — when provided we scope counts to that studio
 *                and surface other-studio parallel conflicts
 *  - excludeClassId  optional — when editing an existing class, ignore it
 *
 * Returns the full class types list (no filtering) — the admin should
 * still be able to pick any type; the pills are advisory only.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const sp = request.nextUrl.searchParams;

    const startsAtStr = sp.get("startsAt");
    const durationStr = sp.get("duration");
    const roomId = sp.get("roomId");
    const excludeClassId = sp.get("excludeClassId");

    if (!startsAtStr || !durationStr) {
      return NextResponse.json({ error: "startsAt and duration are required" }, { status: 400 });
    }

    const startsAt = new Date(startsAtStr);
    const duration = parseInt(durationStr, 10);
    if (Number.isNaN(startsAt.getTime()) || !Number.isFinite(duration) || duration <= 0) {
      return NextResponse.json({ error: "invalid startsAt or duration" }, { status: 400 });
    }
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    // Resolve the studio of the requested room — used to scope counts.
    let studioId: string | null = null;
    if (roomId) {
      const room = await prisma.room.findFirst({
        where: { id: roomId, tenantId: tenant.id },
        select: { studioId: true },
      });
      studioId = room?.studioId ?? null;
    }

    const classTypes = await prisma.classType.findMany({
      where: { tenantId: tenant.id },
      orderBy: { name: "asc" },
    });

    const dayStart = startOfDay(startsAt);
    const dayEnd = endOfDay(startsAt);
    const weekStart = startOfWeek(startsAt, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(startsAt, { weekStartsOn: 1 });

    // Pull all scheduled classes in the week so we can compute counts +
    // parallel-conflict overlap without an N+1 per class type.
    const weekClasses = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        status: "SCHEDULED",
        startsAt: { gte: weekStart, lte: weekEnd },
        ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
      },
      select: {
        id: true,
        classTypeId: true,
        startsAt: true,
        endsAt: true,
        room: { select: { studioId: true, studio: { select: { name: true } } } },
      },
    });

    interface ParallelHit {
      studioId: string;
      studioName: string;
    }

    interface PickerClassType {
      id: string;
      name: string;
      color: string;
      duration: number;
      // Counts at the resolved studio. null when roomId wasn't supplied.
      weeklyAtStudio: number | null;
      dailyAtStudio: number | null;
      // Same-type classes happening at OTHER studios during this window.
      parallelAtOtherStudios: ParallelHit[];
    }

    const result: PickerClassType[] = classTypes.map((ct) => {
      const sameType = weekClasses.filter((c) => c.classTypeId === ct.id);

      let weeklyAtStudio: number | null = null;
      let dailyAtStudio: number | null = null;
      if (studioId) {
        weeklyAtStudio = sameType.filter((c) => c.room?.studioId === studioId).length;
        dailyAtStudio = sameType.filter(
          (c) =>
            c.room?.studioId === studioId &&
            c.startsAt >= dayStart &&
            c.startsAt <= dayEnd,
        ).length;
      }

      // Parallel-studio conflicts: same type, overlapping time, different
      // studio. De-dupe by studioId.
      const parallelMap = new Map<string, ParallelHit>();
      for (const c of sameType) {
        if (!c.room || !c.room.studioId) continue;
        if (studioId && c.room.studioId === studioId) continue;
        const overlaps = c.startsAt < endsAt && c.endsAt > startsAt;
        if (!overlaps) continue;
        if (!parallelMap.has(c.room.studioId)) {
          parallelMap.set(c.room.studioId, {
            studioId: c.room.studioId,
            studioName: c.room.studio?.name ?? "",
          });
        }
      }

      return {
        id: ct.id,
        name: ct.name,
        color: ct.color,
        duration: ct.duration,
        weeklyAtStudio,
        dailyAtStudio,
        parallelAtOtherStudios: Array.from(parallelMap.values()),
      };
    });

    return NextResponse.json({
      classTypes: result,
      studioResolved: Boolean(studioId),
    });
  } catch (error) {
    console.error("GET /api/admin/class-types/picker error:", error);
    return NextResponse.json(
      { error: "Failed to load class type picker data" },
      { status: 500 },
    );
  }
}
