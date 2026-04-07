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
