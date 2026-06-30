import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { getMaxedPackageIds } from "@/lib/packages/purchase-limit";

export async function POST(request: NextRequest) {
  try {
    const tenant = await requireTenant();
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ exists: false });
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        name: true,
        // Has this email ever purchased here — drives the curated-packages
        // "first timer" vs "returning" audience.
        memberships: {
          where: { tenantId: tenant.id },
          select: { firstPurchaseAt: true },
        },
        packages: {
          where: {
            tenantId: tenant.id,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
          },
          select: {
            creditsTotal: true,
            creditsUsed: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ exists: false });
    }

    const hasCredits = user.packages.some(
      (p) => p.creditsTotal === null || p.creditsUsed < (p.creditsTotal ?? 0),
    );

    const totalCredits = user.packages.reduce((sum, p) => {
      if (p.creditsTotal === null) return Infinity;
      return sum + Math.max(0, (p.creditsTotal ?? 0) - p.creditsUsed);
    }, 0);

    // Capped packages this customer can no longer buy — so the booking picker
    // can show them as "already bought" instead of letting them tap Buy and hit
    // the server-side 403.
    const maxedPackageIds = await getMaxedPackageIds(user.id, tenant.id);

    return NextResponse.json({
      exists: true,
      hasCredits,
      credits: totalCredits === Infinity ? -1 : totalCredits,
      name: user.name,
      maxedPackageIds,
      hasPurchased: user.memberships[0]?.firstPurchaseAt != null,
    });
  } catch (error) {
    console.error("POST /api/check-email error:", error);
    return NextResponse.json({ exists: false });
  }
}
