import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/tenant";
import {
  createMemberSubscription,
  cancelMemberSubscription,
  reactivateMemberSubscription,
} from "@/lib/stripe/subscriptions";

/**
 * GET — return the user's current on-demand subscription state for this tenant.
 */
export async function GET() {
  try {
    const ctx = await requireAuth();

    const subs = await prisma.memberSubscription.findMany({
      where: { tenantId: ctx.tenant.id, userId: ctx.session.user.id },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            type: true,
            price: true,
            currency: true,
            recurringInterval: true,
            includesOnDemand: true,
          },
        },
      },
      orderBy: { currentPeriodEnd: "desc" },
    });

    const onDemandSub =
      subs.find((s) => s.package.type === "ON_DEMAND_SUBSCRIPTION") ?? null;
    const bundledSub =
      subs.find(
        (s) =>
          s.package.type !== "ON_DEMAND_SUBSCRIPTION" &&
          s.package.includesOnDemand &&
          ["active", "trialing"].includes(s.status) &&
          s.currentPeriodEnd > new Date(),
      ) ?? null;

    return NextResponse.json({
      onDemandSubscription: onDemandSub,
      bundledSubscription: bundledSub,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/on-demand/subscription error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface CreateBody {
  paymentMethodId?: string;
}

/**
 * POST — create a new on-demand subscription for the authenticated member.
 * Uses the OnDemandConfig.packageId as the SKU. Returns the Stripe client
 * secret so the frontend can confirm the SetupIntent / first invoice.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json().catch(() => ({}))) as CreateBody;

    const config = await prisma.onDemandConfig.findUnique({
      where: { tenantId: ctx.tenant.id },
    });
    if (!config?.enabled || !config.packageId) {
      return NextResponse.json(
        { error: "On-demand product not configured" },
        { status: 400 },
      );
    }

    const existing = await prisma.memberSubscription.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        userId: ctx.session.user.id,
        packageId: config.packageId,
        status: { in: ["active", "trialing", "past_due", "incomplete", "paused"] },
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Already subscribed", subscription: existing },
        { status: 409 },
      );
    }

    const subscription = await createMemberSubscription({
      tenantId: ctx.tenant.id,
      userId: ctx.session.user.id,
      packageId: config.packageId,
      paymentMethodId: body.paymentMethodId,
    });

    const latestInvoice =
      typeof subscription.latest_invoice === "object" && subscription.latest_invoice
        ? subscription.latest_invoice
        : null;
    const confirmation = latestInvoice
      ? ((latestInvoice as unknown) as Record<string, unknown>).confirmation_secret
      : null;
    const clientSecret =
      confirmation && typeof confirmation === "object"
        ? ((confirmation as Record<string, unknown>).client_secret as string | undefined)
        : undefined;

    return NextResponse.json({
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      clientSecret,
      stripeAccountId: ctx.tenant.stripeAccountId,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("POST /api/on-demand/subscription error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface ActionBody {
  action: "cancel" | "reactivate";
}

/**
 * PATCH — cancel (at period end) or reactivate the on-demand subscription.
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    const body = (await request.json()) as ActionBody;

    const sub = await prisma.memberSubscription.findFirst({
      where: {
        tenantId: ctx.tenant.id,
        userId: ctx.session.user.id,
        package: { type: "ON_DEMAND_SUBSCRIPTION" },
      },
    });
    if (!sub) {
      return NextResponse.json({ error: "No subscription" }, { status: 404 });
    }

    if (body.action === "cancel") {
      await cancelMemberSubscription(sub.stripeSubscriptionId, false);
    } else if (body.action === "reactivate") {
      await reactivateMemberSubscription(sub.stripeSubscriptionId);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/on-demand/subscription error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
