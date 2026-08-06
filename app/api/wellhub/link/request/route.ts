import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";
import { sendWellhubLinkCode } from "@/lib/email";
import { checkAchievements } from "@/lib/achievements";
import {
  claimWellhubEmailForUser,
  generateLinkCode,
  hashLinkCode,
  normalizeClaimEmail,
  WELLHUB_LINK_CODE_HOURLY_CAP,
  WELLHUB_LINK_CODE_RESEND_COOLDOWN_MS,
  WELLHUB_LINK_CODE_TTL_MS,
} from "@/lib/platforms/wellhub";

/**
 * Step 1 of the self-serve Wellhub link: the member tells us the email their
 * employer registered on Wellhub and we send a one-time code there.
 *
 * Two addresses skip the code entirely:
 *   - their own login email (logging in already proved ownership), and
 *   - an address they verified before (claim exists → just re-bind).
 *
 * Error body is `{ error: <key> }`; the UI maps keys to localized copy.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.session?.user?.id) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const userId = ctx.session.user.id;
    const tenantId = ctx.tenant.id;

    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId, platform: "wellhub", isActive: true },
      select: { id: true },
    });
    if (!config) {
      return NextResponse.json({ error: "not_enabled" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const email = normalizeClaimEmail(typeof body?.email === "string" ? body.email : "");
    if (!email) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, firstName: true, locale: true },
    });
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const existingClaim = await prisma.wellhubEmailClaim.findUnique({
      where: { email },
      select: { userId: true },
    });
    if (existingClaim && existingClaim.userId !== userId) {
      return NextResponse.json({ error: "claimed_by_other" }, { status: 409 });
    }

    const isOwnLoginEmail = email === user.email.toLowerCase();
    if (!isOwnLoginEmail && !existingClaim) {
      // The address belongs to a different Magic account → that account is the
      // one Wellhub matching will bind to; don't let this one claim it.
      const owner = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (owner && owner.id !== userId) {
        return NextResponse.json({ error: "belongs_to_account" }, { status: 409 });
      }
    }

    // Ownership already proven (login email or prior claim) → bind now.
    if (isOwnLoginEmail || existingClaim) {
      const result = await claimWellhubEmailForUser({ userId, email, tenantId });
      if (!result.ok) {
        return NextResponse.json({ error: "claimed_by_other" }, { status: 409 });
      }
      for (const affectedTenantId of result.affectedTenantIds) {
        // Reconcile totals/streak/achievements for the claimed history. Silent:
        // these classes happened in the past — no push, no LEVEL_UP post.
        try {
          await checkAchievements(userId, affectedTenantId, { silent: true });
        } catch (err) {
          console.error("[wellhub-link] progress reconcile failed", err);
        }
      }
      return NextResponse.json({
        linkedImmediately: true,
        linked: result.linkedInTenant,
        linkedIdentities: result.linkedIdentities,
        importedBookings: result.attributedBookings,
      });
    }

    // Rate limits: rolling hourly cap + cooldown between sends.
    const now = Date.now();
    const sentLastHour = await prisma.wellhubLinkCode.count({
      where: { userId, tenantId, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
    });
    if (sentLastHour >= WELLHUB_LINK_CODE_HOURLY_CAP) {
      return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
    }
    const lastRequest = await prisma.wellhubLinkCode.findFirst({
      where: { userId, tenantId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (lastRequest) {
      const elapsed = now - lastRequest.createdAt.getTime();
      if (elapsed < WELLHUB_LINK_CODE_RESEND_COOLDOWN_MS) {
        return NextResponse.json(
          {
            error: "cooldown",
            retryInSeconds: Math.ceil((WELLHUB_LINK_CODE_RESEND_COOLDOWN_MS - elapsed) / 1000),
          },
          { status: 429 },
        );
      }
    }

    // One live code at a time: kill older pending ones, then mint the new one.
    await prisma.wellhubLinkCode.updateMany({
      where: { userId, tenantId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const code = generateLinkCode();
    const rowId = randomUUID();
    await prisma.wellhubLinkCode.create({
      data: {
        id: rowId,
        tenantId,
        userId,
        email,
        codeHash: hashLinkCode(rowId, code),
        expiresAt: new Date(now + WELLHUB_LINK_CODE_TTL_MS),
      },
    });

    try {
      await sendWellhubLinkCode({
        to: email,
        name: user.firstName || user.name || "",
        code,
        locale: user.locale || ctx.tenant.locale || "es",
      });
    } catch (err) {
      console.error("[wellhub-link] code email failed", err);
      // A code nobody received must not eat the hourly cap or the cooldown.
      await prisma.wellhubLinkCode.delete({ where: { id: rowId } }).catch(() => {});
      return NextResponse.json({ error: "send_failed" }, { status: 502 });
    }

    return NextResponse.json({
      sent: true,
      email,
      expiresInSeconds: Math.floor(WELLHUB_LINK_CODE_TTL_MS / 1000),
      cooldownSeconds: Math.floor(WELLHUB_LINK_CODE_RESEND_COOLDOWN_MS / 1000),
    });
  } catch (error) {
    console.error("POST /api/wellhub/link/request error:", error);
    return NextResponse.json({ error: "request_failed" }, { status: 500 });
  }
}
