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
      select: { id: true },
    });
    if (link) {
      await prisma.wellhubUserLink.update({
        where: { id: link.id },
        data: { userId: user.id, userLinkedAt: new Date(), linkedVia: "email_match" },
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
      select: { id: true },
      take: 2,
    });
    if (matches.length === 1) {
      await prisma.wellhubUserLink.update({
        where: { id: matches[0].id },
        data: { userId: user.id, userLinkedAt: new Date(), linkedVia: "phone_match" },
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
