import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { isHourBlocked } from "@/lib/availability";
import {
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  addDays,
} from "date-fns";

interface CoachSummary {
  id: string;
  userId: string;
  name: string;
  initials: string;
  color: string;
  image: string | null;
}

/**
 * Returns, for every (day, hour) slot of the requested week, the list of
 * CoachProfile IDs that are available — i.e. not blocked by a time-off block
 * (active or pending) and not already teaching an overlapping class.
 *
 * Response shape:
 *   { coaches: CoachSummary[],
 *     slots:   { [`${YYYY-MM-DD}-${hour}`]: string[] },
 *     openHour: number, closeHour: number }
 */
export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const weekStartParam = request.nextUrl.searchParams.get("weekStart");
    const base = weekStartParam ? new Date(weekStartParam) : new Date();
    const weekStart = startOfWeek(base, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(base, { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const openHour = parseInt(
      (tenant.studioOpenTime || "06:00").split(":")[0] ?? "6",
      10,
    );
    const closeHour = parseInt(
      (tenant.studioCloseTime || "22:00").split(":")[0] ?? "22",
      10,
    );

    const coachProfiles = await prisma.coachProfile.findMany({
      where: { tenantId: tenant.id, userId: { not: null } },
      include: { user: { select: { id: true, image: true } } },
    });

    const coachUserIds = coachProfiles
      .map((p) => p.userId)
      .filter((id): id is string => id != null);
    const coachProfileIds = coachProfiles.map((p) => p.id);

    const [blocks, classes] = await Promise.all([
      prisma.coachAvailabilityBlock.findMany({
        where: {
          tenantId: tenant.id,
          coachId: { in: coachUserIds },
          status: { in: ["active", "pending_approval"] },
        },
      }),
      prisma.class.findMany({
        where: {
          tenantId: tenant.id,
          coachId: { in: coachProfileIds },
          status: "SCHEDULED",
          startsAt: { gte: weekStart, lt: addDays(weekEnd, 1) },
        },
        select: { coachId: true, startsAt: true, endsAt: true },
      }),
    ]);

    const blocksByUser = new Map<string, typeof blocks>();
    for (const b of blocks) {
      const list = blocksByUser.get(b.coachId) ?? [];
      list.push(b);
      blocksByUser.set(b.coachId, list);
    }

    const classesByCoach = new Map<string, { startsAt: Date; endsAt: Date }[]>();
    for (const c of classes) {
      const list = classesByCoach.get(c.coachId) ?? [];
      list.push({ startsAt: c.startsAt, endsAt: c.endsAt });
      classesByCoach.set(c.coachId, list);
    }

    const slots: Record<string, string[]> = {};

    for (const day of days) {
      const dayKey = format(day, "yyyy-MM-dd");
      for (let hour = openHour; hour < closeHour; hour++) {
        const slotStart = new Date(day);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(hour + 1, 0, 0, 0);

        const available: string[] = [];
        for (const profile of coachProfiles) {
          if (!profile.userId) continue;
          const coachBlocks = blocksByUser.get(profile.userId) ?? [];
          if (isHourBlocked(coachBlocks, day, hour)) continue;

          const myClasses = classesByCoach.get(profile.id) ?? [];
          const conflict = myClasses.some(
            (c) => c.startsAt < slotEnd && c.endsAt > slotStart,
          );
          if (conflict) continue;

          available.push(profile.id);
        }

        slots[`${dayKey}-${hour}`] = available;
      }
    }

    // Default CoachProfile.color is the gold "#C9A96E" — when an admin never
    // customized the coach, every profile looks the same. Fall back to a
    // deterministic per-coach palette so chips read as distinct.
    const DEFAULT_COLOR = "#C9A96E";
    const PALETTE = [
      "#1A2C4E",
      "#2D5016",
      "#C9A96E",
      "#7C3AED",
      "#DC2626",
      "#0891B2",
      "#D97706",
      "#059669",
      "#6366F1",
      "#DB2777",
      "#0EA5E9",
      "#84CC16",
    ];
    const sortedProfiles = [...coachProfiles]
      .filter((p) => p.userId != null)
      .sort((a, b) => (a.id < b.id ? -1 : 1));

    const coaches: CoachSummary[] = sortedProfiles.map((p, idx) => ({
      id: p.id,
      userId: p.userId!,
      name: p.name || "Coach",
      initials: (p.name || "C")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      color:
        p.color && p.color !== DEFAULT_COLOR
          ? p.color
          : PALETTE[idx % PALETTE.length],
      image: p.photoUrl ?? p.user?.image ?? null,
    }));

    return NextResponse.json({ coaches, slots, openHour, closeHour });
  } catch (error) {
    console.error("GET /api/admin/availability/week-slots error:", error);
    return NextResponse.json(
      { error: "Failed to load week slots" },
      { status: 500 },
    );
  }
}
