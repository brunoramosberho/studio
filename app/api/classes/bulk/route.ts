import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { format } from "date-fns";
import { zonedWallTimeToUtc } from "@/lib/utils";

const FALLBACK_TZ = "Europe/Madrid";

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
    // Parse date strings as UTC date components so the weekday math is
    // independent of the server TZ (Vercel runs in UTC). Actual UTC instants
    // for each class are computed via zonedWallTimeToUtc using the studio's
    // timezone below.
    const [fromY, fromM, fromD] = (dateFrom as string).split("-").map(Number);
    const [toY, toM, toD] = (dateTo as string).split("-").map(Number);
    const startMs = Date.UTC(fromY, (fromM ?? 1) - 1, fromD ?? 1);
    const endMs = Date.UTC(toY, (toM ?? 1) - 1, toD ?? 1);

    if (startMs > endMs) {
      return NextResponse.json(
        { error: "dateFrom must be before or equal to dateTo" },
        { status: 400 },
      );
    }

    const maxRangeMs = 56 * 24 * 60 * 60 * 1000;
    if (endMs - startMs > maxRangeMs) {
      return NextResponse.json(
        { error: "El rango máximo es de 8 semanas. Crea otra serie para las siguientes semanas." },
        { status: 400 },
      );
    }

    // Map our day index (0=Mon..6=Sun) to JS getUTCDay (0=Sun, 1=Mon..6=Sat)
    const jsDayMap: Record<number, number> = {
      0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0,
    };

    const recurringId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const resolvedSongEnabled = songRequestsEnabled ?? true;
    const resolvedSongCriteria = !resolvedSongEnabled
      ? (Array.isArray(songRequestCriteria) ? songRequestCriteria : [])
      : Array.isArray(songRequestCriteria) && songRequestCriteria.length > 0
        ? songRequestCriteria
        : ["ALL"];

    // Resolve the studio's timezone so we interpret "time" as a wall-clock
    // time in the studio's zone, not in the server's TZ (which is UTC on
    // Vercel). Without this, an 8:15 AM class for a Madrid studio would be
    // stored as 8:15 UTC and displayed as 10:15 CEST.
    const roomRecord = await prisma.room.findUnique({
      where: { id: roomId },
      select: { studio: { select: { city: { select: { timezone: true } } } } },
    });
    const studioTz = roomRecord?.studio?.city?.timezone ?? FALLBACK_TZ;

    const classesToCreate: { startsAt: Date; endsAt: Date }[] = [];
    const DAY_MS = 24 * 60 * 60 * 1000;
    const WEEK_MS = 7 * DAY_MS;
    const startUTCDow = new Date(startMs).getUTCDay();

    for (const dayIndex of days as number[]) {
      const targetDow = jsDayMap[dayIndex];
      if (targetDow === undefined) continue;

      const offsetDays = (targetDow - startUTCDow + 7) % 7;
      let cursor = startMs + offsetDays * DAY_MS;

      while (cursor <= endMs) {
        const d = new Date(cursor);
        const startsAt = zonedWallTimeToUtc(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          hours,
          minutes,
          studioTz,
        );
        const endsAt = new Date(startsAt.getTime() + duration * 60_000);
        classesToCreate.push({ startsAt, endsAt });
        cursor += WEEK_MS;
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
