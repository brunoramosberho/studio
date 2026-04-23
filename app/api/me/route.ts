import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenant, getTenantCurrency, getMembership } from "@/lib/tenant";
import { FALLBACK_CURRENCY } from "@/lib/currency";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ role: null, isSuperAdmin: false, currency: FALLBACK_CURRENCY });
    }

    const tenant = await getTenant();
    if (!tenant) {
      return NextResponse.json({
        role: null,
        isSuperAdmin: (session.user as Record<string, unknown>).isSuperAdmin ?? false,
        currency: FALLBACK_CURRENCY,
      });
    }

    const [membership, coachProfile, shopProduct, currency] = await Promise.all([
      getMembership(session.user.id, tenant.id),
      prisma.coachProfile.findUnique({
        where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
        select: { id: true },
      }),
      prisma.product.findFirst({
        where: { tenantId: tenant.id, isActive: true, isVisible: true },
        select: { id: true },
      }),
      getTenantCurrency(),
    ]);

    return NextResponse.json({
      role: membership?.role ?? null,
      hasCoachProfile: !!coachProfile,
      hasShopProducts: !!shopProduct,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      isSuperAdmin: (session.user as Record<string, unknown>).isSuperAdmin ?? false,
      currency,
    });
  } catch {
    return NextResponse.json({ role: null, isSuperAdmin: false, currency: FALLBACK_CURRENCY });
  }
}
