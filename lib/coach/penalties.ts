import type { CoachPenaltyType } from "@prisma/client";

/** Prisma include for loading a penalty with the bits the admin UI shows. */
export const penaltyInclude = {
  createdBy: { select: { name: true } },
  class: {
    select: {
      id: true,
      startsAt: true,
      classType: { select: { name: true } },
      room: { select: { studio: { select: { name: true } } } },
    },
  },
} as const;

export interface PenaltyWithRels {
  id: string;
  coachProfileId?: string;
  type: CoachPenaltyType;
  note: string | null;
  amountCents: number | null;
  currency: string | null;
  occurredAt: Date;
  createdAt: Date;
  createdBy: { name: string | null } | null;
  class: {
    id: string;
    startsAt: Date;
    classType: { name: string } | null;
    room: { studio: { name: string } | null } | null;
  } | null;
}

export interface SerializedPenalty {
  id: string;
  type: CoachPenaltyType;
  note: string | null;
  amountCents: number | null;
  currency: string | null;
  occurredAt: string;
  createdAt: string;
  createdByName: string | null;
  class: {
    id: string;
    startsAt: string;
    classTypeName: string | null;
    studioName: string | null;
  } | null;
}

export function serializePenalty(p: PenaltyWithRels): SerializedPenalty {
  return {
    id: p.id,
    type: p.type,
    note: p.note,
    amountCents: p.amountCents,
    currency: p.currency,
    occurredAt: p.occurredAt.toISOString(),
    createdAt: p.createdAt.toISOString(),
    createdByName: p.createdBy?.name ?? null,
    class: p.class
      ? {
          id: p.class.id,
          startsAt: p.class.startsAt.toISOString(),
          classTypeName: p.class.classType?.name ?? null,
          studioName: p.class.room?.studio?.name ?? null,
        }
      : null,
  };
}
