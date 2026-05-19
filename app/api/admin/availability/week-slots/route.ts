import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  type AvailabilityBlockLite,
  getCoachStatusForSlot,
} from "@/lib/availability";
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
 * Returns coach availability for every (day, hour, studio) slot of the
 * requested week. Two shapes:
 *
 *   - `slots` (legacy / overview): a flat per-(day, hour) list of coach
 *     IDs available at ANY studio with ANY positive preference. Consumed
 *     by `/admin/schedule` where the overlay just shows "who's around
 *     this hour" without studio context.
 *
 *   - `slotsByStudio` (granular): per-(day, hour, studio) split into
 *     `preferred` vs `okIfNeeded` — consumed by views that already know
 *     which studio a class is being assigned to.
 *
 * Both share the same `coaches` and `studios` arrays.
 *
 * A coach without any availability blocks defined is treated as "preferred"
 * for every studio (so we don't disappear them from the slot picker).
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

    const [studios, coachProfiles] = await Promise.all([
      prisma.studio.findMany({
        where: { tenantId: tenant.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.coachProfile.findMany({
        where: { tenantId: tenant.id, userId: { not: null } },
        include: { user: { select: { id: true, image: true } } },
      }),
    ]);

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
        include: {
          studioPreferences: { select: { studioId: true, preference: true } },
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

    const slotsByStudio: Record<string, { preferred: string[]; okIfNeeded: string[] }> = {};
    const slots: Record<string, string[]> = {};

    for (const day of days) {
      const dayKey = format(day, "yyyy-MM-dd");
      for (let hour = openHour; hour < closeHour; hour++) {
        const slotStart = new Date(day);
        slotStart.setHours(hour, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(hour + 1, 0, 0, 0);

        // Aggregate per-(day, hour) across all studios for the legacy `slots`
        // shape. A coach is in the flat list if they show up as preferred or
        // backup at any studio.
        const aggregated = new Set<string>();

        for (const studio of studios) {
          const preferred: string[] = [];
          const okIfNeeded: string[] = [];

          for (const profile of coachProfiles) {
            if (!profile.userId) continue;
            const coachBlocks =
              (blocksByUser.get(profile.userId) as unknown as AvailabilityBlockLite[]) ?? [];

            // Class conflict at this hour
            const myClasses = classesByCoach.get(profile.id) ?? [];
            const conflict = myClasses.some(
              (c) => c.startsAt < slotEnd && c.endsAt > slotStart,
            );
            if (conflict) continue;

            const hasAnyAvailability = coachBlocks.some(
              (b) => b.kind === "availability",
            );

            const status = getCoachStatusForSlot({
              blocks: coachBlocks,
              date: day,
              startMin: hour * 60,
              endMin: (hour + 1) * 60,
              studioId: studio.id,
            });

            if (status === "time_off") continue;
            if (status === "preferred") {
              preferred.push(profile.id);
              aggregated.add(profile.id);
            } else if (status === "ok_if_needed") {
              okIfNeeded.push(profile.id);
              aggregated.add(profile.id);
            } else if (!hasAnyAvailability) {
              // Coach hasn't configured a calendar yet — treat as preferred
              // so they remain visible in the picker.
              preferred.push(profile.id);
              aggregated.add(profile.id);
            }
          }

          slotsByStudio[`${dayKey}-${hour}-${studio.id}`] = { preferred, okIfNeeded };
        }

        slots[`${dayKey}-${hour}`] = Array.from(aggregated);
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

    return NextResponse.json({
      coaches,
      studios,
      slots,
      slotsByStudio,
      openHour,
      closeHour,
    });
  } catch (error) {
    console.error("GET /api/admin/availability/week-slots error:", error);
    return NextResponse.json(
      { error: "Failed to load week slots" },
      { status: 500 },
    );
  }
}
