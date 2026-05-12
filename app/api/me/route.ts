import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenant, getTenantCurrency, getMembership } from "@/lib/tenant";
import { FALLBACK_CURRENCY } from "@/lib/currency";
import { prisma } from "@/lib/db";
import { resolveStripePublishableKey } from "@/lib/stripe/publishable-key";

export async function GET() {
  try {
    const session = await auth();
    const tenant = await getTenant();
    const stripeSandboxMode = tenant?.stripeSandboxMode ?? false;
    const stripePublishableKey = resolveStripePublishableKey(stripeSandboxMode);

    if (!session?.user?.id) {
      const currency = tenant ? await getTenantCurrency() : FALLBACK_CURRENCY;
      return NextResponse.json({
        role: null,
        isSuperAdmin: false,
        tenantId: tenant?.id ?? null,
        tenantSlug: tenant?.slug ?? null,
        hasCoachProfile: false,
        hasShopProducts: false,
        currency,
        stripeSandboxMode,
        stripePublishableKey,
      });
    }

    if (!tenant) {
      return NextResponse.json({
        role: null,
        isSuperAdmin: (session.user as Record<string, unknown>).isSuperAdmin ?? false,
        tenantId: null,
        tenantSlug: null,
        hasCoachProfile: false,
        hasShopProducts: false,
        currency: FALLBACK_CURRENCY,
        stripeSandboxMode: false,
        stripePublishableKey: resolveStripePublishableKey(false),
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
      stripeSandboxMode,
      stripePublishableKey,
    });
  } catch {
    return NextResponse.json({
      role: null,
      isSuperAdmin: false,
      tenantId: null,
      tenantSlug: null,
      hasCoachProfile: false,
      hasShopProducts: false,
      currency: FALLBACK_CURRENCY,
      stripeSandboxMode: false,
      stripePublishableKey: null,
    });
  }
}
