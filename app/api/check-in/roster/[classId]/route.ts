import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";

type UserPackageRow = {
  creditsUsed: number;
  expiresAt: Date;
  package: { name: string; type: string; credits: number | null };
  [key: string]: unknown;
};

function pickBestPackage(packages: UserPackageRow[]): UserPackageRow | null {
  if (packages.length === 0) return null;

  // Unlimited packages (credits is null) always win
  const unlimited = packages.find((p) => p.package.credits == null);
  if (unlimited) return unlimited;

  // Among credit-based, pick the one with most remaining credits
  const withCredits = packages
    .map((p) => ({
      pkg: p,
      remaining: (p.package.credits ?? 0) - (p.creditsUsed ?? 0),
    }))
    .filter((p) => p.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  if (withCredits.length > 0) return withCredits[0].pkg;

  // All depleted — return the one expiring last (first in our desc-sorted list)
  return packages[0];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ classId: string }> },
) {
  try {
    const ctx = await requireRole("ADMIN", "FRONT_DESK");
    const { classId } = await params;

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        coachId: true,
        waitlistSnapshot: true,
        room: {
          select: { id: true, name: true, maxCapacity: true, layout: true },
        },
      },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const bookings = await prisma.booking.findMany({
      // Exclude platform companion seats — Wellhub members are listed in their
      // own `wellhubBookings` section (avoids showing them twice).
      where: {
        classId,
        status: { in: ["CONFIRMED", "ATTENDED", "NO_SHOW"] },
        platformBookingId: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
            email: true,
            birthday: true,
            createdAt: true,
            packages: {
              where: {
                tenantId: ctx.tenant.id,
                expiresAt: { gte: new Date() },
              },
              include: { package: { select: { name: true, type: true, credits: true } } },
              orderBy: { expiresAt: "desc" },
            },
          },
        },
        // Host (the member who brought this guest), for the guest row label.
        parentBooking: { select: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    const checkIns = await prisma.checkIn.findMany({
      where: { classId },
      select: { memberId: true, status: true, method: true, createdAt: true },
    });
    const checkInMap = new Map(checkIns.map((ci) => [ci.memberId, ci]));

    // Compute attendee stats (same logic as /api/classes/[id])
    const userIds = bookings.filter((b) => b.user).map((b) => b.user!.id);

    const [totalCounts, coachCounts, cancelCounts, allBookingCounts] = userIds.length > 0
      ? await Promise.all([
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { in: ["ATTENDED", "CONFIRMED"] } },
            _count: true,
          }),
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { in: ["ATTENDED", "CONFIRMED"] }, class: { coachId: cls.coachId } },
            _count: true,
          }),
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds }, status: { in: ["CANCELLED", "NO_SHOW"] } },
            _count: true,
          }),
          prisma.booking.groupBy({
            by: ["userId"],
            where: { userId: { in: userIds } },
            _count: true,
          }),
        ])
      : [[], [], [], []];

    const totalMap = new Map(totalCounts.map((r) => [r.userId, r._count]));
    const coachMap = new Map(coachCounts.map((r) => [r.userId, r._count]));
    const cancelMap = new Map(cancelCounts.map((r) => [r.userId, r._count]));
    const allMap = new Map(allBookingCounts.map((r) => [r.userId, r._count]));

    // Subscriptions pending cancellation — so front desk can spot a member
    // about to lose their membership and try to retain them.
    const subscriptions = userIds.length > 0
      ? await prisma.memberSubscription.findMany({
          where: {
            tenantId: ctx.tenant.id,
            userId: { in: userIds },
            status: { in: ["active", "trialing"] },
          },
          select: {
            userId: true,
            cancelAtPeriodEnd: true,
            cancelRequested: true,
            currentPeriodEnd: true,
            commitmentEndsAt: true,
          },
        })
      : [];
    const cancelingSubMap = new Map<string, Date | null>();
    for (const s of subscriptions) {
      if (!s.cancelAtPeriodEnd && !s.cancelRequested) continue;
      const cancelAt =
        s.cancelRequested && s.commitmentEndsAt ? s.commitmentEndsAt : s.currentPeriodEnd;
      cancelingSubMap.set(s.userId, cancelAt);
    }

    // Waiver status for all members
    const activeWaiver = await prisma.waiver.findFirst({
      where: { tenantId: ctx.tenant.id, status: "active" },
      select: { id: true, version: true, blockCheckinWithoutSignature: true },
    });

    const waiverSignatures = activeWaiver
      ? await prisma.waiverSignature.findMany({
          where: { waiverId: activeWaiver.id, memberId: { in: userIds } },
          select: { memberId: true, waiverVersion: true },
        })
      : [];
    const waiverSignedMap = new Map(waiverSignatures.map((s) => [s.memberId, s.waiverVersion]));

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const roster = bookings.map((b) => {
        // Guest booking: no User account → minimal row, attendance read from
        // the booking status (ATTENDED = checked in), since there is no
        // CheckIn row for guests.
        if (!b.user) {
          const guestName = b.guestName ?? "Invitado";
          const gp = guestName.trim().split(/\s+/);
          const guestInitials =
            gp.length >= 2
              ? `${gp[0][0]}${gp[1][0]}`.toUpperCase()
              : (gp[0]?.[0] ?? "?").toUpperCase();
          return {
            memberId: b.id, // synthetic id (= bookingId) for keying/optimistic
            memberName: guestName,
            memberImage: null,
            spotNumber: b.spotNumber,
            bookingId: b.id,
            bookingStatus: b.status,
            initials: guestInitials,
            membershipType: "Invitado",
            membershipPackageType: null,
            remainingClasses: null,
            isUnlimited: false,
            hasPaymentPending: false,
            waiverPending: false,
            memberSince: b.createdAt.toISOString(),
            isGuest: true,
            hostName: b.parentBooking?.user?.name ?? null,
            checkIn:
              b.status === "ATTENDED"
                ? { status: "present", method: "manual", createdAt: b.createdAt.toISOString() }
                : null,
            stats: null,
          };
        }

        const user = b.user!;
        const ci = checkInMap.get(user.id) ?? null;

        // Pick best package: unlimited first, then most remaining credits
        const activePackage = pickBestPackage(user.packages);

        const nameParts = (user.name ?? "").trim().split(/\s+/);
        const initials = nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
          : (nameParts[0]?.[0] ?? "?").toUpperCase();

        const hasExpiredMembership = !activePackage;
        const isUnlimited = activePackage?.package.credits == null;
        const remainingCredits = activePackage?.package.credits != null
          ? Math.max(0, activePackage.package.credits - (activePackage.creditsUsed ?? 0))
          : null;

        // Expiry warning is for credit packs only — an unlimited subscription's
        // UserPackage "expires" each billing period and just renews, so it's not
        // a sales signal; the cancellation flag below is what matters there.
        const expiresAt = activePackage?.expiresAt ?? null;
        const membershipExpiresInDays =
          !isUnlimited && expiresAt
            ? Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000)
            : null;
        const membershipCancelAt = cancelingSubMap.get(user.id) ?? null;

        // Stats
        const uid = user.id;
        const totalClasses = totalMap.get(uid) ?? 0;
        const classesWithCoach = coachMap.get(uid) ?? 0;
        const cancelled = cancelMap.get(uid) ?? 0;
        const allBookings = allMap.get(uid) ?? 0;
        const cancelRate = allBookings >= 3 ? Math.round((cancelled / allBookings) * 100) : null;
        const isNewMember = user.createdAt >= thirtyDaysAgo;
        const isFirstEver = totalClasses <= 1;
        const isFirstWithCoach = classesWithCoach <= 1;
        const isTopClient = totalClasses >= 10;

        let birthdayLabel: string | null = null;
        if (user.birthday) {
          const bday = new Date(user.birthday);
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

        const memberSince = user.createdAt.toISOString();

        const signedVersion = waiverSignedMap.get(user.id);
        const waiverPending = activeWaiver
          ? signedVersion === undefined || signedVersion < activeWaiver.version
          : false;

        return {
          memberId: user.id,
          memberName: user.name,
          memberImage: user.image,
          spotNumber: b.spotNumber,
          bookingId: b.id,
          bookingStatus: b.status,
          initials,
          membershipType: activePackage?.package.name ?? "Sin paquete",
          membershipPackageType: activePackage?.package.type ?? null,
          remainingClasses: remainingCredits,
          isUnlimited,
          membershipExpiresInDays,
          membershipCancelling: cancelingSubMap.has(user.id),
          membershipCancelAt: membershipCancelAt ? membershipCancelAt.toISOString() : null,
          hasPaymentPending: hasExpiredMembership,
          waiverPending,
          memberSince,
          isGuest: false,
          hostName: null,
          checkIn: ci
            ? { status: ci.status, method: ci.method, createdAt: ci.createdAt.toISOString() }
            : null,
          stats: {
            totalClasses,
            classesWithCoach,
            isNewMember,
            isFirstEver,
            isFirstWithCoach,
            isTopClient,
            birthdayLabel,
            cancelRate,
          },
        };
      });

    roster.sort((a, b) => {
      if (a.checkIn && !b.checkIn) return -1;
      if (!a.checkIn && b.checkIn) return 1;
      return (a.memberName ?? "").localeCompare(b.memberName ?? "");
    });

    const waitlist = await prisma.waitlist.findMany({
      where: { classId },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
      orderBy: { position: "asc" },
    });

    const waitlistData = waitlist.map((w) => ({
      memberId: w.user.id,
      memberName: w.user.name,
      memberImage: w.user.image,
      position: w.position,
      since: w.createdAt.toISOString(),
      released: false,
    }));

    // For a past class the live entries are gone (refunded + cleared at start),
    // so fall back to the snapshot taken then — shown read-only as "was on the
    // waitlist" so staff can see who had been waiting.
    if (waitlistData.length === 0 && Array.isArray(cls.waitlistSnapshot)) {
      const snap = cls.waitlistSnapshot as {
        userId: string;
        name: string | null;
        image: string | null;
      }[];
      snap.forEach((s, i) => {
        waitlistData.push({
          memberId: s.userId,
          memberName: s.name,
          memberImage: s.image,
          position: i + 1,
          since: cls.startsAt.toISOString(),
          released: true,
        });
      });
    }

    // ── Wellhub bookings on this class ───────────────────────────────────
    // Surfaced as a separate list so the UI can render them with a Wellhub
    // badge and the right check-in action (which calls /access/v1/validate).
    const wellhubBookingsRaw = await prisma.platformBooking.findMany({
      where: {
        classId,
        platform: "wellhub",
        status: { in: ["confirmed", "checked_in", "pending_confirmation"] },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        status: true,
        memberName: true,
        wellhubUserUniqueToken: true,
        wellhubBookingNumber: true,
        wellhubProductId: true,
        checkedInAt: true,
        createdAt: true,
        companionBooking: { select: { id: true, spotNumber: true, status: true } },
      },
    });

    // Enrich with the latest profile from WellhubUserLink so we surface
    // first/last name + email when Wellhub provided them via webhook.
    const uniqueTokens = wellhubBookingsRaw
      .map((b) => b.wellhubUserUniqueToken)
      .filter((t): t is string => !!t);
    const userLinks = uniqueTokens.length > 0
      ? await prisma.wellhubUserLink.findMany({
          where: {
            tenantId: ctx.tenant.id,
            wellhubUniqueToken: { in: uniqueTokens },
          },
          select: {
            wellhubUniqueToken: true,
            fullName: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            userId: true,
          },
        })
      : [];
    const linkByToken = new Map(userLinks.map((l) => [l.wellhubUniqueToken, l]));

    const wellhubRoster = wellhubBookingsRaw.map((b) => {
      const link = b.wellhubUserUniqueToken
        ? linkByToken.get(b.wellhubUserUniqueToken)
        : undefined;
      const composedName = [link?.firstName, link?.lastName].filter(Boolean).join(" ").trim();
      const displayName =
        link?.fullName ||
        composedName ||
        b.memberName ||
        (b.wellhubUserUniqueToken ? `Wellhub ${b.wellhubUserUniqueToken.slice(-4)}` : "Wellhub");
      const initials = displayName
        .split(/\s+/)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .slice(0, 2)
        .join("") || "W";
      return {
        platformBookingId: b.id,
        source: "wellhub" as const,
        status: b.status,
        memberName: displayName,
        initials,
        wellhubUniqueToken: b.wellhubUserUniqueToken,
        wellhubBookingNumber: b.wellhubBookingNumber,
        wellhubProductId: b.wellhubProductId,
        email: link?.email ?? null,
        phone: link?.phone ?? null,
        magicUserId: link?.userId ?? null,
        // Spot held by the companion Booking so the room map can render it
        // (and move it — companionBookingId is the booking to re-spot).
        spotNumber: b.companionBooking?.spotNumber ?? null,
        companionBookingId: b.companionBooking?.id ?? null,
        // ATTENDED = occupying a seat; NO_SHOW = seat freed (Wellhub still paid).
        seatFreed: b.companionBooking?.status === "NO_SHOW",
        checkedInAt: b.checkedInAt?.toISOString() ?? null,
        createdAt: b.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      roster,
      waitlist: waitlistData,
      wellhubBookings: wellhubRoster,
      blockCheckinWithoutWaiver: activeWaiver?.blockCheckinWithoutSignature ?? false,
      room: cls.room
        ? {
            id: cls.room.id,
            name: cls.room.name,
            maxCapacity: cls.room.maxCapacity,
            layout: cls.room.layout,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("GET /api/check-in/roster error:", error);
    return NextResponse.json({ error: "Failed to fetch roster" }, { status: 500 });
  }
}
