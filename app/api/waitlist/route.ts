import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { removeSpotNotifyMe } from "@/lib/waitlist";

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();

    const body = await request.json();
    const { classId, packageId } = body;

    if (!classId) {
      return NextResponse.json(
        { error: "classId is required" },
        { status: 400 },
      );
    }

    const classData = await prisma.class.findUnique({
      where: { id: classId, tenantId: tenant.id },
      include: {
        classType: true,
        room: true,
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

    const spotsLeft = classData.room.maxCapacity - classData._count.bookings;
    if (spotsLeft > 0) {
      return NextResponse.json(
        { error: "Class still has spots available. Book directly instead." },
        { status: 400 },
      );
    }

    const existingBooking = await prisma.booking.findFirst({
      where: {
        tenantId: tenant.id,
        classId,
        userId: session.user.id,
        status: "CONFIRMED",
      },
    });
    if (existingBooking) {
      return NextResponse.json(
        { error: "You already have a booking for this class" },
        { status: 409 },
      );
    }

    const existingEntry = await prisma.waitlist.findFirst({
      where: { classId, tenantId: tenant.id, userId: session.user.id },
    });
    if (existingEntry) {
      return NextResponse.json(
        { error: "Already on the waitlist for this class" },
        { status: 409 },
      );
    }

    // Find a valid package with available credits
    const userPackages = await prisma.userPackage.findMany({
      where: {
        userId: session.user.id,
        tenantId: tenant.id,
        expiresAt: { gt: new Date() },
      },
      include: { package: { include: { classTypes: { select: { id: true } } } } },
      orderBy: { expiresAt: "asc" },
    });

    const classTypeId = classData.classTypeId;
    function packageCoversClass(p: (typeof userPackages)[number]) {
      if (!p.package.classTypes.length) return true;
      return p.package.classTypes.some((ct) => ct.id === classTypeId);
    }

    let userPackage = null;

    if (packageId) {
      userPackage = userPackages.find(
        (p) =>
          p.id === packageId &&
          (p.creditsTotal === null || p.creditsUsed < p.creditsTotal) &&
          packageCoversClass(p),
      );
    }

    if (!userPackage) {
      userPackage = userPackages.find(
        (p) =>
          (p.creditsTotal === null || p.creditsUsed < p.creditsTotal) &&
          packageCoversClass(p),
      );
    }

    if (!userPackage) {
      return NextResponse.json(
        { error: "No valid package with available credits" },
        { status: 402 },
      );
    }

    await prisma.userPackage.update({
      where: { id: userPackage.id },
      data: { creditsUsed: { increment: 1 } },
    });

    const maxPosition = await prisma.waitlist.aggregate({
      where: { classId, tenantId: tenant.id },
      _max: { position: true },
    });

    const position = (maxPosition._max.position ?? 0) + 1;

    const entry = await prisma.waitlist.create({
      data: {
        tenantId: tenant.id,
        classId,
        userId: session.user.id,
        position,
        packageUsed: userPackage.id,
      },
    });

    removeSpotNotifyMe(classId, session.user.id);

    return NextResponse.json({ ...entry, waitlistCount: position }, { status: 201 });
  } catch (error) {
    console.error("POST /api/waitlist error:", error);
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 },
    );
  }
}
