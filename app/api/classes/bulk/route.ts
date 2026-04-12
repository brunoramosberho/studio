import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { addMinutes, addWeeks, format, setDay, startOfDay, isBefore, isAfter } from "date-fns";

/**
 * POST /api/classes/bulk
 * Creates multiple classes based on a recurrence pattern.
 *
 * Body:
 *   classTypeId: string
 *   coachId: string
 *   roomId: string
 *   time: string           // "HH:mm"
 *   duration: number        // minutes
 *   days: number[]          // 0=Mon, 1=Tue, ..., 6=Sun (ISO weekday - 1)
 *   dateFrom: string        // "YYYY-MM-DD"
 *   dateTo: string          // "YYYY-MM-DD"
 *   tag?: string
 *   songRequestsEnabled?: boolean
 *   songRequestCriteria?: string[]
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");

    const body = await request.json();
    const {
      classTypeId, coachId, roomId, time, duration, days,
      dateFrom, dateTo, tag, songRequestsEnabled, songRequestCriteria,
    } = body;

    if (!classTypeId || !coachId || !roomId || !time || !duration || !days?.length || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: "Missing required fields: classTypeId, coachId, roomId, time, duration, days, dateFrom, dateTo" },
        { status: 400 },
      );
    }

    const [hours, minutes] = time.split(":").map(Number);
    const startDate = startOfDay(new Date(dateFrom));
    const endDate = startOfDay(new Date(dateTo));

    if (isAfter(startDate, endDate)) {
      return NextResponse.json(
        { error: "dateFrom must be before or equal to dateTo" },
        { status: 400 },
      );
    }

    // Limit date range to 8 weeks (56 days)
    const maxRangeMs = 56 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
      return NextResponse.json(
        { error: "El rango máximo es de 8 semanas. Crea otra serie para las siguientes semanas." },
        { status: 400 },
      );
    }

    // Map our day index (0=Mon..6=Sun) to date-fns day (0=Sun, 1=Mon..6=Sat)
    const dateFnsDayMap: Record<number, number> = {
      0: 1, // Mon
      1: 2, // Tue
      2: 3, // Wed
      3: 4, // Thu
      4: 5, // Fri
      5: 6, // Sat
      6: 0, // Sun
    };

    const recurringId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const resolvedSongEnabled = songRequestsEnabled ?? true;
    const resolvedSongCriteria = !resolvedSongEnabled
      ? (Array.isArray(songRequestCriteria) ? songRequestCriteria : [])
      : Array.isArray(songRequestCriteria) && songRequestCriteria.length > 0
        ? songRequestCriteria
        : ["ALL"];

    // Generate all dates
    const classesToCreate: { startsAt: Date; endsAt: Date }[] = [];

    for (const dayIndex of days as number[]) {
      const dateFnsDay = dateFnsDayMap[dayIndex];
      if (dateFnsDay === undefined) continue;

      // Find the first occurrence of this weekday on or after startDate
      let current = setDay(startDate, dateFnsDay, { weekStartsOn: 1 });
      if (isBefore(current, startDate)) {
        current = addWeeks(current, 1);
      }

      while (!isAfter(current, endDate)) {
        const startsAt = new Date(current);
        startsAt.setHours(hours, minutes, 0, 0);
        const endsAt = addMinutes(startsAt, duration);
        classesToCreate.push({ startsAt, endsAt });
        current = addWeeks(current, 1);
      }
    }

    if (classesToCreate.length === 0) {
      return NextResponse.json(
        { error: "No classes to create for the given date range and days" },
        { status: 400 },
      );
    }

    // Limit to prevent accidental mass creation
    if (classesToCreate.length > 200) {
      return NextResponse.json(
        { error: `Too many classes (${classesToCreate.length}). Maximum is 200 per batch.` },
        { status: 400 },
      );
    }

    // Sort by date
    classesToCreate.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    // Bulk create
    const created = await prisma.class.createMany({
      data: classesToCreate.map(({ startsAt, endsAt }) => ({
        tenantId: ctx.tenant.id,
        classTypeId,
        coachId,
        roomId,
        startsAt,
        endsAt,
        isRecurring: true,
        recurringId,
        tag: tag || null,
        songRequestsEnabled: resolvedSongEnabled,
        songRequestCriteria: resolvedSongCriteria,
      })),
    });

    return NextResponse.json({
      count: created.count,
      recurringId,
      dateRange: {
        from: format(classesToCreate[0].startsAt, "yyyy-MM-dd"),
        to: format(classesToCreate[classesToCreate.length - 1].startsAt, "yyyy-MM-dd"),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/classes/bulk error:", error);
    return NextResponse.json(
      { error: "Failed to create classes" },
      { status: 500 },
    );
  }
}
