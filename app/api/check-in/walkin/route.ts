import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/tenant";
import {
  findPackageForClass,
  deductCredit,
  userPackageIncludeForBooking,
} from "@/lib/credits";

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRole("ADMIN");
    const { classId, memberId, force, skipCreditCheck, skipWaiverCheck, spotNumber } = await request.json();

    if (!classId || !memberId) {
      return NextResponse.json({ error: "classId and memberId are required" }, { status: 400 });
    }

    const cls = await prisma.class.findFirst({
      where: { id: classId, tenantId: ctx.tenant.id },
      include: {
        classType: { select: { id: true, name: true } },
        room: { select: { maxCapacity: true } },
        _count: {
          select: { bookings: { where: { status: { in: ["CONFIRMED", "ATTENDED"] } } } },
        },
      },
    });
    if (!cls) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const existingBooking = await prisma.booking.findFirst({
      where: { classId, userId: memberId, status: { in: ["CONFIRMED", "ATTENDED"] } },
    });
    if (existingBooking) {
      return NextResponse.json({ error: "Member already enrolled" }, { status: 409 });
    }

    const isFull = cls._count.bookings >= cls.room.maxCapacity;
    if (isFull && !force) {
      return NextResponse.json(
        { error: "Class is full", requiresConfirmation: true },
        { status: 409 },
      );
    }

    // Check credits first so lack of credits opens POS (waiver shouldn't block a sale)
    if (!skipCreditCheck) {
      const userPackages = await prisma.userPackage.findMany({
        where: {
          userId: memberId,
          tenantId: ctx.tenant.id,
          expiresAt: { gt: new Date() },
        },
        include: userPackageIncludeForBooking,
        orderBy: { expiresAt: "asc" },
      });

      const matchingPackage = findPackageForClass(
        userPackages,
        cls.classTypeId,
      );

      if (!matchingPackage) {
        const member = await prisma.user.findUnique({
          where: { id: memberId },
          select: { id: true, name: true, email: true, phone: true, image: true },
        });

        return NextResponse.json({
          error: "No credits available",
          noCredits: true,
          member: member
            ? { id: member.id, name: member.name, email: member.email, phone: member.phone, image: member.image }
            : null,
          classInfo: {
            id: cls.id,
            classTypeId: cls.classType.id,
            classTypeName: cls.classType.name,
            startsAt: cls.startsAt.toISOString(),
          },
        }, { status: 402 });
      }

      // Has credits — now check waiver before allowing check-in
      if (!skipWaiverCheck) {
        const activeWaiver = await prisma.waiver.findFirst({
          where: { tenantId: ctx.tenant.id, status: "active" },
          select: { id: true, version: true, blockCheckinWithoutSignature: true },
          orderBy: { version: "desc" },
        });

        if (activeWaiver?.blockCheckinWithoutSignature) {
          const signature = await prisma.waiverSignature.findFirst({
            where: { memberId, waiver: { tenantId: ctx.tenant.id, status: "active" } },
            select: { waiverVersion: true },
            orderBy: { waiverVersion: "desc" },
          });

          const waiverPending = !signature || signature.waiverVersion < activeWaiver.version;
          if (waiverPending) {
            return NextResponse.json({
              error: "Waiver not signed",
              waiverPending: true,
              memberId,
            }, { status: 403 });
          }
        }
      }

      await deductCredit(matchingPackage.id, cls.classTypeId);

      const booking = await prisma.booking.create({
        data: {
          classId,
          userId: memberId,
          tenantId: ctx.tenant.id,
          status: "ATTENDED",
          packageUsed: matchingPackage.id,
          privacy: "PUBLIC",
          spotNumber: spotNumber ?? null,
        },
      });

      const now = new Date();
      const checkIn = await prisma.checkIn.create({
        data: {
          tenantId: ctx.tenant.id,
          classId,
          memberId,
          checkedInBy: ctx.session.user.id,
          method: "manual",
          status: now > cls.startsAt ? "late" : "present",
        },
      });

      return NextResponse.json({ booking, checkIn, creditDeducted: true }, { status: 201 });
    }

    // skipCreditCheck path (after POS payment) — still check waiver
    if (!skipWaiverCheck) {
      const activeWaiver = await prisma.waiver.findFirst({
        where: { tenantId: ctx.tenant.id, status: "active" },
        select: { id: true, version: true, blockCheckinWithoutSignature: true },
        orderBy: { version: "desc" },
      });

      if (activeWaiver?.blockCheckinWithoutSignature) {
        const signature = await prisma.waiverSignature.findFirst({
          where: { memberId, waiver: { tenantId: ctx.tenant.id, status: "active" } },
          select: { waiverVersion: true },
          orderBy: { waiverVersion: "desc" },
        });

        const waiverPending = !signature || signature.waiverVersion < activeWaiver.version;
        if (waiverPending) {
          return NextResponse.json({
            error: "Waiver not signed",
            waiverPending: true,
            memberId,
          }, { status: 403 });
        }
      }
    }

    const booking = await prisma.booking.create({
      data: {
        classId,
        userId: memberId,
        tenantId: ctx.tenant.id,
        status: "ATTENDED",
        spotNumber: spotNumber ?? null,
      },
    });

    const now = new Date();
    const checkIn = await prisma.checkIn.create({
      data: {
        tenantId: ctx.tenant.id,
        classId,
        memberId,
        checkedInBy: ctx.session.user.id,
        method: "manual",
        status: now > cls.startsAt ? "late" : "present",
      },
    });

    return NextResponse.json({ booking, checkIn }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden", "Not a member of this studio", "Tenant not found"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: error.message === "Unauthorized" ? 401 : 403 });
    }
    console.error("POST /api/check-in/walkin error:", error);
    return NextResponse.json({ error: "Failed to add walk-in" }, { status: 500 });
  }
}
