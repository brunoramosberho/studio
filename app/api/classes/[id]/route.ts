import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant, requireRole, getAuthContext, roleAtLeast } from "@/lib/tenant";
import { cancelClassWithRefunds } from "@/lib/class-cancel";
import { BookingStatus } from "@prisma/client";
import { redactedCoach, shouldHideCoach } from "@/lib/coach";
import { normalizeRules } from "@/lib/song-rules";
import { platformBookedNoCompanionWhere } from "@/lib/booking/availability";

// Minimum lifetime bookings before we surface a member's cancellation rate.
// With a tiny history a single cancellation reads as a scary % (cancel your
// first booking, attend the next → "50% cancela"), which unfairly flags new
// members. Require a large enough sample for the rate to mean something.
// Keep in sync with /api/check-in/roster/[classId].
const MIN_BOOKINGS_FOR_CANCEL_RATE = 10;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const tenant = await requireTenant();
    const { id } = await params;

    const authCtx = await getAuthContext();
    const currentUserId = authCtx?.session?.user?.id;
    const isCoachOrAdmin =
      authCtx?.membership?.role === "COACH" || authCtx?.membership?.role === "ADMIN";

    const bookingStatuses: BookingStatus[] = isCoachOrAdmin
      ? ["CONFIRMED", "ATTENDED", "NO_SHOW"]
      : ["CONFIRMED", "ATTENDED"];

    const classData = await prisma.class.findFirst({
      where: { id, tenantId: tenant.id },
      include: {
        classType: true,
        room: { include: { studio: { include: { city: true } } } },
        coach: {
          select: {
            id: true, userId: true, name: true, bio: true, specialties: true, photoUrl: true, color: true, tenantId: true,
            user: { select: { name: true, image: true } },
          },
        },
        bookings: {
          where: { status: { in: bookingStatuses } },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
                email: true,
                birthday: true,
                createdAt: true,
              },
            },
            // Platform companion bookings (Wellhub/ClassPass/…). memberName lets
            // the coach call them by name; wellhubUserUniqueToken is the stable
            // identity used to detect repeat attendance across classes.
            platformBooking: {
              select: { platform: true, memberName: true, wellhubUserUniqueToken: true },
            },
          },
        },
        blockedSpots: {
          select: { id: true, spotNumber: true, createdAt: true },
        },
        _count: {
          select: {
            bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } },
            blockedSpots: true,
            waitlist: true,
            songRequests: true,
          },
        },
      },
    });

    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const blockedCount = classData._count.blockedSpots;
    const platformBooked = await prisma.platformBooking.count({
      where: platformBookedNoCompanionWhere(id),
    });
    const spotsLeft = classData.room.maxCapacity - classData._count.bookings - blockedCount - platformBooked;

    let friendIds = new Set<string>();
    if (currentUserId) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterId: currentUserId },
            { addresseeId: currentUserId },
          ],
        },
        select: { requesterId: true, addresseeId: true },
      });
      for (const f of friendships) {
        if (f.requesterId === currentUserId) friendIds.add(f.addresseeId);
        else friendIds.add(f.requesterId);
      }
    }

    const spotMap: Record<number, {
      status: "self" | "friend" | "occupied" | "blocked" | "guest";
      userName?: string | null;
      userImage?: string | null;
    }> = {};

    for (const bs of classData.blockedSpots) {
      if (bs.spotNumber != null) {
        spotMap[bs.spotNumber] = { status: isCoachOrAdmin ? "blocked" : "occupied" };
      }
    }

    // Find the current user's booking IDs so we can identify their guest bookings
    const myBookingIds = new Set<string>();
    if (currentUserId) {
      for (const b of classData.bookings) {
        if (b.userId === currentUserId) myBookingIds.add(b.id);
      }
    }

    for (const b of classData.bookings) {
      if (b.spotNumber == null) continue;
      const parentId = (b as any).parentBookingId as string | null;
      const isMyGuest = parentId != null && myBookingIds.has(parentId);

      if (b.userId === currentUserId && !parentId) {
        spotMap[b.spotNumber] = { status: "self", userName: b.user?.name, userImage: b.user?.image };
      } else if (isMyGuest) {
        spotMap[b.spotNumber] = { status: "guest", userName: b.guestName };
      } else if (b.userId && friendIds.has(b.userId) && b.privacy !== "PRIVATE") {
        spotMap[b.spotNumber] = { status: "friend", userName: b.user?.name, userImage: b.user?.image };
      } else {
        spotMap[b.spotNumber] = { status: "occupied" };
      }
    }

    let bookings;
    // The coach's previous class of the same discipline (class type) for the
    // "repeat from your last class" indicator + a link to review what was done
    // there.
    let lastClass: { id: string; startsAt: Date; className: string; attendeeCount: number } | null = null;

    if (isCoachOrAdmin && classData.bookings.length > 0) {
      const userIds = classData.bookings.filter((b) => b.user).map((b) => b.user!.id);

      const [totalCounts, coachCounts, cancelCounts, allBookingCounts, lastClassData] = await Promise.all([
        prisma.booking.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: { in: ["ATTENDED", "CONFIRMED"] },
          },
          _count: true,
        }),
        prisma.booking.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: { in: ["ATTENDED", "CONFIRMED"] },
            class: { coachId: classData.coachId },
          },
          _count: true,
        }),
        prisma.booking.groupBy({
          by: ["userId"],
          where: {
            userId: { in: userIds },
            status: { in: ["CANCELLED", "NO_SHOW"] },
          },
          _count: true,
        }),
        prisma.booking.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _count: true,
        }),
        // The coach's previous (most recent past) class of the SAME discipline
        // (class type) — its attendees power the "was in your last class" repeat
        // indicator so the coach can vary the routine/playlist for returning
        // faces. Scoped to classTypeId so a coach who teaches several formats
        // (e.g. BTM vs BTM Tone) compares each against its own last session.
        prisma.class.findFirst({
          where: {
            tenantId: tenant.id,
            coachId: classData.coachId,
            classTypeId: classData.classTypeId,
            startsAt: { lt: classData.startsAt },
            status: { not: "CANCELLED" },
          },
          orderBy: { startsAt: "desc" },
          select: {
            id: true,
            startsAt: true,
            classType: { select: { name: true } },
            bookings: {
              where: { status: { in: ["ATTENDED", "CONFIRMED"] } },
              select: {
                userId: true,
                guestEmail: true,
                platformBooking: {
                  select: { wellhubUserUniqueToken: true, memberName: true },
                },
              },
            },
          },
        }),
      ]);

      const totalMap = new Map(totalCounts.map((r) => [r.userId, r._count]));
      const coachMap = new Map(coachCounts.map((r) => [r.userId, r._count]));
      const cancelMap = new Map(cancelCounts.map((r) => [r.userId, r._count]));
      const allMap = new Map(allBookingCounts.map((r) => [r.userId, r._count]));
      // Identity that survives across classes: members by id, guests by email,
      // Wellhub members by their stable unique token (name as a fallback). Lets
      // the repeat indicator catch guests + platform members, not just logged-in.
      const identityKey = (b: {
        userId: string | null;
        guestEmail: string | null;
        platformBooking: {
          wellhubUserUniqueToken: string | null;
          memberName: string | null;
        } | null;
      }): string | null => {
        if (b.userId) return `u:${b.userId}`;
        if (b.guestEmail) return `e:${b.guestEmail.trim().toLowerCase()}`;
        if (b.platformBooking?.wellhubUserUniqueToken)
          return `w:${b.platformBooking.wellhubUserUniqueToken}`;
        if (b.platformBooking?.memberName)
          return `n:${b.platformBooking.memberName.trim().toLowerCase()}`;
        return null;
      };
      const lastKeys = new Set(
        (lastClassData?.bookings ?? [])
          .map(identityKey)
          .filter((x): x is string => !!x),
      );
      if (lastClassData) {
        lastClass = {
          id: lastClassData.id,
          startsAt: lastClassData.startsAt,
          className: lastClassData.classType.name,
          attendeeCount: lastClassData.bookings.length,
        };
      }

      const now = new Date();
      const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      bookings = classData.bookings.map((b) => {
        const uid = b.user?.id ?? "";
        const totalClasses = totalMap.get(uid) ?? 0;
        const classesWithCoach = coachMap.get(uid) ?? 0;
        const cancelled = cancelMap.get(uid) ?? 0;
        const allBookings = allMap.get(uid) ?? 0;
        const cancelRate =
          allBookings >= MIN_BOOKINGS_FOR_CANCEL_RATE
            ? Math.round((cancelled / allBookings) * 100)
            : null;
        const hasUser = !!b.user?.id;
        const isNewMember = b.user ? b.user.createdAt >= thirtyDaysAgo : false;
        // History tags only make sense for logged-in members — a guest/platform
        // booking has no userId to count past visits by, so don't imply "first".
        const isFirstEver = hasUser && totalClasses <= 1;
        const isFirstWithCoach = hasUser && classesWithCoach <= 1;
        const isTopClient = totalClasses >= 10;
        const repeatKey = identityKey(b);

        let birthdayLabel: string | null = null;
        if (b.user?.birthday) {
          const bday = new Date(b.user.birthday);
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
          const thisYearBday = new Date(now.getFullYear(), bday.getMonth(), bday.getDate());

          if (thisYearBday.getTime() === todayDate.getTime()) {
            birthdayLabel = "today";
          } else if (thisYearBday.getTime() === yesterdayDate.getTime()) {
            birthdayLabel = "yesterday";
          } else if (thisYearBday >= todayDate && thisYearBday <= weekFromNow) {
            birthdayLabel = "this_week";
          }
        }

        return {
          ...b,
          stats: {
            totalClasses,
            classesWithCoach,
            isNewMember,
            isFirstEver,
            isFirstWithCoach,
            isTopClient,
            birthdayLabel,
            cancelRate,
            wasInLastClass: !!repeatKey && lastKeys.has(repeatKey),
          },
        };
      });
    } else {
      bookings = classData.bookings;
    }

    let myWaitlistEntry: { id: string; position: number } | null = null;
    let myNotifyMe: { id: string } | null = null;
    if (currentUserId) {
      const [wl, nm] = await Promise.all([
        prisma.waitlist.findUnique({
          where: { classId_userId: { classId: id, userId: currentUserId } },
          select: { id: true, position: true },
        }),
        prisma.classNotifyMe.findUnique({
          where: { classId_userId: { classId: id, userId: currentUserId } },
          select: { id: true },
        }),
      ]);
      if (wl) myWaitlistEntry = wl;
      if (nm) myNotifyMe = nm;
    }

    const baseCoach = {
      ...classData.coach,
      name: classData.coach.name || classData.coach.user?.name || null,
    };
    const isStaff = !!authCtx && roleAtLeast(authCtx.membership.role, "COACH");
    const hideCoach =
      !isStaff && shouldHideCoach(tenant, { endsAt: classData.endsAt });
    const coach = hideCoach ? redactedCoach(baseCoach) : baseCoach;

    return NextResponse.json({ ...classData, coach, bookings, spotsLeft, spotMap, myWaitlistEntry, myNotifyMe, lastClass });
  } catch (error) {
    console.error("GET /api/classes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch class" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "COACH");

    const { id } = await params;

    const existing = await prisma.class.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const body = await request.json();
    const { classTypeId, coachId, startsAt, endsAt, roomId, status, notes, tag, songRequestsEnabled, songRequestRules, blockingNotes, wellhubQuota } = body;

    // If cancelling via PUT, use the full cancel flow (refund + email)
    if (status === "CANCELLED" && existing.status !== "CANCELLED") {
      const refundedCount = await cancelClassWithRefunds(id, ctx.tenant.id);
      try {
        const { unsyncClassFromWellhub } = await import("@/lib/platforms/wellhub");
        await unsyncClassFromWellhub(id);
      } catch (syncError) {
        console.error("[wellhub] unsync after class cancel failed", syncError);
      }
      return NextResponse.json({ id, status: "CANCELLED", refundedBookings: refundedCount });
    }

    const updated = await prisma.class.update({
      where: { id },
      data: {
        ...(classTypeId && { classTypeId }),
        ...(coachId && { coachId }),
        ...(startsAt && { startsAt: new Date(startsAt) }),
        ...(endsAt && { endsAt: new Date(endsAt) }),
        ...(roomId && { roomId }),
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(tag !== undefined && { tag: tag || null }),
        ...(songRequestsEnabled !== undefined && { songRequestsEnabled }),
        ...(songRequestRules !== undefined && { songRequestRules: normalizeRules(songRequestRules) }),
        ...(blockingNotes !== undefined && { blockingNotes: blockingNotes || null }),
      },
      include: {
        classType: true,
        room: { include: { studio: { include: { city: true } } } },
        coach: {
          include: { user: { select: { name: true, image: true } } },
        },
      },
    });

    // Apply the per-class Wellhub quota choice (null=default, 0=closed, N=override)
    // then push the change to Wellhub. Errors land on Class.wellhubLastError.
    try {
      const {
        applyWellhubQuotaToClass,
        syncClassToWellhub,
        deleteWellhubSlotForOldClassType,
      } = await import("@/lib/platforms/wellhub");
      // A class-type change moves the class to a different Wellhub template.
      // Delete the slot under the OLD template first, or the re-sync leaves an
      // orphaned, still-bookable slot (duplicate class at the same time).
      if (classTypeId && classTypeId !== existing.classTypeId) {
        await deleteWellhubSlotForOldClassType(id, existing.classTypeId);
      }
      if (wellhubQuota !== undefined) {
        await applyWellhubQuotaToClass(ctx.tenant.id, id, wellhubQuota === null ? null : Number(wellhubQuota));
      }
      await syncClassToWellhub(id);
    } catch (syncError) {
      console.error("[wellhub] sync after class update failed", syncError);
    }

    return NextResponse.json({
      ...updated,
      coach: { ...updated.coach, name: updated.coach.name || updated.coach.user?.name || null },
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("PUT /api/classes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update class" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN");

    const { id } = await params;

    const existing = await prisma.class.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const refundedCount = await cancelClassWithRefunds(id, ctx.tenant.id);

    try {
      const { unsyncClassFromWellhub } = await import("@/lib/platforms/wellhub");
      await unsyncClassFromWellhub(id);
    } catch (syncError) {
      console.error("[wellhub] unsync after class delete failed", syncError);
    }

    return NextResponse.json({ id, status: "CANCELLED", refundedBookings: refundedCount });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("DELETE /api/classes/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to cancel class" },
      { status: 500 },
    );
  }
}
