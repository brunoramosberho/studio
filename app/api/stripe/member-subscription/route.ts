import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import {
  createMemberSubscription,
  cancelMemberSubscription,
} from "@/lib/stripe/subscriptions";


export async function GET() {
  try {
    const { session, tenant } = await requireAuth();

    const subscriptions = await prisma.memberSubscription.findMany({
      where: { userId: session.user.id, tenantId: tenant.id },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            price: true,
            currency: true,
            recurringInterval: true,
            credits: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(subscriptions);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("GET /api/stripe/member-subscription error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const body = await request.json();
    const { packageId, paymentMethodId } = body as {
      packageId: string;
      paymentMethodId?: string;
    };

    if (!packageId) {
      return NextResponse.json(
        { error: "packageId is required" },
        { status: 400 },
      );
    }

    const pkg = await prisma.package.findUnique({
      where: { id: packageId, tenantId: tenant.id },
    });

    if (!pkg || pkg.type !== "SUBSCRIPTION" || !pkg.isActive) {
      return NextResponse.json(
        { error: "Subscription plan not found" },
        { status: 404 },
      );
    }

    const existing = await prisma.memberSubscription.findUnique({
      where: {
        tenantId_userId_packageId: {
          tenantId: tenant.id,
          userId: session.user.id,
          packageId,
        },
      },
    });

    if (existing && !["canceled", "incomplete"].includes(existing.status)) {
      return NextResponse.json(
        { error: "Ya tienes una suscripción activa para este plan" },
        { status: 409 },
      );
    }

    if (existing) {
      await prisma.memberSubscription.delete({ where: { id: existing.id } });
    }

    const subscription = await createMemberSubscription({
      tenantId: tenant.id,
      userId: session.user.id,
      packageId,
      paymentMethodId,
    });

    if (subscription.status === "active") {
      return NextResponse.json({
        status: "active",
        subscriptionId: subscription.id,
      });
    }

    const invoice = subscription.latest_invoice as unknown as Record<string, unknown> | null;
    const confirmationSecret = invoice?.confirmation_secret as Record<string, unknown> | null;
    const clientSecret = confirmationSecret?.client_secret as string | null;

    if (clientSecret) {
      return NextResponse.json({
        status: "requires_payment",
        clientSecret,
        stripeAccountId: tenant.stripeAccountId,
        subscriptionId: subscription.id,
      });
    }

    return NextResponse.json({
      status: subscription.status,
      subscriptionId: subscription.id,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("POST /api/stripe/member-subscription error:", error);
    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { session, tenant } = await requireAuth();
    const { subscriptionId } = (await request.json()) as {
      subscriptionId: string;
    };

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "subscriptionId is required" },
        { status: 400 },
      );
    }

    const memberSub = await prisma.memberSubscription.findUnique({
      where: { stripeSubscriptionId: subscriptionId },
    });

    if (
      !memberSub ||
      memberSub.userId !== session.user.id ||
      memberSub.tenantId !== tenant.id
    ) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await cancelMemberSubscription(subscriptionId, false);

    return NextResponse.json({ ok: true, cancelAtPeriodEnd: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    if (message === "Unauthorized") {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    console.error("DELETE /api/stripe/member-subscription error:", error);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 },
    );
  }
}
