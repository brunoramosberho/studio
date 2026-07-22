import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import { getTenantBaseUrl } from "@/lib/email";
import { getOrCreateReferralCode } from "@/lib/referrals/code";

// The member's own share link + how it's doing. Available to every client —
// unlike the referral program page, this needs no tenant config to be on.
export async function GET() {
  try {
    const { session, tenant, membership } = await requireAuth();

    const code = await getOrCreateReferralCode(session.user.id, tenant.id);
    const link = `${getTenantBaseUrl(tenant.slug)}/schedule?ref=${code}`;

    const [clicks, convRows] = await Promise.all([
      prisma.memberShareClick.count({
        where: { tenantId: tenant.id, membershipId: membership.id },
      }),
      prisma.memberShareConversion.groupBy({
        by: ["kind"],
        where: { tenantId: tenant.id, membershipId: membership.id },
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    const purchases = convRows.find((r) => r.kind === "purchase");
    const bookings = convRows.find((r) => r.kind === "booking");

    return NextResponse.json({
      link,
      code,
      stats: {
        clicks,
        bookings: bookings?._count.id ?? 0,
        purchases: purchases?._count.id ?? 0,
        revenue: purchases?._sum.amount ?? 0,
      },
    });
  } catch (error) {
    if (error instanceof Error && ["Unauthorized", "Forbidden"].includes(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("GET /api/me/share-link error:", error);
    return NextResponse.json({ error: "Failed to load share link" }, { status: 500 });
  }
}
