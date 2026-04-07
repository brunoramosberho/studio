import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { getStripe } from "@/lib/stripe/client";
import { STRIPE_PLANS, type StripePlanKey } from "@/lib/stripe/products";

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const stripe = getStripe();
    const body = await request.json();
    const { planId } = body as { planId: StripePlanKey };

    const plan = STRIPE_PLANS[planId];
    if (!plan || !plan.priceId) {
      return NextResponse.json(
        { error: "Invalid plan or plan not configured" },
        { status: 400 },
      );
    }

    let customerId = tenant.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { tenantId: tenant.id, tenantSlug: tenant.slug },
      });
      customerId = customer.id;
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.priceId }],
      trial_period_days: 14,
      metadata: { tenantId: tenant.id },
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        stripeSubscriptionId: subscription.id,
        stripePlanId: plan.priceId,
        subscriptionStatus: subscription.status,
        trialEndsAt: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
      },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized" || message === "Forbidden") {
      return NextResponse.json(
        { error: message },
        { status: message === "Unauthorized" ? 401 : 403 },
      );
    }
    console.error("POST /api/stripe/subscription error:", error);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 },
    );
  }
}
