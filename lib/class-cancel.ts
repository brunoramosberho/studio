import { prisma } from "@/lib/db";
import { restoreCredit } from "@/lib/credits";
import { refundAndClearWaitlist } from "@/lib/waitlist";
import { sendClassCancelled } from "@/lib/email";
import { shouldHideCoach } from "@/lib/coach";

/**
 * Cancel a class and handle all side effects:
 * 1. Set class status to CANCELLED
 * 2. Refund credits for all confirmed bookings
 * 3. Send cancellation email to all booked users
 * 4. Refund and clear waitlist
 *
 * Returns the number of bookings that were refunded.
 */
export async function cancelClassWithRefunds(classId: string, tenantId: string): Promise<number> {
  const cls = await prisma.class.findFirst({
    where: { id: classId, tenantId },
    include: {
      classType: true,
      coach: { select: { name: true } },
      room: {
        include: {
          studio: {
            include: { city: { select: { timezone: true } } },
          },
        },
      },
      bookings: {
        where: { status: { in: ["CONFIRMED", "ATTENDED"] } },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
  });

  if (!cls) return 0;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { locale: true, hideCoachUntilClassEnds: true },
  });
  const hideCoach = shouldHideCoach(tenant, { endsAt: cls.endsAt });

  // 1. Cancel the class
  await prisma.class.update({
    where: { id: classId },
    data: { status: "CANCELLED" },
  });

  // 2. Refund credits + cancel bookings + send emails
  for (const booking of cls.bookings) {
    let creditRefunded = false;

    if (booking.packageUsed) {
      await restoreCredit(booking.packageUsed, cls.classTypeId);
      creditRefunded = true;
    }

    // Mark booking as cancelled with credit restored
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "CANCELLED", spotNumber: null, creditLost: false },
    });

    // Send email
    if (booking.user?.email) {
      sendClassCancelled({
        to: booking.user.email,
        name: booking.user.name ?? "Cliente",
        className: cls.classType.name,
        coachName: hideCoach ? null : cls.coach.name,
        date: cls.startsAt,
        startTime: cls.startsAt,
        location: cls.room?.studio?.name,
        timezone: cls.room?.studio?.city?.timezone,
        creditRefunded,
        locale: tenant?.locale,
      }).catch((err) => console.error(`Email to ${booking.user?.email} failed:`, err));
    }
  }

  // 3. Refund waitlist
  refundAndClearWaitlist(classId, tenantId).catch((err) =>
    console.error(`Waitlist refund for class ${classId} failed:`, err),
  );

  return cls.bookings.length;
}
