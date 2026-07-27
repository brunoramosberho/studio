import { prisma } from "@/lib/db";
import { formatTime } from "@/lib/utils";

/**
 * Members can't hold two bookings at DIFFERENT studios that overlap or leave
 * less than this travel buffer between them. Same-studio back-to-backs (or
 * overlaps) are untouched — the rule only exists because you can't physically
 * move between locations instantly.
 */
export const CROSS_STUDIO_BUFFER_MINUTES = 20;

export interface CrossStudioConflict {
  className: string;
  studioName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
}

/**
 * First CONFIRMED booking the user holds at another studio whose class
 * overlaps [startsAt, endsAt] expanded by the travel buffer on both sides.
 * Null when the new booking is fine.
 */
export async function findCrossStudioConflict(args: {
  tenantId: string;
  userId: string;
  studioId: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<CrossStudioConflict | null> {
  const buffer = CROSS_STUDIO_BUFFER_MINUTES * 60_000;
  const conflict = await prisma.booking.findFirst({
    where: {
      tenantId: args.tenantId,
      userId: args.userId,
      status: "CONFIRMED",
      class: {
        status: "SCHEDULED",
        startsAt: { lt: new Date(args.endsAt.getTime() + buffer) },
        endsAt: { gt: new Date(args.startsAt.getTime() - buffer) },
        room: { studioId: { not: args.studioId } },
      },
    },
    select: {
      class: {
        select: {
          startsAt: true,
          endsAt: true,
          classType: { select: { name: true } },
          room: {
            select: {
              studio: {
                select: {
                  name: true,
                  city: { select: { timezone: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { class: { startsAt: "asc" } },
  });
  if (!conflict) return null;
  return {
    className: conflict.class.classType.name,
    studioName: conflict.class.room.studio.name,
    startsAt: conflict.class.startsAt,
    endsAt: conflict.class.endsAt,
    timezone: conflict.class.room.studio.city?.timezone ?? "Europe/Madrid",
  };
}

/** User-facing (Spanish) explanation, matching the API error convention. */
export function crossStudioConflictMessage(c: CrossStudioConflict): string {
  return (
    `Ya tienes ${c.className} reservada en ${c.studioName} de ` +
    `${formatTime(c.startsAt, c.timezone)} a ${formatTime(c.endsAt, c.timezone)}. ` +
    `Entre clases en estudios distintos necesitas al menos ` +
    `${CROSS_STUDIO_BUFFER_MINUTES} minutos de traslado. ` +
    `Cancela esa reserva o elige otro horario.`
  );
}
