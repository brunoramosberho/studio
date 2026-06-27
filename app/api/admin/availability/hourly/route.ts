import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { startOfDay, endOfDay } from "date-fns";
import {
  type AvailabilityBlockLite,
  getMondayBasedDow,
  parseHhmm,
} from "@/lib/availability";
import { getWallClockInZone } from "@/lib/utils";
import { resolveScheduleTimezone } from "@/lib/schedule/visibility";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const dateStr = request.nextUrl.searchParams.get("date");
    if (!dateStr) {
      return NextResponse.json(
        { error: "date parameter required" },
        { status: 400 },
      );
    }

    const date = new Date(dateStr + "T00:00:00");
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const openH = parseInt(tenant.studioOpenTime.split(":")[0]);
    const closeH = parseInt(tenant.studioCloseTime.split(":")[0]);
    const tz = await resolveScheduleTimezone(tenant);

    const coachProfiles = await prisma.coachProfile.findMany({
      where: { tenantId: tenant.id },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    });

    const allBlocks = await prisma.coachAvailabilityBlock.findMany({
      where: {
        tenantId: tenant.id,
        coachId: { in: coachProfiles.map((p) => p.userId).filter((id): id is string => id != null) },
        status: { in: ["active", "pending_approval"] },
      },
      include: {
        studioPreferences: { select: { studioId: true, preference: true } },
      },
    });

    const dayClasses = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: dayStart, lte: dayEnd },
        status: "SCHEDULED",
      },
      include: {
        classType: { select: { name: true } },
      },
    });

    const dow = getMondayBasedDow(date);

    type SlotStatus =
      | "available_preferred"
      | "available_secondary"
      | "blocked"
      | "class"
      | "empty";
    type Slot = { hour: number; status: SlotStatus; className?: string };

    function blockCoversHour(b: AvailabilityBlockLite, hour: number): boolean {
      if (b.type === "one_time" && b.startDate && b.endDate) {
        const s = startOfDay(b.startDate);
        const e = startOfDay(b.endDate);
        if (dayStart < s || dayStart > e) return false;
        if (b.isAllDay) return true;
        const sm = parseHhmm(b.startTime);
        const em = parseHhmm(b.endTime);
        if (sm == null || em == null) return true;
        return hour * 60 < em && (hour + 1) * 60 > sm;
      }
      if (b.type === "recurring" && b.dayOfWeek.includes(dow)) {
        const sm = parseHhmm(b.startTime);
        const em = parseHhmm(b.endTime);
        if (sm == null || em == null) return true;
        return hour * 60 < em && (hour + 1) * 60 > sm;
      }
      return false;
    }

    const coaches = coachProfiles.map((profile) => {
      const initials = (profile.name || "C")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

      const coachBlocks = allBlocks.filter(
        (b) => b.coachId === profile.userId,
      ) as unknown as AvailabilityBlockLite[];
      const coachClasses = dayClasses.filter(
        (c) => c.coachId === profile.id,
      );

      const hasAnyAvailability = coachBlocks.some((b) => b.kind === "availability");

      const slots: Slot[] = [];

      for (let h = openH; h < closeH; h++) {
        const classAtHour = coachClasses.find(
          (c) => getWallClockInZone(c.startsAt, tz).hour === h,
        );

        if (classAtHour) {
          slots.push({
            hour: h,
            status: "class",
            className: classAtHour.classType.name,
          });
          continue;
        }

        // 1) time_off carve-out wins
        const blockedByTimeOff = coachBlocks.some(
          (b) => b.kind === "time_off" && blockCoversHour(b, h),
        );
        if (blockedByTimeOff) {
          slots.push({ hour: h, status: "blocked" });
          continue;
        }

        // 2) positive availability for this hour (any studio)?
        const matching = coachBlocks.filter(
          (b) =>
            b.kind === "availability" &&
            b.status === "active" &&
            blockCoversHour(b, h),
        );
        if (matching.length > 0) {
          const anyPreferred = matching.some((b) =>
            b.studioPreferences?.some((p) => p.preference === "preferred"),
          );
          slots.push({
            hour: h,
            status: anyPreferred ? "available_preferred" : "available_secondary",
          });
          continue;
        }

        // 3) no availability defined at all → keep showing as "available"
        //    to preserve the pre-migration behaviour for coaches who have
        //    not yet entered their calendar.
        if (!hasAnyAvailability) {
          slots.push({ hour: h, status: "available_preferred" });
          continue;
        }

        slots.push({ hour: h, status: "empty" });
      }

      return {
        coachId: profile.userId,
        coachProfileId: profile.id,
        coachName: profile.name || "Coach",
        initials,
        color: profile.color,
        image: profile.photoUrl || profile.user?.image,
        slots,
      };
    });

    const classTypes = await prisma.classType.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const disciplines = classTypes.map((ct) => ct.name);

    const allClasses = await prisma.class.findMany({
      where: { tenantId: tenant.id, status: "SCHEDULED" },
      select: { coachId: true, classTypeId: true },
    });

    const classTypeNameById = Object.fromEntries(
      classTypes.map((ct) => [ct.id, ct.name]),
    );

    const coachDisciplines: Record<string, string[]> = {};
    for (const c of allClasses) {
      const name = classTypeNameById[c.classTypeId];
      if (!name) continue;
      if (!coachDisciplines[c.coachId]) coachDisciplines[c.coachId] = [];
      if (!coachDisciplines[c.coachId].includes(name)) {
        coachDisciplines[c.coachId].push(name);
      }
    }

    const enrichedCoaches = coaches.map((c) => ({
      ...c,
      disciplines: coachDisciplines[c.coachProfileId] ?? [],
    }));

    return NextResponse.json({
      coaches: enrichedCoaches,
      disciplines,
      openHour: openH,
      closeHour: closeH,
    });
  } catch (error) {
    console.error("GET /api/admin/availability/hourly error:", error);
    return NextResponse.json(
      { error: "Failed to fetch hourly data" },
      { status: 500 },
    );
  }
}
