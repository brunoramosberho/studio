import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 },
      );
    }

    const event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET!,
    );

    const connectedAccountId = event.account;

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        await prisma.stripePayment.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: { status: "succeeded" },
        });

        const payment = await prisma.stripePayment.findUnique({
          where: { stripePaymentIntentId: pi.id },
        });

        if (payment?.type === "membership" && payment.referenceId) {
          await prisma.userPackage.updateMany({
            where: {
              id: payment.referenceId,
              stripePaymentId: "pending_stripe",
            },
            data: { stripePaymentId: pi.id },
          });
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        await prisma.stripePayment.updateMany({
          where: { stripePaymentIntentId: pi.id },
          data: { status: "failed" },
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const subId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (!subId) break;

        const memberSub = await prisma.memberSubscription.findUnique({
          where: { stripeSubscriptionId: subId },
          include: { package: true },
        });
        if (!memberSub) break;

        await prisma.memberSubscription.update({
          where: { id: memberSub.id },
          data: {
            status: "active",
            currentPeriodStart: new Date(
              (invoice.lines?.data?.[0]?.period?.start ?? Date.now() / 1000) * 1000,
            ),
            currentPeriodEnd: new Date(
              (invoice.lines?.data?.[0]?.period?.end ?? Date.now() / 1000) * 1000,
            ),
          },
        });

        const periodEnd = invoice.lines?.data?.[0]?.period?.end;
        if (periodEnd) {
          await prisma.userPackage.create({
            data: {
              tenantId: memberSub.tenantId,
              userId: memberSub.userId,
              packageId: memberSub.packageId,
              creditsTotal: memberSub.package.credits,
              creditsUsed: 0,
              expiresAt: new Date(periodEnd * 1000),
              stripePaymentId: invoice.payment_intent as string ?? invoice.id,
            },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription?.id;
        if (!subId) break;

        await prisma.memberSubscription.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { status: "past_due" },
        });
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const memberSub = await prisma.memberSubscription.findUnique({
          where: { stripeSubscriptionId: sub.id },
        });
        if (!memberSub) break;

        const isPaused = !!sub.pause_collection;

        await prisma.memberSubscription.update({
          where: { id: memberSub.id },
          data: {
            status: isPaused ? "paused" : sub.status,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: new Date(sub.current_period_start * 1000),
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            ...(isPaused && !memberSub.pausedAt && { pausedAt: new Date() }),
            ...(!isPaused && memberSub.pausedAt && {
              pausedAt: null,
              resumesAt: null,
            }),
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await prisma.memberSubscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: "canceled", canceledAt: new Date() },
        });
        break;
      }

      case "account.updated": {
        if (!connectedAccountId) break;
        const account = event.data.object;

        let status: "pending" | "active" | "restricted" = "pending";
        if (account.charges_enabled && account.payouts_enabled) {
          status = "active";
        } else if (
          account.requirements?.currently_due?.length ||
          account.requirements?.past_due?.length
        ) {
          status = "restricted";
        }

        await prisma.tenant.updateMany({
          where: { stripeAccountId: connectedAccountId },
          data: { stripeAccountStatus: status },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("POST /api/webhooks/stripe-connect error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 400 },
    );
  }
}
