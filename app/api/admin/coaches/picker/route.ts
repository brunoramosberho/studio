import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  type AvailabilityBlockLite,
  type CoachSlotStatus,
  getCoachStatusForSlot,
} from "@/lib/availability";
import { startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";

/**
 * Returns the coaches list enriched with availability + workload context
 * for a specific (startsAt, duration, room) slot. Used by the class form
 * dialog's instructor picker so the admin can see at a glance:
 *  - who's preferred / backup / not available for this studio
 *  - who has a hard scheduling conflict
 *  - who has a class ending right before / starting right after
 *  - how many classes they already have today and this week
 *
 * Query params:
 *  - startsAt    ISO datetime (required)
 *  - duration    minutes (required)
 *  - roomId      optional — when provided we resolve the studio for the
 *                preferred/backup distinction
 *  - excludeClassId  optional — when editing an existing class, exclude
 *                    it from the conflict check
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
      return NextResponse.json(
        { error: "startsAt and duration are required" },
        { status: 400 },
      );
    }

    const startsAt = new Date(startsAtStr);
    const duration = parseInt(durationStr, 10);
    if (Number.isNaN(startsAt.getTime()) || !Number.isFinite(duration) || duration <= 0) {
      return NextResponse.json({ error: "invalid startsAt or duration" }, { status: 400 });
    }
    const endsAt = new Date(startsAt.getTime() + duration * 60_000);

    // Resolve the studio (if a room was provided) so availability prefs
    // can be evaluated per-studio.
    let studioId = "";
    if (roomId) {
      const room = await prisma.room.findFirst({
        where: { id: roomId, tenantId: tenant.id },
        select: { studioId: true },
      });
      studioId = room?.studioId ?? "";
    }

    const coachProfiles = await prisma.coachProfile.findMany({
      where: { tenantId: tenant.id, userId: { not: null } },
      include: { user: { select: { id: true, image: true } } },
      orderBy: { name: "asc" },
    });

    const coachUserIds = coachProfiles
      .map((p) => p.userId)
      .filter((id): id is string => id != null);
    const coachProfileIds = coachProfiles.map((p) => p.id);

    // Window: pull a buffer day around the class so we can compute
    // "class ending right before" / "starting right after" without an
    // extra query. Also pull the full week containing the class for the
    // week-load count.
    const dayStart = startOfDay(startsAt);
    const dayEnd = endOfDay(startsAt);
    const weekStart = startOfWeek(startsAt, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(startsAt, { weekStartsOn: 1 });

    const [blocks, weekClasses] = await Promise.all([
      prisma.coachAvailabilityBlock.findMany({
        where: {
          tenantId: tenant.id,
          coachId: { in: coachUserIds },
          status: { in: ["active", "pending_approval"] },
        },
        include: {
          studioPreferences: { select: { studioId: true, preference: true } },
        },
      }),
      prisma.class.findMany({
        where: {
          tenantId: tenant.id,
          coachId: { in: coachProfileIds },
          status: "SCHEDULED",
          startsAt: { gte: weekStart, lte: weekEnd },
          ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
        },
        select: {
          id: true,
          coachId: true,
          startsAt: true,
          endsAt: true,
          classType: { select: { name: true } },
        },
      }),
    ]);

    const blocksByUser = new Map<string, typeof blocks>();
    for (const b of blocks) {
      const list = blocksByUser.get(b.coachId) ?? [];
      list.push(b);
      blocksByUser.set(b.coachId, list);
    }

    const classesByCoach = new Map<string, typeof weekClasses>();
    for (const c of weekClasses) {
      const list = classesByCoach.get(c.coachId) ?? [];
      list.push(c);
      classesByCoach.set(c.coachId, list);
    }

    const ADJACENT_WINDOW_MIN = 60; // classes within ±60 min flagged as adjacent
    const startMin = startsAt.getHours() * 60 + startsAt.getMinutes();
    const endMin = endsAt.getHours() * 60 + endsAt.getMinutes();

    type PickerStatus =
      | "preferred"
      | "ok_if_needed"
      | "available_unconfigured"
      | "no_availability"
      | "time_off"
      | "conflict";

    type AdjacentClass = {
      name: string;
      startsAt: string;
      endsAt: string;
      gapMinutes: number;
    };

    interface PickerCoach {
      id: string;
      name: string;
      image: string | null;
      color: string;
      status: PickerStatus;
      conflictClass: { name: string; startsAt: string } | null;
      priorClass: AdjacentClass | null;
      followingClass: AdjacentClass | null;
      classesThisDay: number;
      classesThisWeek: number;
    }

    const result: PickerCoach[] = coachProfiles.map((p) => {
      const coachBlocks =
        (blocksByUser.get(p.userId!) as unknown as AvailabilityBlockLite[]) ?? [];
      const myClasses = classesByCoach.get(p.id) ?? [];

      // Hard conflict: an existing class overlaps the slot
      const conflict = myClasses.find(
        (c) => c.startsAt < endsAt && c.endsAt > startsAt,
      );

      // Classes today + this week (excludes the conflict if any since the
      // admin's about to replace it via the edit flow — though we keep it
      // in the count to reflect real workload)
      const classesThisDay = myClasses.filter(
        (c) => c.startsAt >= dayStart && c.startsAt <= dayEnd,
      ).length;
      const classesThisWeek = myClasses.length;

      // Adjacent classes (only ones that don't overlap)
      let priorClass: AdjacentClass | null = null;
      let followingClass: AdjacentClass | null = null;
      for (const c of myClasses) {
        const gapBefore = (startsAt.getTime() - c.endsAt.getTime()) / 60_000;
        const gapAfter = (c.startsAt.getTime() - endsAt.getTime()) / 60_000;
        if (gapBefore >= 0 && gapBefore <= ADJACENT_WINDOW_MIN) {
          if (!priorClass || gapBefore < priorClass.gapMinutes) {
            priorClass = {
              name: c.classType.name,
              startsAt: c.startsAt.toISOString(),
              endsAt: c.endsAt.toISOString(),
              gapMinutes: Math.round(gapBefore),
            };
          }
        } else if (gapAfter >= 0 && gapAfter <= ADJACENT_WINDOW_MIN) {
          if (!followingClass || gapAfter < followingClass.gapMinutes) {
            followingClass = {
              name: c.classType.name,
              startsAt: c.startsAt.toISOString(),
              endsAt: c.endsAt.toISOString(),
              gapMinutes: Math.round(gapAfter),
            };
          }
        }
      }

      let status: PickerStatus;
      if (conflict) {
        status = "conflict";
      } else {
        const slotStatus: CoachSlotStatus = getCoachStatusForSlot({
          blocks: coachBlocks,
          date: startsAt,
          startMin,
          endMin,
          studioId,
        });
        const hasAnyAvailability = coachBlocks.some(
          (b) => b.kind === "availability",
        );
        if (slotStatus === "time_off") {
          status = "time_off";
        } else if (slotStatus === "preferred") {
          status = "preferred";
        } else if (slotStatus === "ok_if_needed") {
          status = "ok_if_needed";
        } else if (!hasAnyAvailability) {
          // Coach hasn't configured a calendar yet — let them be picked
          // but flag visually so the admin knows it's unconfirmed.
          status = "available_unconfigured";
        } else {
          // Has availability defined but nothing covers this slot/studio
          status = "no_availability";
        }
      }

      return {
        id: p.id,
        name: p.name,
        image: p.photoUrl ?? p.user?.image ?? null,
        color: p.color,
        status,
        conflictClass: conflict
          ? {
              name: conflict.classType.name,
              startsAt: conflict.startsAt.toISOString(),
            }
          : null,
        priorClass,
        followingClass,
        classesThisDay,
        classesThisWeek,
      };
    });

    // Sort: pickable first (preferred → ok_if_needed → unconfigured), then
    // the rest (no_availability → time_off → conflict). Within each bucket,
    // alphabetical.
    const order: Record<PickerStatus, number> = {
      preferred: 0,
      ok_if_needed: 1,
      available_unconfigured: 2,
      no_availability: 3,
      time_off: 4,
      conflict: 5,
    };
    result.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({ coaches: result, studioResolved: Boolean(studioId) });
  } catch (error) {
    console.error("GET /api/admin/coaches/picker error:", error);
    return NextResponse.json(
      { error: "Failed to load coach picker data" },
      { status: 500 },
    );
  }
}
