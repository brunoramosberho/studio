import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthContext } from "@/lib/tenant";

/**
 * Wellhub link status for the signed-in member ("Connected apps" card).
 *
 * States, in the order the UI cares about them:
 *   - enabled=false        → tenant doesn't work with Wellhub, hide the card
 *   - linked=true          → a WellhubUserLink in this tenant points at me
 *   - claimPending=true    → I verified an email but no Wellhub visit carries
 *                            it yet; it will bind alone on the first booking
 *   - otherwise            → offer the link flow
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = ctx.session.user.id;
    const tenantId = ctx.tenant.id;

    const config = await prisma.studioPlatformConfig.findFirst({
      where: { tenantId, platform: "wellhub", isActive: true },
      select: { id: true },
    });
    if (!config) {
      return NextResponse.json({ enabled: false, linked: false });
    }

    const link = await prisma.wellhubUserLink.findFirst({
      where: { tenantId, userId },
      orderBy: { userLinkedAt: "desc" },
      select: { email: true, fullName: true, userLinkedAt: true, linkedVia: true },
    });

    if (link) {
      const attendedCount = await prisma.booking.count({
        where: {
          tenantId,
          userId,
          platformBookingId: { not: null },
          status: "ATTENDED",
        },
      });
      return NextResponse.json({
        enabled: true,
        linked: true,
        email: link.email,
        wellhubName: link.fullName,
        linkedAt: link.userLinkedAt?.toISOString() ?? null,
        linkedVia: link.linkedVia,
        attendedCount,
      });
    }

    const claim = await prisma.wellhubEmailClaim.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { email: true },
    });

    return NextResponse.json({
      enabled: true,
      linked: false,
      claimPending: Boolean(claim),
      claimEmail: claim?.email ?? null,
    });
  } catch (error) {
    console.error("GET /api/wellhub/link error:", error);
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}
