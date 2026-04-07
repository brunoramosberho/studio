import { prisma } from "@/lib/db";
import type { PlatformType } from "@prisma/client";
import type { ParsedPlatformEmail } from "./parser";
import { createPlatformAlert } from "./alerts";

export async function processInboundEmail(
  parsed: ParsedPlatformEmail,
  tenantId: string,
  platform: PlatformType,
  rawEmail: string,
) {
  if (parsed.type === "unknown" || parsed.confidence === "low") {
    await createPlatformAlert({
      tenantId,
      platform,
      type: "unmatched_booking",
      className: parsed.className ?? undefined,
    });
    return { action: "ignored", reason: "low_confidence_or_unknown" };
  }

  if (parsed.type === "new_booking") {
    return handleNewBooking(parsed, tenantId, platform, rawEmail);
  }

  if (parsed.type === "cancellation") {
    return handleCancellation(parsed, tenantId, platform);
  }

  return { action: "ignored", reason: "unhandled_type" };
}

async function handleNewBooking(
  parsed: ParsedPlatformEmail,
  tenantId: string,
  platform: PlatformType,
  rawEmail: string,
) {
  const matchedClass = await findClassByParsedData(tenantId, parsed);

  if (!matchedClass) {
    await createPlatformAlert({
      tenantId,
      platform,
      type: "unmatched_booking",
      className: parsed.className ?? undefined,
    });
    return { action: "alert_created", reason: "no_matching_class" };
  }

  const booking = await prisma.platformBooking.create({
    data: {
      tenantId,
      classId: matchedClass.id,
      platform,
      platformBookingId: parsed.platformBookingId,
      memberName: parsed.memberName,
      status: "confirmed",
      rawEmail,
      parsedAt: new Date(),
    },
  });

  const quota = await prisma.schedulePlatformQuota.findUnique({
    where: { classId_platform: { classId: matchedClass.id, platform } },
  });

  if (quota) {
    const updated = await prisma.schedulePlatformQuota.update({
      where: { id: quota.id },
      data: { bookedSpots: { increment: 1 } },
    });

    if (updated.bookedSpots >= updated.quotaSpots) {
      await createPlatformAlert({
        tenantId,
        classId: matchedClass.id,
        platform,
        type: "quota_full",
        className: matchedClass.classType.name,
      });
    }
  }

  const totalBooked = await getTotalBookedForClass(matchedClass.id);
  if (totalBooked >= matchedClass.room.maxCapacity) {
    await createPlatformAlert({
      tenantId,
      classId: matchedClass.id,
      platform,
      type: "class_full",
      className: matchedClass.classType.name,
    });
  }

  return { action: "booking_created", bookingId: booking.id };
}

async function handleCancellation(
  parsed: ParsedPlatformEmail,
  tenantId: string,
  platform: PlatformType,
) {
  const matchedClass = await findClassByParsedData(tenantId, parsed);
  if (!matchedClass) {
    return { action: "ignored", reason: "no_matching_class_for_cancellation" };
  }

  const existingBooking = await prisma.platformBooking.findFirst({
    where: {
      tenantId,
      classId: matchedClass.id,
      platform,
      status: "confirmed",
      ...(parsed.platformBookingId
        ? { platformBookingId: parsed.platformBookingId }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!existingBooking) {
    return { action: "ignored", reason: "no_booking_to_cancel" };
  }

  await prisma.platformBooking.update({
    where: { id: existingBooking.id },
    data: { status: "cancelled" },
  });

  await prisma.schedulePlatformQuota.updateMany({
    where: {
      classId: matchedClass.id,
      platform,
      bookedSpots: { gt: 0 },
    },
    data: { bookedSpots: { decrement: 1 } },
  });

  const classFullAlert = await prisma.platformAlert.findFirst({
    where: {
      tenantId,
      classId: matchedClass.id,
      type: "class_full",
      isResolved: false,
    },
  });

  if (classFullAlert) {
    await createPlatformAlert({
      tenantId,
      classId: matchedClass.id,
      platform,
      type: "spot_freed",
      className: matchedClass.classType.name,
    });
  }

  return { action: "booking_cancelled", bookingId: existingBooking.id };
}

async function findClassByParsedData(
  tenantId: string,
  parsed: ParsedPlatformEmail,
) {
  if (!parsed.className || !parsed.date || !parsed.time) return null;

  const dayStart = new Date(`${parsed.date}T00:00:00`);
  const dayEnd = new Date(`${parsed.date}T23:59:59`);

  const classes = await prisma.class.findMany({
    where: {
      tenantId,
      startsAt: { gte: dayStart, lte: dayEnd },
      status: "SCHEDULED",
      classType: {
        name: { contains: parsed.className, mode: "insensitive" },
      },
    },
    include: { classType: true, room: true },
  });

  if (classes.length === 0) return null;

  if (parsed.time) {
    const [hours, minutes] = parsed.time.split(":").map(Number);
    const match = classes.find((c) => {
      const h = c.startsAt.getUTCHours();
      const m = c.startsAt.getUTCMinutes();
      return h === hours && m === minutes;
    });
    if (match) return match;
  }

  return classes[0];
}

async function getTotalBookedForClass(classId: string): Promise<number> {
  const [directCount, platformCount] = await Promise.all([
    prisma.booking.count({
      where: { classId, status: "CONFIRMED" },
    }),
    prisma.platformBooking.count({
      where: { classId, status: "confirmed" },
    }),
  ]);
  return directCount + platformCount;
}
