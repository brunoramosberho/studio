import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getCoverageStatus, type CoverageStatus } from "@/lib/availability";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  isToday,
} from "date-fns";
import { es } from "date-fns/locale";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");

    const view = (request.nextUrl.searchParams.get("view") || "week") as
      | "week"
      | "month";
    const weekStartParam = request.nextUrl.searchParams.get("weekStart");
    const baseDate = weekStartParam ? new Date(weekStartParam) : new Date();

    // For month view we anchor on the calendar month containing baseDate, but
    // pad to whole weeks (Mon–Sun) so the grid lays out cleanly.
    let rangeStart: Date;
    let rangeEnd: Date;
    let label: string;
    if (view === "month") {
      const monthStart = startOfMonth(baseDate);
      const monthEnd = endOfMonth(baseDate);
      rangeStart = startOfWeek(monthStart, { weekStartsOn: 1 });
      rangeEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
      label = format(monthStart, "MMMM yyyy", { locale: es });
    } else {
      rangeStart = startOfWeek(baseDate, { weekStartsOn: 1 });
      rangeEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
      label = `${format(rangeStart, "d", { locale: es })} – ${format(rangeEnd, "d MMM yyyy", { locale: es })}`;
    }

    const weekStart = rangeStart;
    const weekEnd = rangeEnd;
    const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });

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
    });

    const scheduledClasses = await prisma.class.findMany({
      where: {
        tenantId: tenant.id,
        startsAt: { gte: weekStart, lte: weekEnd },
        status: "SCHEDULED",
      },
      select: { coachId: true, startsAt: true },
    });

    const classTypes = await prisma.classType.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true },
    });

    const classesByCoachDay: Record<string, Set<string>> = {};
    for (const c of scheduledClasses) {
      const key = `${c.coachId}_${format(c.startsAt, "yyyy-MM-dd")}`;
      if (!classesByCoachDay[key]) classesByCoachDay[key] = new Set();
      classesByCoachDay[key].add(format(c.startsAt, "yyyy-MM-dd"));
    }

    const coaches = coachProfiles.map((profile) => {
      const coachBlocks = allBlocks.filter(
        (b) => b.coachId === profile.userId,
      );

      const dayCoverage: {
        date: string;
        label: string;
        dow: number;
        isToday: boolean;
        status: CoverageStatus;
        hasClass: boolean;
      }[] = days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const classKey = `${profile.id}_${dateStr}`;
        const hasClass = classesByCoachDay[classKey] !== undefined;
        let status = getCoverageStatus(coachBlocks, day);

        if (status === "available" && !hasClass) {
          status = "empty";
        }

        return {
          date: dateStr,
          label: format(day, "EEE d", { locale: es }),
          dow: day.getDay(),
          isToday: isToday(day),
          status,
          hasClass,
        };
      });

      return {
        id: profile.id,
        userId: profile.userId,
        name: profile.name || "Coach",
        image: profile.photoUrl || profile.user?.image,
        color: profile.color,
        initials: (profile.name || "C")
          .split(" ")
          .map((n) => n[0])
          .join("")
          .slice(0, 2)
          .toUpperCase(),
        days: dayCoverage,
      };
    });

    const dayHeaders = days.map((day) => ({
      date: format(day, "yyyy-MM-dd"),
      label: format(day, "EEE", { locale: es }),
      dayNum: format(day, "d"),
      isToday: isToday(day),
    }));

    return NextResponse.json({
      view,
      coaches,
      dayHeaders,
      disciplines: classTypes.map((ct) => ct.name),
      weekLabel: label,
      rangeStart: format(rangeStart, "yyyy-MM-dd"),
      rangeEnd: format(rangeEnd, "yyyy-MM-dd"),
    });
  } catch (error) {
    console.error("GET /api/admin/availability/coverage error:", error);
    return NextResponse.json(
      { error: "Failed to fetch coverage data" },
      { status: 500 },
    );
  }
}
