import { prisma } from "./db";
import { sendAdminBookingNotification } from "./email";

/**
 * Email staff who opted in (Membership.notifyEmailOnBooking) about a new client
 * booking. Per-admin, off by default — enabling it for one admin never emails
 * the rest. Fire-and-forget: callers should not await the result on the hot
 * path (wrap in .catch()).
 */
export async function notifyAdminsOfNewBooking(params: {
  tenantId: string;
  classId: string;
  baseUrl: string;
  /** The member who booked. Pass `memberName` directly or `memberId` to resolve it. */
  memberName?: string;
  memberId?: string | null;
}): Promise<void> {
  const { tenantId, classId, baseUrl } = params;

  const recipients = await prisma.membership.findMany({
    where: {
      tenantId,
      notifyEmailOnBooking: true,
      role: { in: ["ADMIN", "FRONT_DESK"] },
    },
    select: { user: { select: { email: true, locale: true } } },
  });
  if (recipients.length === 0) return;

  // Resolve the member name only once we know someone opted in.
  let memberName = params.memberName?.trim() || "";
  if (!memberName && params.memberId) {
    const u = await prisma.user.findUnique({
      where: { id: params.memberId },
      select: { name: true },
    });
    memberName = u?.name ?? "";
  }
  if (!memberName) memberName = "—";

  const cls = await prisma.class.findFirst({
    where: { id: classId, tenantId },
    select: {
      startsAt: true,
      classType: { select: { name: true } },
      coach: { select: { name: true } },
      room: {
        select: {
          studio: {
            select: { name: true, city: { select: { timezone: true } } },
          },
        },
      },
    },
  });
  if (!cls) return;

  const className = cls.classType.name;
  const coachName = cls.coach?.name ?? null;
  const location = cls.room?.studio?.name ?? undefined;
  const timezone = cls.room?.studio?.city?.timezone ?? undefined;
  const classUrl = `${baseUrl}/class/${classId}`;

  await Promise.all(
    recipients
      .filter((r) => r.user?.email)
      .map((r) =>
        sendAdminBookingNotification({
          to: r.user!.email,
          memberName,
          className,
          coachName,
          date: cls.startsAt,
          startTime: cls.startsAt,
          location,
          timezone,
          classUrl,
          tenantId,
          locale: r.user!.locale ?? undefined,
        }),
      ),
  );
}
