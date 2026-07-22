// Member share links: every client can share a personal tracked link — their
// referralCode appended to any public URL (?ref=CODE, primarily /schedule).
//
// Flow:
//   1. A visitor lands with ?ref → the UtmTracker posts /api/share/click, which
//      records a MemberShareClick and sets a 30-day httpOnly cookie.
//   2. Purchase endpoints STASH the cookie's code on the row being bought
//      (UserPackage.shareRefCode / MemberSubscription.shareRefCode) — the
//      conversion is only recorded when the payment actually completes
//      (webhook), so abandoned checkouts never count. Free/immediate purchases
//      and bookings attribute right away.
//   3. The same ?ref also feeds the existing signup-referral program (the
//      tracker mirrors it to localStorage), so one link does both jobs.
//
// Self-attribution is skipped: buying through your own link earns nothing.

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SHARE_COOKIE = "mgic_share";
export const SHARE_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

/** Read the share code the visitor is carrying, if any. */
export async function getShareCookieCode(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(SHARE_COOKIE)?.value ?? null;
  } catch {
    // No request scope (cron/webhook) — callers there use the stashed code.
    return null;
  }
}

/** Validate a code → sharer membership (tenant-scoped). */
export async function findSharerMembership(tenantId: string, code: string) {
  if (!code) return null;
  return prisma.membership.findFirst({
    where: { tenantId, referralCode: code },
    select: { id: true, userId: true },
  });
}

export async function recordShareClick(opts: {
  tenantId: string;
  code: string;
  path?: string | null;
}): Promise<boolean> {
  const sharer = await findSharerMembership(opts.tenantId, opts.code);
  if (!sharer) return false;
  await prisma.memberShareClick.create({
    data: {
      tenantId: opts.tenantId,
      membershipId: sharer.id,
      path: opts.path?.slice(0, 200) ?? null,
    },
  });
  return true;
}

/**
 * Credit a conversion to the sharer behind `code`. Idempotent per (refType,
 * refId): activating the same purchase twice records once. Never throws —
 * attribution must not break a purchase.
 */
export async function attributeShareConversion(opts: {
  tenantId: string;
  code: string | null | undefined;
  kind: "purchase" | "booking";
  amount: number;
  refType: "package" | "subscription" | "booking";
  refId: string;
  buyerUserId?: string | null;
}): Promise<void> {
  try {
    if (!opts.code) return;
    const sharer = await findSharerMembership(opts.tenantId, opts.code);
    if (!sharer) return;
    // Sharing your own link with yourself is not growth.
    if (opts.buyerUserId && sharer.userId === opts.buyerUserId) return;

    const existing = await prisma.memberShareConversion.findFirst({
      where: { tenantId: opts.tenantId, refType: opts.refType, refId: opts.refId },
      select: { id: true },
    });
    if (existing) return;

    await prisma.memberShareConversion.create({
      data: {
        tenantId: opts.tenantId,
        membershipId: sharer.id,
        kind: opts.kind,
        amount: opts.amount > 0 ? opts.amount : 0,
        refType: opts.refType,
        refId: opts.refId,
        buyerUserId: opts.buyerUserId ?? null,
      },
    });
  } catch (err) {
    console.error("[share-links] attribution failed", err);
  }
}
