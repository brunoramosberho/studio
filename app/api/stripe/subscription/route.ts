import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { resolveSaasStripePriceId } from "@/lib/stripe/saas-plans";
import { getTenantStripeContext } from "@/lib/stripe/tenant-stripe";

export async function POST(request: NextRequest) {
  try {
    const { tenant } = await requireRole("ADMIN");
    const body = await request.json();
    const { planId, planKey } = body as {
      planId?: string;
      planKey?: string;
    };
    const key = (planKey ?? planId ?? "").trim().toLowerCase();
    if (!key) {
      return NextResponse.json(
        { error: "planKey or planId is required" },
        { status: 400 },
      );
    }

    const resolved = await resolveSaasStripePriceId(tenant.id, key);
    if (!resolved?.stripePriceId) {
      return NextResponse.json(
        { error: "Invalid plan or plan not configured" },
        { status: 400 },
      );
    }

    const { stripe } = await getTenantStripeContext(tenant.id);

    // Re-read so we have the SaaS override fields the public `tenant` from
    // requireRole() doesn't carry (it returns the lib/tenant Tenant view).
    const fullTenant = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: {
        stripeCustomerId: true,
        saasCouponId: true,
        saasTrialDays: true,
      },
    });

    let customerId = fullTenant?.stripeCustomerId ?? tenant.stripeCustomerId;

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

    const trialDays = fullTenant?.saasTrialDays ?? 14;
    const coupon = fullTenant?.saasCouponId?.trim();

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: resolved.stripePriceId }],
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      ...(coupon && { discounts: [{ coupon }] }),
      metadata: {
        tenantId: tenant.id,
        saasPlanKey: key,
        ...(coupon && { saasCouponId: coupon }),
        saasTrialDays: String(trialDays),
      },
      payment_behavior: "default_incomplete",
      expand: ["latest_invoice.payment_intent"],
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        stripeSubscriptionId: subscription.id,
        stripePlanId: resolved.stripePriceId,
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
