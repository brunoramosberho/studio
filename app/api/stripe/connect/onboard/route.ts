import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { getStripeClientForTenantId } from "@/lib/stripe/tenant-stripe";

export async function POST() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const stripe = await getStripeClientForTenantId(tenant.id);

    let stripeAccountId = tenant.stripeAccountId;

    if (!stripeAccountId) {
      const tenantWithCountry = await prisma.tenant.findUnique({
        where: { id: tenant.id },
        include: { defaultCountry: true },
      });
      const countryCode = tenantWithCountry?.defaultCountry?.code;
      if (!countryCode) {
        return NextResponse.json(
          { error: "Tenant has no default country configured. Set it before Stripe onboarding." },
          { status: 400 },
        );
      }

      const account = await stripe.accounts.create({
        type: "express",
        country: countryCode,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
      });
      stripeAccountId = account.id;

      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          stripeAccountId: account.id,
          stripeAccountStatus: "pending",
        },
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings/billing?refresh=true`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings/billing?success=true`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json(
        { error: message },
        { status: message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("POST /api/stripe/connect/onboard error:", error);
    return NextResponse.json(
      { error: "Failed to start onboarding" },
      { status: 500 },
    );
  }
}
