import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { checkAchievements } from "@/lib/achievements";
import {
  claimWellhubEmailForUser,
  linkCodeMatches,
  WELLHUB_LINK_CODE_MAX_ATTEMPTS,
} from "@/lib/platforms/wellhub";

/**
 * Step 2 of the self-serve Wellhub link: the member types the code we sent to
 * the claimed address. On success the claim is stored, waiting Wellhub
 * identities bind, past visits attach to their account, and progress /
 * achievements are reconciled silently (the classes happened weeks ago — no
 * push, no LEVEL_UP feed post).
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const userId = ctx.session.user.id;
    const tenantId = ctx.tenant.id;

    const body = await req.json().catch(() => null);
    const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "wrong_code" }, { status: 400 });
    }

    const row = await prisma.wellhubLinkCode.findFirst({
      where: { userId, tenantId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (!row) {
      return NextResponse.json({ error: "no_pending_code" }, { status: 400 });
    }
    if (row.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "expired" }, { status: 410 });
    }
    if (row.attempts >= WELLHUB_LINK_CODE_MAX_ATTEMPTS) {
      return NextResponse.json({ error: "too_many_attempts" }, { status: 410 });
    }

    // Count the attempt before comparing so a hammering client can't probe
    // more than the cap even across parallel requests.
    const counted = await prisma.wellhubLinkCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    if (counted.attempts > WELLHUB_LINK_CODE_MAX_ATTEMPTS) {
      return NextResponse.json({ error: "too_many_attempts" }, { status: 410 });
    }

    if (!linkCodeMatches(row.id, code, row.codeHash)) {
      return NextResponse.json(
        {
          error: "wrong_code",
          attemptsRemaining: Math.max(0, WELLHUB_LINK_CODE_MAX_ATTEMPTS - counted.attempts),
        },
        { status: 400 },
      );
    }

    await prisma.wellhubLinkCode.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    });

    const result = await claimWellhubEmailForUser({ userId, email: row.email, tenantId });
    if (!result.ok) {
      return NextResponse.json({ error: "claimed_by_other" }, { status: 409 });
    }

    for (const affectedTenantId of result.affectedTenantIds) {
      try {
        await checkAchievements(userId, affectedTenantId, { silent: true });
      } catch (err) {
        console.error("[wellhub-link] progress reconcile failed", err);
      }
    }

    const attendedCount = await prisma.booking.count({
      where: { tenantId, userId, platformBookingId: { not: null }, status: "ATTENDED" },
    });

    return NextResponse.json({
      verified: true,
      email: row.email,
      linked: result.linkedInTenant,
      linkedIdentities: result.linkedIdentities,
      importedBookings: result.attributedBookings,
      attendedCount,
    });
  } catch (error) {
    console.error("POST /api/wellhub/link/verify error:", error);
    return NextResponse.json({ error: "verify_failed" }, { status: 500 });
  }
}
