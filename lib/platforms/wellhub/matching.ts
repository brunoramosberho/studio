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
//
// A third channel sits between the two: `WellhubEmailClaim` — an alternate
// email (usually corporate) the member proved they own via a one-time code
// from the profile's "Connected apps". Claim matches rank with email matches
// but are stamped `email_claim` so the conversion funnel can tell them apart.

import { prisma } from "@/lib/db";

export type LinkReason = "email_match" | "phone_match" | "manual" | "email_claim";

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

    // No login-email match — maybe a member claimed this address as their
    // Wellhub email (corporate address flow). Same membership gate applies.
    const claim = await prisma.wellhubEmailClaim.findUnique({
      where: { email: link.email.toLowerCase() },
      select: {
        userId: true,
        user: {
          select: {
            memberships: {
              where: { tenantId: opts.tenantId },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    if (claim?.user?.memberships?.length) {
      await prisma.wellhubUserLink.update({
        where: { id: link.id },
        data: { userId: claim.userId, userLinkedAt: new Date(), linkedVia: "email_claim" },
      });
      await attributeWellhubBookingsToUser({
        tenantId: opts.tenantId,
        userId: claim.userId,
        wellhubUniqueToken: opts.wellhubUniqueToken,
      });
      return { linked: true, via: "email_claim", wellhubUserLinkId: link.id, userId: claim.userId };
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

  // Claimed alternate emails (verified via one-time code) rank with the login
  // email — bind any waiting Wellhub identity carrying one of them.
  const claims = await prisma.wellhubEmailClaim.findMany({
    where: { userId: opts.userId },
    select: { email: true },
  });
  if (claims.length) {
    const link = await prisma.wellhubUserLink.findFirst({
      where: {
        tenantId: opts.tenantId,
        userId: null,
        email: { in: claims.map((c) => c.email), mode: "insensitive" },
      },
      select: { id: true, wellhubUniqueToken: true },
    });
    if (link) {
      await prisma.wellhubUserLink.update({
        where: { id: link.id },
        data: { userId: opts.userId, userLinkedAt: new Date(), linkedVia: "email_claim" },
      });
      await attributeWellhubBookingsToUser({
        tenantId: opts.tenantId,
        userId: opts.userId,
        wellhubUniqueToken: link.wellhubUniqueToken,
      });
      return { linked: true, via: "email_claim", wellhubUserLinkId: link.id, userId: opts.userId };
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
export interface ClaimWellhubEmailResult {
  ok: boolean;
  /** Set when ok=false. */
  reason?: "claimed_by_other";
  /** WellhubUserLink rows bound by this call, across all the user's tenants. */
  linkedIdentities: number;
  /** Bookings attributed by this call in the tenant the flow ran on. */
  attributedBookings: number;
  /** True when, after this call, the current tenant has a bound identity. */
  linkedInTenant: boolean;
  /** Tenants where something changed — callers recompute progress for these. */
  affectedTenantIds: string[];
}

/**
 * Member-initiated door: the user proved (one-time code) that they own
 * `email`, typically the corporate address their employer registered on
 * Wellhub. Persists the claim so future webhook traffic auto-links, and
 * immediately binds any waiting Wellhub identities with that address in every
 * tenant the user belongs to.
 *
 * Progress/achievements recompute is the caller's job (see the verify route) —
 * this module stays free of gamification imports, like the other doors.
 */
export async function claimWellhubEmailForUser(opts: {
  userId: string;
  /** Normalized (trimmed + lowercased) address. */
  email: string;
  /** Tenant the flow ran on — scopes the counts reported back to the member. */
  tenantId: string;
}): Promise<ClaimWellhubEmailResult> {
  const none: Omit<ClaimWellhubEmailResult, "ok" | "reason"> = {
    linkedIdentities: 0,
    attributedBookings: 0,
    linkedInTenant: false,
    affectedTenantIds: [],
  };

  const existing = await prisma.wellhubEmailClaim.findUnique({
    where: { email: opts.email },
    select: { userId: true },
  });
  if (existing && existing.userId !== opts.userId) {
    return { ok: false, reason: "claimed_by_other", ...none };
  }
  if (!existing) {
    try {
      await prisma.wellhubEmailClaim.create({
        data: { userId: opts.userId, email: opts.email },
      });
    } catch (err) {
      // Unique race: someone else claimed between the read and the write.
      const isUniqueViolation =
        typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
      if (!isUniqueViolation) throw err;
      const winner = await prisma.wellhubEmailClaim.findUnique({
        where: { email: opts.email },
        select: { userId: true },
      });
      if (winner && winner.userId !== opts.userId) {
        return { ok: false, reason: "claimed_by_other", ...none };
      }
    }
  }

  // Bind every waiting identity with this address in tenants the user belongs
  // to. The Wellhub account is platform-wide, so a corporate email verified at
  // one studio is just as valid at their other studios.
  const memberships = await prisma.membership.findMany({
    where: { userId: opts.userId },
    select: { tenantId: true },
  });
  const tenantIds = memberships.map((m) => m.tenantId);

  let linkedIdentities = 0;
  let attributedBookings = 0;
  const affected = new Set<string>();

  if (tenantIds.length) {
    const waiting = await prisma.wellhubUserLink.findMany({
      where: {
        userId: null,
        tenantId: { in: tenantIds },
        email: { equals: opts.email, mode: "insensitive" },
      },
      select: { id: true, tenantId: true, wellhubUniqueToken: true },
    });

    for (const link of waiting) {
      await prisma.wellhubUserLink.update({
        where: { id: link.id },
        data: { userId: opts.userId, userLinkedAt: new Date(), linkedVia: "email_claim" },
      });
      const n = await attributeWellhubBookingsToUser({
        tenantId: link.tenantId,
        userId: opts.userId,
        wellhubUniqueToken: link.wellhubUniqueToken,
      });
      linkedIdentities += 1;
      affected.add(link.tenantId);
      if (link.tenantId === opts.tenantId) attributedBookings += n;
    }
  }

  const linkedInTenant =
    (await prisma.wellhubUserLink.count({
      where: { tenantId: opts.tenantId, userId: opts.userId },
    })) > 0;

  return {
    ok: true,
    linkedIdentities,
    attributedBookings,
    linkedInTenant,
    affectedTenantIds: [...affected],
  };
}

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
