// Bridge Wellhub-only visitors to Magic Users when they signal a shared
// identity. We do not auto-create Magic Users; the link only fires when a
// User with a Membership for this tenant ALREADY exists with the same email
// (or phone) we received from Wellhub.
//
// Two entry points feed the same helper:
//   1. Webhooks update `WellhubUserLink` with new profile data → we attempt
//      to link to an existing Magic User.
//   2. A new `Membership` is created (Magic side) → we check if there is a
//      WellhubUserLink waiting for this email.
//
// Matching is conservative: email match is "high signal", phone match is
// fallback. We never overwrite an existing `userId` on the link.

import { prisma } from "@/lib/db";

export type LinkReason = "email_match" | "phone_match" | "manual";

interface LinkOutcome {
  linked: boolean;
  via?: LinkReason;
  wellhubUserLinkId?: string;
  userId?: string;
}

/**
 * Try to associate a freshly-updated WellhubUserLink with an existing Magic
 * User in the same tenant. Returns silently when nothing to do.
 */
export async function tryLinkWellhubUserToMagic(opts: {
  tenantId: string;
  wellhubUniqueToken: string;
}): Promise<LinkOutcome> {
  const link = await prisma.wellhubUserLink.findUnique({
    where: {
      tenantId_wellhubUniqueToken: {
        tenantId: opts.tenantId,
        wellhubUniqueToken: opts.wellhubUniqueToken,
      },
    },
  });
  if (!link) return { linked: false };
  if (link.userId) return { linked: false }; // already linked

  if (!link.email && !link.phone) return { linked: false };

  // Email is the high-signal channel. Email rows on User are globally unique
  // but we still gate on a Membership for this tenant so cross-tenant users
  // don't get auto-attached.
  if (link.email) {
    const user = await prisma.user.findUnique({
      where: { email: link.email.toLowerCase() },
      select: {
        id: true,
        memberships: {
          where: { tenantId: opts.tenantId },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (user?.memberships?.length) {
      await prisma.wellhubUserLink.update({
        where: { id: link.id },
        data: { userId: user.id, userLinkedAt: new Date(), linkedVia: "email_match" },
      });
      await attributeWellhubBookingsToUser({
        tenantId: opts.tenantId,
        userId: user.id,
        wellhubUniqueToken: opts.wellhubUniqueToken,
      });
      return { linked: true, via: "email_match", wellhubUserLinkId: link.id, userId: user.id };
    }
  }

  // Phone fallback. User.phone is not unique in the schema, so we only act
  // when exactly one User in this tenant has the same phone.
  if (link.phone) {
    const candidates = await prisma.user.findMany({
      where: {
        phone: link.phone,
        memberships: { some: { tenantId: opts.tenantId } },
      },
      select: { id: true },
      take: 2,
    });
    if (candidates.length === 1) {
      await prisma.wellhubUserLink.update({
        where: { id: link.id },
        data: { userId: candidates[0].id, userLinkedAt: new Date(), linkedVia: "phone_match" },
      });
      await attributeWellhubBookingsToUser({
        tenantId: opts.tenantId,
        userId: candidates[0].id,
        wellhubUniqueToken: opts.wellhubUniqueToken,
      });
      return {
        linked: true,
        via: "phone_match",
        wellhubUserLinkId: link.id,
        userId: candidates[0].id,
      };
    }
  }

  return { linked: false };
}

/**
 * Called when a Magic Membership is created/refreshed. Looks for any unlinked
 * WellhubUserLink rows in this tenant whose email matches the User and binds
 * them. Idempotent.
 */
export async function tryLinkMagicUserToWellhub(opts: {
  tenantId: string;
  userId: string;
}): Promise<LinkOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: opts.userId },
    select: { id: true, email: true, phone: true },
  });
  if (!user?.email && !user?.phone) return { linked: false };

  if (user?.email) {
    const link = await prisma.wellhubUserLink.findFirst({
      where: {
        tenantId: opts.tenantId,
        userId: null,
        email: { equals: user.email, mode: "insensitive" },
      },
      select: { id: true, wellhubUniqueToken: true },
    });
    if (link) {
      await prisma.wellhubUserLink.update({
        where: { id: link.id },
        data: { userId: user.id, userLinkedAt: new Date(), linkedVia: "email_match" },
      });
      await attributeWellhubBookingsToUser({
        tenantId: opts.tenantId,
        userId: user.id,
        wellhubUniqueToken: link.wellhubUniqueToken,
      });
      return { linked: true, via: "email_match", wellhubUserLinkId: link.id, userId: user.id };
    }
  }

  if (user?.phone) {
    const matches = await prisma.wellhubUserLink.findMany({
      where: {
        tenantId: opts.tenantId,
        userId: null,
        phone: user.phone,
      },
      select: { id: true, wellhubUniqueToken: true },
      take: 2,
    });
    if (matches.length === 1) {
      await prisma.wellhubUserLink.update({
        where: { id: matches[0].id },
        data: { userId: user.id, userLinkedAt: new Date(), linkedVia: "phone_match" },
      });
      await attributeWellhubBookingsToUser({
        tenantId: opts.tenantId,
        userId: user.id,
        wellhubUniqueToken: matches[0].wellhubUniqueToken,
      });
      return {
        linked: true,
        via: "phone_match",
        wellhubUserLinkId: matches[0].id,
        userId: user.id,
      };
    }
  }

  return { linked: false };
}

/**
 * Once a Wellhub identity is bound to a Magic User, attribute that identity's
 * bookings — past and upcoming — to the user, so their Wellhub history, streak,
 * gamification and class photos behave like any other member's. Idempotent: only
 * touches rows still unattributed (`userId: null`).
 *
 * Money deliberately stays out of it. These Bookings keep their
 * `platformBookingId`, which every penalty / credit / revenue path uses to skip
 * them — Wellhub settles on its own rail. Cancelling also stays blocked: the
 * booking is owned by Wellhub, not by us.
 */
export async function attributeWellhubBookingsToUser(opts: {
  tenantId: string;
  userId: string;
  wellhubUniqueToken: string;
}): Promise<number> {
  const platformBookings = await prisma.platformBooking.findMany({
    where: {
      tenantId: opts.tenantId,
      wellhubUserUniqueToken: opts.wellhubUniqueToken,
    },
    select: { id: true },
  });
  if (platformBookings.length === 0) return 0;

  const candidates = await prisma.booking.findMany({
    where: {
      tenantId: opts.tenantId,
      userId: null,
      platformBookingId: { in: platformBookings.map((p) => p.id) },
    },
    select: { id: true, classId: true },
  });
  if (candidates.length === 0) return 0;

  // Skip classes the member already holds a booking for. Taking two seats in
  // one class is legitimate (a member paying for a friend books a second spot),
  // but attributing the partner seat on top would show the class twice in their
  // history, count twice towards progress, and make check-in's findFirst pick
  // one at random.
  const own = await prisma.booking.findMany({
    where: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      classId: { in: candidates.map((c) => c.classId) },
    },
    select: { classId: true },
  });
  const taken = new Set(own.map((b) => b.classId));
  const ids = candidates.filter((c) => !taken.has(c.classId)).map((c) => c.id);
  if (ids.length === 0) return 0;

  const res = await prisma.booking.updateMany({
    where: { id: { in: ids } },
    data: { userId: opts.userId },
  });
  return res.count;
}
