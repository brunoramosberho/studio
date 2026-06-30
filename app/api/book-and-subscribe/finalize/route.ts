import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getStripeClientForTenantId } from "@/lib/stripe/tenant-stripe";
import { ensureSubscriptionUserPackages } from "@/lib/credits";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { platformBookedNoCompanionWhere } from "@/lib/booking/availability";
import { sendBookingConfirmation, getTenantBaseUrl } from "@/lib/email";
import { shouldHideCoach } from "@/lib/coach";

/**
 * Completes an inline subscribe-and-book once the client confirms the first
 * payment: re-checks the subscription is active in Stripe (the webhook may not
 * have landed yet), materializes its bookable UserPackage, then books the class.
 * Idempotent — if the booking already exists (retry / double-submit) it's returned.
 */
export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const body = await request.json();
    const { subscriptionId, classId, spotNumber, privacy } = body as {
      subscriptionId?: string;
      classId?: string;
      spotNumber?: number | null;
      privacy?: string;
    };
    if (!subscriptionId || !classId) {
      return NextResponse.json({ error: "subscriptionId and classId are required" }, { status: 400 });
    }
    if (!tenant.stripeAccountId) {
      return NextResponse.json({ error: "El estudio no tiene pagos configurados." }, { status: 400 });
    }

    const memberSub = await prisma.memberSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });
    if (!memberSub || memberSub.tenantId !== tenant.id) {
      return NextResponse.json({ error: "Suscripción no encontrada" }, { status: 404 });
    }
    const userId = memberSub.userId;

    // Authoritative check against Stripe — don't book until the charge is in.
    const stripe = await getStripeClientForTenantId(tenant.id);
    const sub = await stripe.subscriptions.retrieve(subscriptionId, {
      stripeAccount: tenant.stripeAccountId,
    });
    if (!["active", "trialing"].includes(sub.status)) {
      return NextResponse.json(
        { error: "El pago aún no se confirma. Intenta de nuevo.", code: "payment_not_confirmed" },
        { status: 402 },
      );
    }
    if (memberSub.status !== sub.status) {
      await prisma.memberSubscription.update({ where: { id: memberSub.id }, data: { status: sub.status } });
    }

    // Materialize the bookable UserPackage for the now-active subscription.
    await ensureSubscriptionUserPackages(userId, tenant.id);
    const userPackage = await prisma.userPackage.findFirst({
      where: {
        userId,
        tenantId: tenant.id,
        packageId: memberSub.packageId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: "desc" },
      select: { id: true },
    });
    if (!userPackage) {
      return NextResponse.json({ error: "No se pudo activar la membresía." }, { status: 500 });
    }

    // Idempotent: a retry after the booking already landed just returns it.
    const already = await prisma.booking.findFirst({
      where: { classId, tenantId: tenant.id, userId, status: "CONFIRMED" },
      select: { id: true, spotNumber: true },
    });
    if (already) {
      return NextResponse.json({ success: true, bookingId: already.id, spotNumber: already.spotNumber });
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
    if (!classData) return NextResponse.json({ error: "Clase no encontrada" }, { status: 404 });
    if (classData.status === "CANCELLED") {
      return NextResponse.json({ error: "Esta clase fue cancelada" }, { status: 400 });
    }

    const blockedCount = await prisma.blockedSpot.count({ where: { classId } });
    const platformBooked = await prisma.platformBooking.count({ where: platformBookedNoCompanionWhere(classId) });
    if (classData.room.maxCapacity - classData._count.bookings - blockedCount - platformBooked <= 0) {
      return NextResponse.json({ error: "Clase llena", full: true }, { status: 409 });
    }
    if (spotNumber != null) {
      if (spotNumber < 1 || spotNumber > classData.room.maxCapacity) {
        return NextResponse.json({ error: "Número de lugar inválido" }, { status: 400 });
      }
      const taken = await prisma.booking.findFirst({
        where: { classId, tenantId: tenant.id, spotNumber, status: "CONFIRMED" },
      });
      if (taken) return NextResponse.json({ error: "Ese lugar ya está ocupado. Selecciona otro." }, { status: 409 });
    }

    const booking = await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        classId,
        userId,
        spotNumber: spotNumber ?? null,
        privacy: privacy === "PRIVATE" ? "PRIVATE" : "PUBLIC",
        status: "CONFIRMED",
        packageUsed: userPackage.id,
      },
    });

    await recognizeBookingSafe({
      userPackageId: userPackage.id,
      bookingId: booking.id,
      classId,
      scheduledAt: classData.startsAt,
      scope: "book-and-subscribe",
    });

    try {
      const { patchWellhubCapacityForClass } = await import("@/lib/platforms/wellhub");
      await patchWellhubCapacityForClass(classId);
    } catch (err) {
      console.error("[wellhub] capacity patch after book-and-subscribe failed", err);
    }

    const baseUrl = getTenantBaseUrl(tenant.slug);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (user?.email && user?.name) {
      const hideCoach = shouldHideCoach(tenant, classData);
      sendBookingConfirmation({
        to: user.email,
        name: user.name,
        className: classData.classType.name,
        coachName: hideCoach ? null : (classData.coach.name ?? "Coach"),
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.room.studio.name ?? undefined,
        timezone: classData.room.studio.city?.timezone,
        classUrl: `${baseUrl}/class/${classId}`,
      }).catch(() => {});
    }

    if (privacy !== "PRIVATE") {
      prisma.feedEvent
        .create({
          data: {
            tenantId: tenant.id,
            userId,
            eventType: "CLASS_RESERVED",
            visibility: "FRIENDS_ONLY",
            payload: {
              classId,
              className: classData.classType.name,
              classTypeColor: classData.classType.color,
              classTypeIcon: classData.classType.icon,
              coachName: classData.coach.name,
              coachImage: classData.coach.photoUrl || classData.coach.user?.image,
              coachUserId: classData.coach.userId,
              date: classData.startsAt.toISOString(),
              duration: classData.classType.duration,
            },
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({ success: true, bookingId: booking.id, spotNumber: booking.spotNumber });
  } catch (error) {
    console.error("POST /api/book-and-subscribe/finalize error:", error);
    return NextResponse.json({ error: "Error al confirmar la reserva" }, { status: 500 });
  }
}
