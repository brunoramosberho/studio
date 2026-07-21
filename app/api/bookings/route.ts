import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireAuth, requireTenant, roleAtLeast } from "@/lib/tenant";
import { getVisibleUntilForUser, resolveScheduleTimezone } from "@/lib/schedule/visibility";
import { sendBookingConfirmation, getTenantBaseUrl } from "@/lib/email";
import { notifyAdminsOfNewBooking } from "@/lib/booking-notifications";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { removeSpotNotifyMe } from "@/lib/waitlist";
import { findPackageForClass, deductCredit, restoreCredit, userPackageIncludeForBooking, classWithinPackageWindow, packageCoversClassType, ensureSubscriptionUserPackages } from "@/lib/credits";
import { checkSubscriptionBookingLimits, type BookingLimitFailure } from "@/lib/booking/limits";
import { userHasOpenDebt } from "@/lib/billing/debt";
import { partnerLabel } from "@/lib/platforms/labels";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { redactedCoach, shouldHideCoach } from "@/lib/coach";
import { platformBookedNoCompanionWhere } from "@/lib/booking/availability";

export async function GET(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();

    const status = request.nextUrl.searchParams.get("status");
    const now = new Date();

    const isUpcoming = status === "upcoming";
    const isPast = status === "past";

    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: tenant.id,
        userId: session.user.id,
        ...(isUpcoming
          ? { status: "CONFIRMED", class: { startsAt: { gte: now } } }
          : isPast
            ? {
                OR: [
                  { status: { in: ["ATTENDED", "NO_SHOW"] } },
                  { status: "CONFIRMED", class: { startsAt: { lt: now } } },
                  { status: "CANCELLED", class: { startsAt: { lt: now } } },
                ],
              }
            : {}),
      },
      include: {
        class: {
          include: {
            classType: true,
            coach: { include: { user: { select: { name: true, image: true } } } },
            room: { include: { studio: { select: { name: true } } } },
          },
        },
        productOrder: {
          include: {
            items: {
              select: {
                id: true,
                productId: true,
                nameSnapshot: true,
                quantity: true,
                unitPriceCents: true,
              },
            },
          },
        },
        // Present when the booking came from a partner (Wellhub/ClassPass) — the
        // UI labels it so the member can tell it apart from one they made here,
        // and knows to cancel it in the partner app.
        platformBooking: { select: { platform: true } },
      },
      orderBy: { class: { startsAt: isUpcoming ? "asc" : "desc" } },
      take: 50,
    });

    // Redact coach data on upcoming/in-progress classes when the tenant has
    // `hideCoachUntilClassEnds`. Past classes always show the coach.
    const redactCoachInBooking = <B extends { class: { endsAt: Date; coach: any } }>(b: B): B => {
      if (!shouldHideCoach(tenant, { endsAt: b.class.endsAt })) return b;
      return { ...b, class: { ...b.class, coach: redactedCoach(b.class.coach) } };
    };

    // Per-booking cancellation policy, so dialogs show the window and fee that
    // actually apply — the funding package (or the member's active subscription)
    // may override the tenant defaults.
    const tenantWindow = tenant.cancellationWindowHours ?? 12;
    const pkgIds = [...new Set(bookings.map((b) => b.packageUsed).filter(Boolean))] as string[];
    const userPkgs = pkgIds.length
      ? await prisma.userPackage.findMany({
          where: { id: { in: pkgIds } },
          select: {
            id: true,
            creditsTotal: true,
            package: {
              select: { cancellationWindowHours: true, lateCancelFeeCents: true },
            },
          },
        })
      : [];
    const upById = new Map(userPkgs.map((u) => [u.id, u]));
    const activeSub = await prisma.memberSubscription.findFirst({
      where: { tenantId: tenant.id, userId: session.user.id, status: { in: ["active", "trialing"] } },
      select: {
        package: { select: { cancellationWindowHours: true, lateCancelFeeCents: true } },
      },
    });
    const policyFor = (b: { packageUsed: string | null }) => {
      const up = b.packageUsed ? upById.get(b.packageUsed) : undefined;
      const pkg = up?.package ?? activeSub?.package ?? null;
      const isUnlimited = up ? up.creditsTotal === null : !!activeSub;
      return {
        windowHours: pkg?.cancellationWindowHours ?? tenantWindow,
        lateCancelFeeCents: isUnlimited ? (pkg?.lateCancelFeeCents ?? 0) : 0,
        isUnlimited,
      };
    };

    // Attach friends going to the same classes (only for upcoming)
    if (isUpcoming && bookings.length > 0) {
      const friendships = await prisma.friendship.findMany({
        where: {
          status: "ACCEPTED",
          OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
        },
        select: { requesterId: true, addresseeId: true },
      });
      const friendIds = friendships.map((f) =>
        f.requesterId === session.user.id ? f.addresseeId : f.requesterId,
      );

      if (friendIds.length > 0) {
        const classIds = bookings.map((b) => b.classId);
        const friendBookings = await prisma.booking.findMany({
          where: {
            tenantId: tenant.id,
            classId: { in: classIds },
            userId: { in: friendIds },
            status: "CONFIRMED",
          },
          select: {
            classId: true,
            user: { select: { id: true, name: true, image: true } },
          },
        });

        const friendsByClass = new Map<string, { id: string; name: string | null; image: string | null }[]>();
        for (const fb of friendBookings) {
          if (!fb.user) continue;
          const arr = friendsByClass.get(fb.classId) ?? [];
          arr.push(fb.user);
          friendsByClass.set(fb.classId, arr);
        }

        const enriched = bookings.map((b) => ({
          ...redactCoachInBooking(b),
          friendsGoing: friendsByClass.get(b.classId) ?? [],
          cancellationPolicy: policyFor(b),
        }));
        return NextResponse.json(enriched);
      }
    }

    return NextResponse.json(
      bookings.map((b) => ({
        ...redactCoachInBooking(b),
        friendsGoing: [],
        cancellationPolicy: policyFor(b),
      })),
    );
  } catch (error) {
    console.error("GET /api/bookings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch bookings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const body = await request.json();
    const {
      classId,
      packageId,
      guestName,
      guestEmail,
      spotNumber,
      privacy,
      paymentIntentId,
    } = body;
    const guests: { name: string; email: string; spotNumber?: number }[] = body.guests ?? [];

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 },
      );
    }

    const session = await auth();

    // Payment-authenticated guest booking: when /payment/success calls us
    // straight after a successful charge, the paymentIntentId is proof the
    // user paid for this package. Resolve the user from the StripePayment so
    // the booking links to the correct User row even without a session.
    let paymentAuthedUserId: string | null = null;
    let paymentAuthedPackage: { id: string; userId: string } | null = null;
    if (!session?.user && typeof paymentIntentId === "string" && paymentIntentId.length > 0) {
      const sp = await prisma.stripePayment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
      });
      if (sp && sp.tenantId === tenant.id && sp.referenceId) {
        // Promote the UserPackage to ACTIVE if the webhook hasn't landed yet.
        // We only do this when Stripe already considers the payment paid
        // (status === "succeeded" in our mirror table).
        if (sp.status === "succeeded") {
          await prisma.userPackage.updateMany({
            where: {
              id: sp.referenceId,
              status: "PENDING_PAYMENT",
            },
            data: { status: "ACTIVE", stripePaymentId: paymentIntentId },
          });
        }
        const up = await prisma.userPackage.findUnique({
          where: { id: sp.referenceId },
          select: { id: true, userId: true, status: true },
        });
        if (up && up.status === "ACTIVE") {
          paymentAuthedUserId = up.userId;
          paymentAuthedPackage = { id: up.id, userId: up.userId };
        }
      }
    }

    const effectiveUserId = session?.user?.id ?? paymentAuthedUserId;
    const isGuest = !session?.user && !paymentAuthedUserId;

    if (isGuest && (!guestName || !guestEmail)) {
      return NextResponse.json(
        { error: "Guest bookings require guestName and guestEmail" },
        { status: 400 },
      );
    }

    // Validate guest entries
    for (const g of guests) {
      if (!g.name?.trim() || !g.email?.trim()) {
        return NextResponse.json(
          { error: "Cada invitado requiere nombre completo y correo electrónico" },
          { status: 400 },
        );
      }
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId, tenantId: tenant.id },
      include: {
        classType: true,
        room: { include: { studio: { include: { city: { select: { timezone: true } } } } } },
        coach: { include: { user: { select: { name: true, image: true } } } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
    });

    if (!classData) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    if (classData.status === "CANCELLED") {
      return NextResponse.json(
        { error: "This class has been cancelled" },
        { status: 400 },
      );
    }

    // Enforce per-member schedule visibility: a non-staff booker can't reserve a
    // class further out than their personal horizon (tenant default, extended by
    // any package perk they hold with remaining credits). Stops a client from
    // bypassing the /schedule window with a direct API call. Fail-open on any
    // resolution error so a legitimate booking is never wrongly blocked.
    if (classData.startsAt.getTime() > Date.now()) {
      try {
        let isStaff = false;
        if (effectiveUserId) {
          const m = await prisma.membership.findUnique({
            where: { userId_tenantId: { userId: effectiveUserId, tenantId: tenant.id } },
            select: { role: true },
          });
          isStaff = m ? roleAtLeast(m.role, "COACH") : false;
        }
        if (!isStaff) {
          const tz = await resolveScheduleTimezone(tenant);
          const horizon = await getVisibleUntilForUser(
            new Date(),
            tenant,
            tz,
            effectiveUserId ?? null,
          );
          if (classData.startsAt.getTime() > horizon.getTime()) {
            return NextResponse.json(
              {
                error:
                  "Esta clase todavía no está disponible para reservar con tu plan.",
              },
              { status: 403 },
            );
          }
        }
      } catch (err) {
        console.error("[bookings] visibility enforcement skipped", err);
      }
    }

    const blockedCount = await prisma.blockedSpot.count({ where: { classId } });
    const platformBooked = await prisma.platformBooking.count({
      where: platformBookedNoCompanionWhere(classId),
    });
    const totalPeople = 1 + guests.length;
    const spotsLeft = classData.room.maxCapacity - classData._count.bookings - blockedCount - platformBooked;
    if (spotsLeft < totalPeople) {
      if (spotsLeft <= 0) {
        return NextResponse.json(
          { error: "Class is full. Consider joining the waitlist.", full: true },
          { status: 409 },
        );
      }
      return NextResponse.json(
        { error: `No hay suficientes lugares. Solo quedan ${spotsLeft} lugar(es) disponible(s).` },
        { status: 409 },
      );
    }

    // Validate all spot numbers (self + guests)
    const allSpots: number[] = [];
    if (spotNumber != null) allSpots.push(spotNumber);
    for (const g of guests) {
      if (g.spotNumber != null) allSpots.push(g.spotNumber);
    }

    for (const sn of allSpots) {
      if (sn < 1 || sn > classData.room.maxCapacity) {
        return NextResponse.json(
          { error: "Número de lugar inválido" },
          { status: 400 },
        );
      }
    }

    // Check for duplicate spot selections
    const uniqueSpots = new Set(allSpots);
    if (uniqueSpots.size !== allSpots.length) {
      return NextResponse.json(
        { error: "No puedes seleccionar el mismo lugar para más de una persona" },
        { status: 400 },
      );
    }

    // Check all spots are available
    for (const sn of allSpots) {
      const spotBlocked = await prisma.blockedSpot.findFirst({
        where: { classId, spotNumber: sn },
      });
      if (spotBlocked) {
        return NextResponse.json(
          { error: `El lugar ${sn} está bloqueado. Selecciona otro.` },
          { status: 409 },
        );
      }

      const spotTaken = await prisma.booking.findFirst({
        where: { classId, tenantId: tenant.id, spotNumber: sn, status: "CONFIRMED" },
      });
      if (spotTaken) {
        return NextResponse.json(
          { error: `El lugar ${sn} ya está ocupado. Selecciona otro.` },
          { status: 409 },
        );
      }
    }

    if (effectiveUserId) {
      const existingBooking = await prisma.booking.findFirst({
        where: {
          tenantId: tenant.id,
          classId,
          userId: effectiveUserId,
          status: "CONFIRMED",
        },
        select: { id: true, platformBooking: { select: { platform: true } } },
      });
      if (existingBooking) {
        // Name the partner when the seat came from one. Their reservation is
        // now visible here, so this blocks a second booking — but "you already
        // have a booking" reads as a bug unless we say where it came from.
        const partner = partnerLabel(existingBooking.platformBooking?.platform);
        return NextResponse.json(
          {
            error: partner
              ? `Ya tienes una reserva para esta clase con ${partner}. Si quieres traer a alguien, resérvale un lugar como invitado.`
              : "You already have a booking for this class",
            ...(partner ? { platformBooking: true } : {}),
          },
          { status: 409 },
        );
      }
    }

    let packageUsedId: string | null = null;
    // Track how many credits we deducted so we can restore them if the
    // booking insert later fails (e.g. spot conflict). Prevents charging the
    // member without giving them a seat.
    let creditsDeducted = 0;
    let creditsDeductedClassTypeId: string | null = null;

    const studioTimezone =
      classData.room.studio.city?.timezone ?? "Europe/Madrid";

    function limitErrorResponse(failure: BookingLimitFailure) {
      const msg =
        failure.reason === "DAY"
          ? failure.max === 1
            ? "Tu plan permite máximo 1 reserva por día con este paquete. Cancela otra clase del mismo día para reservar."
            : `Tu plan permite máximo ${failure.max} reservas por día con este paquete. Cancela otra clase del mismo día para reservar.`
          : `Tienes ${failure.current} reserva(s) futura(s) pendiente(s) con este paquete (máximo ${failure.max}). Toma o cancela una para reservar otra.`;
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    if (paymentAuthedPackage && !session?.user) {
      // Payment-authenticated path: use the just-purchased package directly.
      // We trust the StripePayment row we verified above; no debt or
      // discovery query needed.
      const classTypeId = classData.classTypeId;
      const up = await prisma.userPackage.findUnique({
        where: { id: paymentAuthedPackage.id },
        include: {
          ...userPackageIncludeForBooking,
        },
      });
      if (!up || up.status !== "ACTIVE") {
        return NextResponse.json(
          { error: "Package not active" },
          { status: 402 },
        );
      }
      const limitCheck = await checkSubscriptionBookingLimits({
        userPackageId: up.id,
        userId: up.userId,
        tenantId: tenant.id,
        classStartsAt: classData.startsAt,
        studioTimezone,
        maxBookingsPerDay: up.package.maxBookingsPerDay,
        maxConcurrentUpcomingBookings: up.package.maxConcurrentUpcomingBookings,
      });
      if (!limitCheck.ok) return limitErrorResponse(limitCheck);
      const creditsNeeded = totalPeople;
      const hasAllocations = up.creditUsages.length > 0;
      if (hasAllocations) {
        const usage = up.creditUsages.find((u) => u.classTypeId === classTypeId);
        const available = usage ? usage.creditsTotal - usage.creditsUsed : 0;
        if (available < creditsNeeded) {
          return NextResponse.json(
            { error: `Necesitas ${creditsNeeded} crédito(s), pero solo tienes ${available}.` },
            { status: 402 },
          );
        }
      } else if (up.creditsTotal !== null) {
        const available = up.creditsTotal - up.creditsUsed;
        if (available < creditsNeeded) {
          return NextResponse.json(
            { error: `Necesitas ${creditsNeeded} crédito(s), pero solo tienes ${available}.` },
            { status: 402 },
          );
        }
      }
      for (let i = 0; i < creditsNeeded; i++) {
        await deductCredit(up.id, classTypeId);
      }
      creditsDeducted = creditsNeeded;
      creditsDeductedClassTypeId = classTypeId;
      packageUsedId = up.id;
    } else if (session?.user) {
      if (await userHasOpenDebt(session.user.id, tenant.id)) {
        return NextResponse.json(
          {
            error:
              "Tienes un saldo pendiente con el estudio. Contacta a administración para resolverlo antes de reservar.",
          },
          { status: 403 },
        );
      }

      // Heal subscription→UserPackage gaps so an active, paid membership is
      // always bookable even if the invoice.paid webhook was delayed/dropped.
      await ensureSubscriptionUserPackages(session.user.id, tenant.id);

      const userPackages = await prisma.userPackage.findMany({
        where: {
          userId: session.user.id,
          tenantId: tenant.id,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        include: {
          ...userPackageIncludeForBooking,
          package: {
            include: {
              classTypes: { select: { id: true } },
              creditAllocations: { select: { classTypeId: true } },
            },
          },
        },
        orderBy: { expiresAt: "asc" },
      });

      const classTypeId = classData.classTypeId;
      const userPackage = findPackageForClass(userPackages, classTypeId, packageId, classData.startsAt);

      if (!userPackage) {
        // A credit may exist but be limited to a specific class-date window
        // (e.g. a free-class promo). Surface that clearly instead of a generic
        // "no credits" message.
        const restricted = userPackages.find(
          (p) =>
            packageCoversClassType(p, classTypeId) &&
            !classWithinPackageWindow(p, classData.startsAt),
        );
        if (restricted) {
          const from = restricted.eligibleClassesFrom ?? restricted.package.eligibleClassesFrom;
          const until = restricted.eligibleClassesUntil ?? restricted.package.eligibleClassesUntil;
          const fmt = (d: Date) =>
            new Intl.DateTimeFormat("es-ES", {
              day: "numeric",
              month: "long",
              timeZone: studioTimezone,
            }).format(d);
          const range =
            from && until
              ? `del ${fmt(from)} al ${fmt(until)}`
              : from
                ? `a partir del ${fmt(from)}`
                : `hasta el ${fmt(until!)}`;
          return NextResponse.json(
            {
              error: `Este crédito solo se puede usar para clases ${range}.`,
            },
            { status: 402 },
          );
        }
        return NextResponse.json(
          { error: "No valid package with available credits" },
          { status: 402 },
        );
      }

      const limitCheck = await checkSubscriptionBookingLimits({
        userPackageId: userPackage.id,
        userId: session.user.id,
        tenantId: tenant.id,
        classStartsAt: classData.startsAt,
        studioTimezone,
        maxBookingsPerDay: userPackage.package.maxBookingsPerDay,
        maxConcurrentUpcomingBookings: userPackage.package.maxConcurrentUpcomingBookings,
      });
      if (!limitCheck.ok) return limitErrorResponse(limitCheck);

      // Validate guests are allowed for this package
      if (guests.length > 0) {
        const pkg = userPackage.package as any;

        if (!pkg.allowGuests) {
          return NextResponse.json(
            { error: "Tu paquete no permite agregar invitados" },
            { status: 403 },
          );
        }

        if (pkg.maxGuestsPerBooking != null && guests.length > pkg.maxGuestsPerBooking) {
          return NextResponse.json(
            { error: `Máximo ${pkg.maxGuestsPerBooking} invitado(s) por reserva` },
            { status: 400 },
          );
        }

        // For unlimited packages, check monthly guest pass limit
        if (pkg.credits === null && pkg.monthlyGuestPasses != null) {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const guestBookingsThisMonth = await prisma.booking.count({
            where: {
              tenantId: tenant.id,
              parentBookingId: { not: null },
              status: { in: ["CONFIRMED", "ATTENDED"] },
              createdAt: { gte: monthStart },
              parentBooking: { userId: session.user.id },
            },
          });

          if (guestBookingsThisMonth + guests.length > pkg.monthlyGuestPasses) {
            const remaining = Math.max(0, pkg.monthlyGuestPasses - guestBookingsThisMonth);
            return NextResponse.json(
              { error: `Te quedan ${remaining} pase(s) de invitado este mes. Intentas agregar ${guests.length}.` },
              { status: 400 },
            );
          }
        }
      }

      // Check enough credits for self + all guests
      const creditsNeeded = totalPeople;
      const hasAllocations = userPackage.creditUsages.length > 0;
      if (hasAllocations) {
        const usage = userPackage.creditUsages.find((u) => u.classTypeId === classTypeId);
        const available = usage ? usage.creditsTotal - usage.creditsUsed : 0;
        if (available < creditsNeeded) {
          return NextResponse.json(
            { error: `Necesitas ${creditsNeeded} crédito(s) (tú + ${guests.length} invitado(s)), pero solo tienes ${available}.` },
            { status: 402 },
          );
        }
      } else if (userPackage.creditsTotal !== null) {
        const available = userPackage.creditsTotal - userPackage.creditsUsed;
        if (available < creditsNeeded) {
          return NextResponse.json(
            { error: `Necesitas ${creditsNeeded} crédito(s) (tú + ${guests.length} invitado(s)), pero solo tienes ${available}.` },
            { status: 402 },
          );
        }
      }
      // If creditsTotal is null → unlimited, no check needed (unless monthlyGuestPasses applies, already checked above)

      // Deduct credits: 1 for self + 1 per guest
      for (let i = 0; i < creditsNeeded; i++) {
        await deductCredit(userPackage.id, classTypeId);
      }
      creditsDeducted = creditsNeeded;
      creditsDeductedClassTypeId = classTypeId;
      packageUsedId = userPackage.id;
    }

    // Create main booking — if the insert fails (e.g. another booking grabbed
    // the spot first → P2002), restore any credits we already deducted so
    // the buyer doesn't lose them without getting a seat.
    let booking;
    try {
      booking = await prisma.booking.create({
        data: {
          tenantId: tenant.id,
          classId,
          userId: effectiveUserId,
          guestName: isGuest ? guestName : null,
          guestEmail: isGuest ? guestEmail : null,
          spotNumber: spotNumber ?? null,
          privacy: privacy === "PRIVATE" ? "PRIVATE" : "PUBLIC",
          status: "CONFIRMED",
          packageUsed: packageUsedId,
        },
        include: {
          class: {
            include: {
              classType: true,
              coach: { include: { user: { select: { name: true } } } },
            },
          },
        },
      });
    } catch (err) {
      if (packageUsedId && creditsDeducted > 0 && creditsDeductedClassTypeId) {
        for (let i = 0; i < creditsDeducted; i++) {
          await restoreCredit(packageUsedId, creditsDeductedClassTypeId).catch(
            (e) => console.error("Failed to restore credit on booking error", e),
          );
        }
      }
      throw err;
    }

    // Create guest bookings
    const guestBookings = [];
    for (const g of guests) {
      const gb = await prisma.booking.create({
        data: {
          tenantId: tenant.id,
          classId,
          userId: null,
          guestName: g.name.trim(),
          guestEmail: g.email.trim().toLowerCase(),
          spotNumber: g.spotNumber ?? null,
          privacy: privacy === "PRIVATE" ? "PRIVATE" : "PUBLIC",
          status: "CONFIRMED",
          packageUsed: packageUsedId,
          parentBookingId: booking.id,
        },
      });
      guestBookings.push(gb);
    }

    if (session?.user?.id) {
      removeSpotNotifyMe(classId, session.user.id);
    }

    if (packageUsedId) {
      await recognizeBookingSafe({
        userPackageId: packageUsedId,
        bookingId: booking.id,
        classId,
        scheduledAt: classData.startsAt,
        scope: "bookings",
      });
      for (const gb of guestBookings) {
        await recognizeBookingSafe({
          userPackageId: packageUsedId,
          bookingId: gb.id,
          classId,
          scheduledAt: classData.startsAt,
          scope: "bookings.guest",
        });
      }
    }

    // Push refreshed total_booked to Wellhub so their app reflects reality.
    // No-op for classes not synced to Wellhub.
    try {
      const { patchWellhubCapacityForClass } = await import("@/lib/platforms/wellhub");
      await patchWellhubCapacityForClass(classId);
    } catch (err) {
      console.error("[wellhub] capacity patch after booking create failed", err);
    }

    const baseUrl = getTenantBaseUrl(tenant.slug);
    const hideCoach = shouldHideCoach(tenant, classData);
    const emailCoachName = hideCoach ? null : (classData.coach.name ?? "Coach");

    // Send confirmation to the main booker. For the payment-authed guest
    // path we don't have a session OR a guestEmail (the booking row is
    // linked to the User), so resolve the email/name from the User record.
    let recipientEmail: string | null =
      session?.user?.email ?? guestEmail ?? null;
    let recipientName: string | null =
      session?.user?.name ?? guestName ?? null;
    if (!recipientEmail && effectiveUserId) {
      const u = await prisma.user.findUnique({
        where: { id: effectiveUserId },
        select: { email: true, name: true },
      });
      recipientEmail = u?.email ?? null;
      recipientName = u?.name ?? recipientName;
    }
    if (recipientEmail && recipientName) {
      sendBookingConfirmation({
        to: recipientEmail,
        name: recipientName,
        className: classData.classType.name,
        coachName: emailCoachName,
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.room.studio.name ?? undefined,
        timezone: classData.room.studio.city?.timezone,
        classUrl: `${baseUrl}/class/${classId}`,
      });
    }

    // Send confirmation emails to each guest
    for (const g of guests) {
      sendBookingConfirmation({
        to: g.email.trim().toLowerCase(),
        name: g.name.trim(),
        className: classData.classType.name,
        coachName: emailCoachName,
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.room.studio.name ?? undefined,
        timezone: classData.room.studio.city?.timezone,
        classUrl: `${baseUrl}/class/${classId}`,
      });
    }

    // Notify staff who opted in (per-admin) to a new-booking email.
    notifyAdminsOfNewBooking({
      tenantId: tenant.id,
      classId,
      memberName: recipientName ?? guestName ?? "—",
      baseUrl,
    }).catch((err) =>
      console.error("Admin booking notification failed:", err),
    );

    if (session?.user?.id) {
      updateLifecycle(session.user.id, tenant.id, "booked").catch(
        (err) => console.error("Lifecycle update (booked) failed:", err),
      );
    }

    if (session?.user?.id && privacy !== "PRIVATE") {
      const existingEvent = await prisma.feedEvent.findFirst({
        where: {
          tenantId: tenant.id,
          userId: session.user.id,
          eventType: "CLASS_RESERVED",
          payload: { path: ["classId"], equals: classId },
        },
        select: { id: true },
      });

      if (!existingEvent) {
        prisma.feedEvent
          .create({
            data: {
              tenantId: tenant.id,
              userId: session.user.id,
              eventType: "CLASS_RESERVED",
              visibility: "FRIENDS_ONLY",
              payload: {
                classId,
                className: classData.classType.name,
                classTypeColor: classData.classType.color,
                classTypeIcon: classData.classType.icon,
                coachName: hideCoach ? null : classData.coach.name,
                coachImage: hideCoach
                  ? null
                  : (classData.coach.photoUrl || classData.coach.user?.image),
                coachUserId: hideCoach ? null : classData.coach.userId,
                date: classData.startsAt.toISOString(),
                duration: classData.classType.duration,
              },
            },
          })
          .catch(() => {});
      }
    }

    // Expose the buyer's email so the /payment/success guest hand-off can
    // surface the login CTA on /class/[id] without an active session.
    let buyerEmail: string | null = booking.guestEmail ?? null;
    if (!buyerEmail && effectiveUserId) {
      const buyer = await prisma.user.findUnique({
        where: { id: effectiveUserId },
        select: { email: true },
      });
      buyerEmail = buyer?.email ?? null;
    }

    return NextResponse.json(
      { ...booking, guestBookings, userEmail: buyerEmail },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("POST /api/bookings error:", error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Ese lugar ya está ocupado. Selecciona otro." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Failed to create booking" },
      { status: 500 },
    );
  }
}
