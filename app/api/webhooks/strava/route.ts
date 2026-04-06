import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getValidAccessToken, fetchStravaActivity } from "@/lib/strava";
import { encrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_SECRET) {
    return NextResponse.json({ "hub.challenge": challenge });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { object_type, aspect_type, object_id, owner_id } = body;

    if (object_type !== "activity" || aspect_type !== "create") {
      return NextResponse.json({ ok: true });
    }

    const providerActivityId = String(object_id);
    const providerUserId = String(owner_id);

    const existing = await prisma.classBiometrics.findUnique({
      where: { provider_providerActivityId: { provider: "STRAVA", providerActivityId } },
    });
    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    const connection = await prisma.userWearableConnection.findUnique({
      where: {
        provider_providerUserId: {
          provider: "STRAVA",
          providerUserId,
        },
      },
    });

    if (!connection || connection.disconnectedAt) {
      return NextResponse.json({ ok: true, skipped: "no_connection" });
    }

    const WINDOW_MS = 30 * 60 * 1000;
    const accessToken = await getValidAccessToken(connection.id);
    const activity = await fetchStravaActivity(accessToken, providerActivityId);

    const activityStart = new Date(activity.start_date);
    const activityEnd = new Date(activityStart.getTime() + activity.elapsed_time * 1000);

    const matchingBookings = await prisma.booking.findMany({
      where: {
        userId: connection.userId,
        status: { in: ["CONFIRMED", "ATTENDED"] },
        class: {
          startsAt: { lte: new Date(activityEnd.getTime() + WINDOW_MS) },
          endsAt: { gte: new Date(activityStart.getTime() - WINDOW_MS) },
        },
      },
      include: { class: { select: { startsAt: true, endsAt: true } } },
      orderBy: { class: { startsAt: "desc" } },
    });

    if (matchingBookings.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no_match" });
    }

    let bestMatch = matchingBookings[0];
    let bestOverlap = -Infinity;

    for (const booking of matchingBookings) {
      const classStart = new Date(booking.class.startsAt).getTime();
      const classEnd = new Date(booking.class.endsAt).getTime();
      const overlapStart = Math.max(activityStart.getTime(), classStart);
      const overlapEnd = Math.min(activityEnd.getTime(), classEnd);
      const overlap = overlapEnd - overlapStart;

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = booking;
      }
    }

    const existingForBooking = await prisma.classBiometrics.findUnique({
      where: {
        bookingId_provider: {
          bookingId: bestMatch.id,
          provider: "STRAVA",
        },
      },
    });

    if (existingForBooking) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    await prisma.classBiometrics.create({
      data: {
        bookingId: bestMatch.id,
        provider: "STRAVA",
        providerActivityId,
        calories: activity.calories || null,
        hrAvg: activity.average_heartrate || null,
        hrMax: activity.max_heartrate || null,
        rawPayload: JSON.parse(JSON.stringify(activity)),
      },
    });

    return NextResponse.json({ ok: true, matched: bestMatch.id });
  } catch (error) {
    console.error("POST /api/webhooks/strava error:", error);
    return NextResponse.json({ ok: true });
  }
}
