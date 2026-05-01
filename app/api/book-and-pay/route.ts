import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { sendBookingConfirmation, sendWelcomeEmail, getTenantBaseUrl } from "@/lib/email";
import { createMemberPayment } from "@/lib/stripe/payments";
import { userHasOpenDebt } from "@/lib/billing/debt";
import { recognizeBookingSafe } from "@/lib/revenue/hooks";
import { shouldHideCoach } from "@/lib/coach";

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const session = await auth();
    const body = await request.json();
    const { packageId, classId, spotNumber, privacy, paymentMethodId } = body;
    const email = body.email?.trim().toLowerCase() ?? null;
    const name = body.name?.trim().replace(/\S+/g, (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()) ?? null;
    const phone = body.phone?.trim() || null;

    if (!classId || !packageId) {
      return NextResponse.json(
        { error: "classId and packageId are required" },
        { status: 400 },
      );
    }

    const userId = session?.user?.id ?? null;

    if (!userId && (!email || !name)) {
      return NextResponse.json(
        { error: "email and name are required for new users" },
        { status: 400 },
      );
    }

    const pkg = await prisma.package.findUnique({
      where: { id: packageId, tenantId: tenant.id },
      include: { creditAllocations: true },
    });
    if (!pkg || !pkg.isActive) {
      return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 });
    }

    if (pkg.type === "SUBSCRIPTION") {
      return NextResponse.json(
        {
          error:
            "Este plan se contrata como suscripción. Reserva con un pase suelto o paquete de clases.",
          code: "use_subscription_flow",
        },
        { status: 400 },
      );
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
      return NextResponse.json({ error: "Clase no encontrada" }, { status: 404 });
    }
    if (classData.status === "CANCELLED") {
      return NextResponse.json({ error: "Esta clase fue cancelada" }, { status: 400 });
    }

    const blockedCount = await prisma.blockedSpot.count({ where: { classId } });
    const spotsLeft = classData.room.maxCapacity - classData._count.bookings - blockedCount;
    if (spotsLeft <= 0) {
      return NextResponse.json({ error: "Clase llena", full: true }, { status: 409 });
    }

    if (spotNumber != null) {
      if (spotNumber < 1 || spotNumber > classData.room.maxCapacity) {
        return NextResponse.json({ error: "Número de lugar inválido" }, { status: 400 });
      }

      const spotBlocked = await prisma.blockedSpot.findFirst({
        where: { classId, spotNumber },
      });
      if (spotBlocked) {
        return NextResponse.json(
          { error: "Ese lugar está bloqueado. Selecciona otro." },
          { status: 409 },
        );
      }

      const spotTaken = await prisma.booking.findFirst({
        where: { classId, tenantId: tenant.id, spotNumber, status: "CONFIRMED" },
      });
      if (spotTaken) {
        return NextResponse.json(
          { error: "Ese lugar ya está ocupado. Selecciona otro." },
          { status: 409 },
        );
      }
    }

    let finalUserId = userId;
    let finalEmail = session?.user?.email ?? email;
    let finalName = session?.user?.name ?? name;
    let isNewUser = false;

    if (!finalUserId) {
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        user = await prisma.user.create({
          data: { email, name, phone },
        });
        isNewUser = true;
      } else if (phone && !user.phone) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { phone },
        });
      }
      finalUserId = user.id;
      finalEmail = user.email;
      finalName = user.name ?? name;
    }

    const existingBooking = await prisma.booking.findFirst({
      where: { classId, tenantId: tenant.id, userId: finalUserId, status: "CONFIRMED" },
    });
    if (existingBooking) {
      return NextResponse.json(
        { error: "Ya tienes una reserva para esta clase" },
        { status: 409 },
      );
    }

    if (finalUserId && (await userHasOpenDebt(finalUserId, tenant.id))) {
      return NextResponse.json(
        {
          error:
            "Tienes un saldo pendiente con el estudio. Contacta a administración para resolverlo antes de reservar.",
        },
        { status: 403 },
      );
    }

    // Atomic: create package + booking in a single transaction
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

    const needsPayment = !!tenant.stripeAccountId && pkg.price > 0;
    const stripePaymentId = needsPayment ? "pending_stripe" : `sim_${Date.now()}`;
    const initialStatus = needsPayment ? "PENDING_PAYMENT" : "ACTIVE";

    const hasAllocations = pkg.creditAllocations.length > 0;

    const { userPackage, booking } = await prisma.$transaction(async (tx) => {
      const up = await tx.userPackage.create({
        data: {
          tenantId: tenant.id,
          userId: finalUserId!,
          packageId: pkg.id,
          creditsTotal: hasAllocations ? null : pkg.credits,
          creditsUsed: hasAllocations ? 0 : 1,
          expiresAt,
          stripePaymentId,
          status: initialStatus,
          purchasedAt,
        },
      });

      if (hasAllocations) {
        await tx.userPackageCreditUsage.createMany({
          data: pkg.creditAllocations.map((a) => ({
            userPackageId: up.id,
            classTypeId: a.classTypeId,
            creditsTotal: a.credits,
            creditsUsed: a.classTypeId === classData.classTypeId ? 1 : 0,
          })),
        });
      }

      const bk = await tx.booking.create({
        data: {
          tenantId: tenant.id,
          classId,
          userId: finalUserId!,
          spotNumber: spotNumber ?? null,
          privacy: privacy === "PRIVATE" ? "PRIVATE" : "PUBLIC",
          status: "CONFIRMED",
          packageUsed: up.id,
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

      return { userPackage: up, booking: bk };
    });

    await recognizeBookingSafe({
      userPackageId: userPackage.id,
      bookingId: booking.id,
      classId,
      scheduledAt: classData.startsAt,
      scope: "book-and-pay",
    });

    // Create PaymentIntent if studio has Stripe Connect
    let paymentData: {
      clientSecret: string | null;
      stripeAccountId: string | null;
      amount: number;
    } | null = null;

    if (tenant.stripeAccountId && pkg.price > 0 && finalUserId) {
      try {
        const pi = await createMemberPayment({
          tenantId: tenant.id,
          memberId: finalUserId,
          amountInCurrency: pkg.price,
          type: "class",
          referenceId: userPackage.id,
          description: `Clase ${classData.classType.name} + ${pkg.name}`,
          paymentMethodId,
        });
        if (paymentMethodId && pi.status === "succeeded") {
          await prisma.userPackage.update({
            where: { id: userPackage.id },
            data: { status: "ACTIVE", stripePaymentId: pi.id },
          });
          paymentData = null;
        } else {
          paymentData = {
            clientSecret: pi.client_secret,
            stripeAccountId: tenant.stripeAccountId,
            amount: pkg.price,
          };
        }
      } catch (e) {
        console.error("Stripe payment creation failed:", e);
      }
    }

    const baseUrl = getTenantBaseUrl(tenant.slug);

    if (finalEmail && finalName) {
      const hideCoach = shouldHideCoach(tenant, classData);
      sendBookingConfirmation({
        to: finalEmail,
        name: finalName,
        className: classData.classType.name,
        coachName: hideCoach ? null : (classData.coach.name ?? "Coach"),
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.room.studio.name ?? undefined,
        timezone: classData.room.studio.city?.timezone,
        classUrl: `${baseUrl}/class/${classId}`,
      }).catch(() => {});

      if (isNewUser) {
        sendWelcomeEmail({
          to: finalEmail,
          name: finalName,
          appUrl: `${baseUrl}/my`,
        }).catch(() => {});
      }
    }

    if (privacy !== "PRIVATE" && finalUserId) {
      const existingEvent = await prisma.feedEvent.findFirst({
        where: {
          tenantId: tenant.id,
          userId: finalUserId,
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
              userId: finalUserId,
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
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      spotNumber: booking.spotNumber,
      packageName: pkg.name,
      creditsTotal: pkg.credits,
      creditsUsed: 1,
      ...(paymentData && {
        requiresPayment: true,
        clientSecret: paymentData.clientSecret,
        stripeAccountId: paymentData.stripeAccountId,
        amount: paymentData.amount,
      }),
    });
  } catch (error) {
    console.error("POST /api/book-and-pay error:", error);
    return NextResponse.json(
      { error: "Error al procesar la reserva" },
      { status: 500 },
    );
  }
}
