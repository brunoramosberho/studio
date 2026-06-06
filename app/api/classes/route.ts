import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireRole, getAuthContext, roleAtLeast } from "@/lib/tenant";
import { redactedCoach, shouldHideCoach } from "@/lib/coach";
import { normalizeRules } from "@/lib/song-rules";

export async function GET(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const typeId = searchParams.get("typeId");
    const coachId = searchParams.get("coachId");
    const level = searchParams.get("level");
    const studioId = searchParams.get("studioId");

    const includeCancelled = searchParams.get("includeCancelled") === "true";
    const where: Record<string, unknown> = {
      tenantId: tenant.id,
      ...(!includeCancelled && { status: { not: "CANCELLED" } }),
    };

    if (from || to) {
      // `from` / `to` arrive as YYYY-MM-DD wall-clock dates. `new Date(str)`
      // parses them as UTC midnight, so the upper bound clips off everything
      // after 00:00 UTC on the last day — which is morning on the same day
      // for studios west of UTC and the *prior* afternoon for studios east of
      // UTC. Widen by ±1 day; the caller re-buckets by studio wall-clock so
      // extras are filtered client-side.
      const startsAtRange: { gte?: Date; lt?: Date } = {};
      if (from) {
        const d = new Date(`${from}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        startsAtRange.gte = d;
      }
      if (to) {
        const d = new Date(`${to}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 2);
        startsAtRange.lt = d;
      }
      where.startsAt = startsAtRange;
    }

    if (typeId) where.classTypeId = typeId;
    if (coachId) {
      const profile = await prisma.coachProfile.findFirst({
        where: { userId: coachId, tenantId: tenant.id },
        select: { id: true },
      });
      where.coachId = profile ? profile.id : coachId;
    }
    if (level) where.classType = { level };
    if (studioId) where.room = { studioId };

    const authCtx = await getAuthContext();
    const currentUserId = authCtx?.session?.user?.id;
    const isStaff = !!authCtx && roleAtLeast(authCtx.membership.role, "COACH");

    // Classes in a deactivated studio must not surface on the public schedule.
    // Staff still see them (so a location can be wound down / reviewed), but
    // clients and anonymous visitors only ever get active studios.
    if (!isStaff) {
      where.room = { ...(where.room as object), studio: { isActive: true } };
    }
    const hideCoachForClient = !isStaff && tenant.hideCoachUntilClassEnds;

    // If clients shouldn't see the coach, ignore the coachId filter — otherwise
    // a brute-forced id would silently filter the schedule and leak which
    // classes belong to which coach.
    if (hideCoachForClient && coachId) {
      delete where.coachId;
    }

    let friendIds: string[] = [];
    if (currentUserId) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
        },
        select: { requesterId: true, addresseeId: true },
      });
      friendIds = friendships.map((f) =>
        f.requesterId === currentUserId ? f.addresseeId : f.requesterId,
      );
    }

    const classes = await prisma.class.findMany({
      where,
      include: {
        classType: true,
        room: { include: { studio: { include: { city: true } } } },
        coach: {
          select: {
            id: true,
            userId: true,
            name: true,
            photoUrl: true,
            color: true,
            bio: true,
            specialties: true,
            tenantId: true,
            user: { select: { name: true, image: true } },
          },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            waitlist: true,
          },
        },
      },
      orderBy: { startsAt: "asc" },
    });

    // Fetch friend bookings in a single query
    let friendBookings: Map<string, { id: string; name: string | null; image: string | null }[]> = new Map();
    if (friendIds.length > 0) {
      const classIds = classes.map((c) => c.id);
      const fBookings = await prisma.booking.findMany({
        where: {
          classId: { in: classIds },
          status: { in: ["CONFIRMED", "ATTENDED"] },
          privacy: "PUBLIC",
          userId: { in: friendIds },
        },
        select: {
          classId: true,
          user: { select: { id: true, name: true, image: true } },
        },
      });
      for (const b of fBookings) {
        if (!b.user) continue;
        const list = friendBookings.get(b.classId) ?? [];
        if (!list.some((u) => u.id === b.user!.id)) {
          list.push(b.user);
        }
        friendBookings.set(b.classId, list);
      }
    }

    let myBookingMap = new Map<string, string>();
    if (currentUserId) {
      const classIds = classes.map((c) => c.id);
      const myBookings = await prisma.booking.findMany({
        where: {
          classId: { in: classIds },
          status: { in: ["CONFIRMED", "ATTENDED"] },
          userId: currentUserId,
        },
        select: { id: true, classId: true },
      });
      for (const b of myBookings) myBookingMap.set(b.classId, b.id);
    }

    const now = new Date();
    const result = classes.map((c) => {
      const baseCoach = { ...c.coach, name: c.coach.name || c.coach.user?.name || null };
      const hideCoach =
        hideCoachForClient && shouldHideCoach(tenant, { endsAt: c.endsAt }, now);
      return {
        ...c,
        coach: hideCoach ? redactedCoach(baseCoach) : baseCoach,
        friendsGoing: friendBookings.get(c.id) ?? [],
        isBooked: myBookingMap.has(c.id),
        myBookingId: myBookingMap.get(c.id) ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/classes error:", error);
    return NextResponse.json(
      { error: "Failed to fetch classes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");

    const body = await request.json();
    const { classTypeId, coachId, startsAt, endsAt, roomId, isRecurring, recurringId, notes, tag, songRequestsEnabled, songRequestRules } = body;

    const resolvedSongEnabled = songRequestsEnabled ?? true;
    const resolvedSongRules = resolvedSongEnabled
      ? normalizeRules(songRequestRules)
      : [];

    if (!classTypeId || !coachId || !startsAt || !endsAt || !roomId) {
      return NextResponse.json(
        { error: "Missing required fields: classTypeId, coachId, startsAt, endsAt, roomId" },
        { status: 400 },
      );
    }

    // Reject overlaps with an existing non-cancelled class for the same room
    // or the same coach. The picker shows this as a soft warning in the UI,
    // but a double-submit, network retry, or direct API call could otherwise
    // race past it — and there's no DB-level uniqueness on Class.
    const startsAtDate = new Date(startsAt);
    const endsAtDate = new Date(endsAt);
    const conflict = await prisma.class.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        status: { not: "CANCELLED" },
        startsAt: { lt: endsAtDate },
        endsAt: { gt: startsAtDate },
        OR: [{ roomId }, { coachId }],
      },
      include: {
        classType: { select: { name: true } },
        coach: { select: { name: true } },
        room: { select: { name: true } },
      },
    });
    if (conflict) {
      const reason =
        conflict.coachId === coachId && conflict.roomId === roomId
          ? `Ya hay una clase de ${conflict.classType.name} con ${conflict.coach.name} en ${conflict.room.name} en ese horario.`
          : conflict.coachId === coachId
            ? `${conflict.coach.name} ya tiene una clase de ${conflict.classType.name} en ese horario.`
            : `La sala ${conflict.room.name} ya está ocupada por ${conflict.classType.name} en ese horario.`;
      return NextResponse.json({ error: reason, conflictClassId: conflict.id }, { status: 409 });
    }

    const newClass = await prisma.class.create({
      data: {
        tenantId: ctx.tenant.id,
        classTypeId,
        coachId,
        roomId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        isRecurring: isRecurring ?? false,
        recurringId,
        notes,
        tag: tag || null,
        songRequestsEnabled: resolvedSongEnabled,
        songRequestRules: resolvedSongRules,
      },
      include: {
        classType: true,
        room: { include: { studio: { include: { city: true } } } },
        coach: {
          select: {
            id: true,
            userId: true,
            name: true,
            photoUrl: true,
            color: true,
            bio: true,
            specialties: true,
            tenantId: true,
            user: { select: { name: true, image: true } },
          },
        },
      },
    });

    // Best-effort sync to Wellhub. Errors are recorded on Class.wellhubLastError
    // and surfaced via PlatformAlert; we never block class creation on them.
    try {
      const { syncClassToWellhub } = await import("@/lib/platforms/wellhub");
      await syncClassToWellhub(newClass.id);
    } catch (syncError) {
      console.error("[wellhub] sync after class create failed", syncError);
    }

    return NextResponse.json({
      ...newClass,
      coach: { ...newClass.coach, name: newClass.coach.name || newClass.coach.user?.name || null },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/classes error:", error);
    return NextResponse.json(
      { error: "Failed to create class" },
      { status: 500 },
    );
  }
}
