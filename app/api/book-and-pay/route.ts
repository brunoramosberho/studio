import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { requireTenant } from "@/lib/tenant";
import { sendBookingConfirmation } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const session = await auth();
    const body = await request.json();
    const { email, name, packageId, classId, spotNumber, privacy } = body;

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
    });
    if (!pkg || !pkg.isActive) {
      return NextResponse.json({ error: "Paquete no encontrado" }, { status: 404 });
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId, tenantId: tenant.id },
      include: {
        classType: true,
        room: { include: { studio: true } },
        coach: { include: { user: { select: { name: true } } } },
        _count: { select: { bookings: { where: { status: "CONFIRMED" } } } },
      },
    });

    if (!classData) {
      return NextResponse.json({ error: "Clase no encontrada" }, { status: 404 });
    }
    if (classData.status === "CANCELLED") {
      return NextResponse.json({ error: "Esta clase fue cancelada" }, { status: 400 });
    }

    const spotsLeft = classData.room.maxCapacity - classData._count.bookings;
    if (spotsLeft <= 0) {
      return NextResponse.json({ error: "Clase llena", full: true }, { status: 409 });
    }

    if (spotNumber != null) {
      if (spotNumber < 1 || spotNumber > classData.room.maxCapacity) {
        return NextResponse.json({ error: "Número de lugar inválido" }, { status: 400 });
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

    if (!finalUserId) {
      let user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (!user) {
        user = await prisma.user.create({
          data: { email: email.toLowerCase(), name },
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

    // Atomic: create package + booking in a single transaction
    const purchasedAt = new Date();
    const expiresAt = new Date(purchasedAt);
    expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

    const { userPackage, booking } = await prisma.$transaction(async (tx) => {
      const up = await tx.userPackage.create({
        data: {
          tenantId: tenant.id,
          userId: finalUserId!,
          packageId: pkg.id,
          creditsTotal: pkg.credits,
          creditsUsed: 1,
          expiresAt,
          stripePaymentId: `sim_${Date.now()}`,
          purchasedAt,
        },
      });

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

    if (finalEmail && finalName) {
      sendBookingConfirmation({
        to: finalEmail,
        name: finalName,
        className: classData.classType.name,
        coachName: classData.coach.user.name ?? "Coach",
        date: classData.startsAt,
        startTime: classData.startsAt,
        location: classData.room.studio.name ?? undefined,
      }).catch(() => {});
    }

    if (privacy !== "PRIVATE") {
      prisma.feedEvent
        .create({
          data: {
            tenantId: tenant.id,
            userId: finalUserId!,
            eventType: "CLASS_RESERVED",
            visibility: "FRIENDS_ONLY",
            payload: {
              classId,
              className: classData.classType.name,
              coachName: classData.coach.user.name,
              date: classData.startsAt.toISOString(),
              duration: classData.classType.duration,
            },
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      spotNumber: booking.spotNumber,
      packageName: pkg.name,
      creditsTotal: pkg.credits,
      creditsUsed: 1,
    });
  } catch (error) {
    console.error("POST /api/book-and-pay error:", error);
    return NextResponse.json(
      { error: "Error al procesar la reserva" },
      { status: 500 },
    );
  }
}
