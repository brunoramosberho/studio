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

      // Stripe-controlled pricing: the studio pays Stripe's processing fees
      // directly, so the platform is billed nothing for Connect — no per-active
      // -account fee, no 0.25% of volume, no per-payout fee. We still take our
      // application fee on every charge; that's independent of who pays Stripe.
      //
      // This forces the full Stripe dashboard: Stripe rejects the Express
      // dashboard unless the platform both collects the fees AND carries the
      // losses. Handing the fees over means handing the chargeback and
      // negative-balance liability over too, which is the trade we want.
      //
      // `controller` is immutable — it cannot be changed after creation, so an
      // account onboarded under the old Express setup has to be re-onboarded
      // from scratch to move to this model.
      const account = await stripe.accounts.create({
        controller: {
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          stripe_dashboard: { type: "full" },
        },
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
