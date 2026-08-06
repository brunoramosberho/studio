import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import { getAttendeeStats, cancelRateFor } from "@/lib/attendee-stats";

// Minimum lifetime bookings before we surface a member's cancellation rate.
// With a tiny history a single cancellation reads as a scary % (cancel your
// first booking, attend the next → "50% cancela"), which unfairly flags new
// members. Require a large enough sample for the rate to mean something.
// Keep in sync with /api/classes/[id].

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
        // Front desk needs to know which spots are out of service (and why)
        // before seating anyone.
        blockingNotes: true,
        blockedSpots: {
          select: { spotNumber: true },
          orderBy: { spotNumber: "asc" },
        },
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
              // Only ACTIVE packs are usable — a PENDING_PAYMENT (abandoned
              // checkout), REVOKED, PAYMENT_FAILED or DISPUTED pack must never
              // surface as the member's package on the roster.
              where: {
                tenantId: ctx.tenant.id,
                status: "ACTIVE",
                expiresAt: { gte: new Date() },
              },
              include: { package: { select: { name: true, type: true, credits: true } } },
              orderBy: { expiresAt: "desc" },
            },
          },
        },
        // Host (the member who brought this guest), for the guest row label.
        parentBooking: { select: { user: { select: { name: true } } } },
        // Post-class bar pre-order, so the desk/coach knows there's something to
        // prepare or hand over when this member checks in.
        productOrder: {
          select: {
            status: true,
            items: { select: { nameSnapshot: true, quantity: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const checkIns = await prisma.checkIn.findMany({
      where: { classId },
      select: { memberId: true, status: true, method: true, createdAt: true },
    });
    const checkInMap = new Map(checkIns.map((ci) => [ci.memberId, ci]));

    // The package each booking actually consumed (Booking.packageUsed is a plain
    // UserPackage id, no relation). We prefer THIS over "best active package" so
    // the roster shows the pack the member reserved the class with — not just
    // whichever of their packs has the most credits left.
    const usedPkgIds = [
      ...new Set(bookings.map((b) => b.packageUsed).filter((x): x is string => !!x)),
    ];
    const usedPackages = usedPkgIds.length > 0
      ? await prisma.userPackage.findMany({
          where: { id: { in: usedPkgIds }, tenantId: ctx.tenant.id },
          select: {
            id: true,
            creditsUsed: true,
            expiresAt: true,
            status: true,
            package: { select: { name: true, type: true, credits: true } },
          },
        })
      : [];
    const usedPkgMap = new Map(usedPackages.map((p) => [p.id, p]));

    // Compute attendee stats (same logic as /api/classes/[id])
    const userIds = bookings.filter((b) => b.user).map((b) => b.user!.id);

    // Shared finished-classes-only stats (tenant-scoped, excludes this class).
    const attendeeStats = await getAttendeeStats({
      tenantId: ctx.tenant.id,
      userIds,
      coachId: cls.coachId,
      excludeClassId: cls.id,
    });

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

    // A member's post-class bar pre-order, condensed for the roster row. A
    // cancelled order is treated as no order.
    const preOrderOf = (
      po: { status: string; items: { nameSnapshot: string; quantity: number }[] } | null,
    ) => {
      if (!po || po.status === "CANCELLED") return null;
      return {
        status: po.status,
        itemCount: po.items.reduce((s, it) => s + it.quantity, 0),
        items: po.items.map((it) => ({ name: it.nameSnapshot, quantity: it.quantity })),
      };
    };

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
            preOrder: preOrderOf(b.productOrder),
            checkIn:
              b.status === "ATTENDED"
                ? { status: "present", method: "manual", createdAt: b.createdAt.toISOString() }
                : null,
            stats: null,
          };
        }

        const user = b.user!;
        const ci = checkInMap.get(user.id) ?? null;

        // The package this class was reserved with wins — that's what the front
        // desk cares about. Fall back to the member's best ACTIVE package only
        // when the booking didn't record one (e.g. unlimited subs or legacy
        // bookings). pickBestPackage now only sees ACTIVE packs, so a pending/
        // abandoned pack can never be shown here.
        const bookedWith = b.packageUsed ? usedPkgMap.get(b.packageUsed) : null;
        const activePackage = bookedWith ?? pickBestPackage(user.packages);

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

        // Stats — finished classes actually taken; zero past = first time.
        const counts = attendeeStats.get(user.id) ?? { taken: 0, takenWithCoach: 0, cancelled: 0 };
        const totalClasses = counts.taken;
        const classesWithCoach = counts.takenWithCoach;
        const cancelRate = cancelRateFor(counts);
        const isNewMember = user.createdAt >= thirtyDaysAgo;
        const isFirstEver = totalClasses === 0;
        const isFirstWithCoach = classesWithCoach === 0;
        const isTopClient = totalClasses >= 10;

        let birthdayLabel: string | null = null;
        if (user.birthday) {
          const bday = new Date(user.birthday);
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const yesterdayDate = new Date(todayDate.getTime() - 24 * 60 * 60 * 1000);
          // UTC getters: birthdays are stored at UTC midnight, so local
          // getters read the previous day on any server west of UTC.
          const thisYearBday = new Date(now.getFullYear(), bday.getUTCMonth(), bday.getUTCDate());
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
          preOrder: preOrderOf(b.productOrder),
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

    // ── Notify-me sign-ups (people who asked to be told when a spot opens) ──
    const notifyMeRaw = await prisma.classNotifyMe.findMany({
      where: { classId },
      include: { user: { select: { id: true, name: true, image: true } } },
      orderBy: { createdAt: "asc" },
    });
    const notifyMeData = notifyMeRaw.map((n) => ({
      memberId: n.user.id,
      memberName: n.user.name,
      memberImage: n.user.image,
      since: n.createdAt.toISOString(),
    }));

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

    // ── No-shows + late-cancels (direct & Wellhub) — reference list only. ─────
    // No amounts / billable flags sent to the client (front desk sees this).
    // Late-cancels are the fee-charged ones: direct with credit forfeited, and
    // Wellhub's own late-cancel bucket (on-time cancels are excluded).
    const [directAudit, platformAudit] = await Promise.all([
      prisma.booking.findMany({
        where: {
          classId,
          platformBookingId: null,
          OR: [
            { status: "NO_SHOW" },
            { status: "CANCELLED", creditLost: true },
            // Unlimited late-cancels forfeit no credit — their penalty is the
            // fee queued as a PendingPenalty, so surface those too.
            { status: "CANCELLED", pendingPenalty: { is: { reason: "late_cancel" } } },
          ],
        },
        select: {
          status: true,
          guestName: true,
          cancelledAt: true,
          cancelledBy: true,
          userId: true,
          user: { select: { name: true } },
        },
      }),
      prisma.platformBooking.findMany({
        where: {
          classId,
          OR: [{ status: "absent" }, { status: "cancelled", notes: "wellhub_late_cancel" }],
        },
        // updatedAt approximates when the late-cancel webhook landed.
        select: { status: true, memberName: true, updatedAt: true },
      }),
    ]);

    const noShows = [
      ...directAudit
        .filter((b) => b.status === "NO_SHOW")
        .map((b) => ({ name: b.user?.name ?? b.guestName ?? "Miembro", channel: "direct" as const })),
      ...platformAudit
        .filter((b) => b.status === "absent")
        .map((b) => ({ name: b.memberName ?? "Wellhub", channel: "wellhub" as const })),
    ];

    // Resolve staff cancellers so the audit says WHO freed the seat.
    const cancellerIds = [
      ...new Set(
        directAudit
          .filter((b) => b.status === "CANCELLED" && b.cancelledBy && b.cancelledBy !== "system" && b.cancelledBy !== b.userId)
          .map((b) => b.cancelledBy as string),
      ),
    ];
    const cancellers = cancellerIds.length
      ? await prisma.user.findMany({ where: { id: { in: cancellerIds } }, select: { id: true, name: true } })
      : [];
    const cancellerName = new Map(cancellers.map((c) => [c.id, c.name]));

    const lateCancels = [
      ...directAudit
        .filter((b) => b.status === "CANCELLED")
        .map((b) => ({
          name: b.user?.name ?? b.guestName ?? "Miembro",
          channel: "direct" as const,
          at: b.cancelledAt?.toISOString() ?? null,
          by:
            b.cancelledBy == null
              ? null
              : b.cancelledBy === "system"
                ? "sistema"
                : b.cancelledBy === b.userId
                  ? "el socio"
                  : (cancellerName.get(b.cancelledBy) ?? "staff"),
        })),
      ...platformAudit
        .filter((b) => b.status === "cancelled")
        .map((b) => ({
          name: b.memberName ?? "Wellhub",
          channel: "wellhub" as const,
          at: b.updatedAt.toISOString(),
          by: null,
        })),
    ];

    return NextResponse.json({
      roster,
      waitlist: waitlistData,
      notifyMe: notifyMeData,
      wellhubBookings: wellhubRoster,
      occupancyAudit: { noShows, lateCancels },
      blockCheckinWithoutWaiver: activeWaiver?.blockCheckinWithoutSignature ?? false,
      blocked: {
        // spotNumber null = a whole-class block with no specific seat.
        spots: cls.blockedSpots
          .map((b) => b.spotNumber)
          .filter((n): n is number => n != null),
        unnumbered: cls.blockedSpots.filter((b) => b.spotNumber == null).length,
        notes: cls.blockingNotes,
      },
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
