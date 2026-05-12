import { NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { getStripeClientForTenantId } from "@/lib/stripe/tenant-stripe";

export async function POST() {
  try {
    const { tenant } = await requireRole("ADMIN");
    const stripe = await getStripeClientForTenantId(tenant.id);

    if (!tenant.stripeCustomerId) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 400 },
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/settings/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json(
        { error: message },
        { status: message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("POST /api/stripe/billing-portal error:", error);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 },
    );
  }
}
