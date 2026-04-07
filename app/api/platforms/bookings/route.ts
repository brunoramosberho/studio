import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import type { PlatformType } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const { searchParams } = new URL(request.url);

    const platform = searchParams.get("platform") as PlatformType | null;
    const status = searchParams.get("status");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    const where: Record<string, unknown> = { tenantId: tenant.id };
    if (platform) where.platform = platform;
    if (status) where.status = status;

    if (dateFrom || dateTo) {
      const classFilter: Record<string, unknown> = {};
      if (dateFrom) classFilter.gte = new Date(dateFrom);
      if (dateTo) classFilter.lte = new Date(dateTo);
      where.class = { startsAt: classFilter };
    }

    const bookings = await prisma.platformBooking.findMany({
      where,
      include: {
        class: {
          include: {
            classType: { select: { name: true, color: true } },
            room: { select: { name: true } },
            coach: { include: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json(bookings);
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/platforms/bookings error:", error);
    return NextResponse.json({ error: "Failed to fetch bookings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { classId, platform, platformBookingId, memberName, notes } = body as {
      classId: string;
      platform: PlatformType;
      platformBookingId?: string;
      memberName?: string;
      notes?: string;
    };

    if (!classId || !platform) {
      return NextResponse.json({ error: "classId and platform are required" }, { status: 400 });
    }

    if (!["classpass", "gympass"].includes(platform)) {
      return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: tenant.id },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const booking = await prisma.platformBooking.create({
      data: {
        tenantId: tenant.id,
        classId,
        platform,
        platformBookingId: platformBookingId || null,
        memberName: memberName || null,
        notes: notes || null,
        status: "confirmed",
      },
    });

    await prisma.schedulePlatformQuota.updateMany({
      where: { classId, platform, tenantId: tenant.id },
      data: { bookedSpots: { increment: 1 } },
    });

    return NextResponse.json(booking, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("POST /api/platforms/bookings error:", error);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
