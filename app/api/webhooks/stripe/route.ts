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
      process.env.STRIPE_WEBHOOK_SECRET!,
    );

    switch (event.type) {
      // ── Legacy: package purchase via Checkout ──
      case "checkout.session.completed": {
        const session = event.data.object;
        const { packageId, userId, tenantId } = session.metadata ?? {};

        if (!packageId || !userId || !tenantId) {
          console.error(
            "Stripe webhook missing metadata:",
            session.metadata,
          );
          break;
        }

        const pkg = await prisma.package.findFirst({
          where: { id: packageId, tenantId },
        });

        if (!pkg) {
          console.error("Package not found for webhook:", packageId);
          break;
        }

        const purchasedAt = new Date();
        const expiresAt = new Date(purchasedAt);
        expiresAt.setDate(expiresAt.getDate() + pkg.validDays);

        await prisma.userPackage.create({
          data: {
            userId,
            packageId: pkg.id,
            tenantId,
            creditsTotal: pkg.credits,
            creditsUsed: 0,
            expiresAt,
            stripePaymentId: session.payment_intent as string | null,
            purchasedAt,
          },
        });
        break;
      }

      // ── SaaS subscription lifecycle ──
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenantId;
        if (!tenantId) break;

        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            stripePlanId: subscription.items.data[0]?.price.id ?? null,
            trialEndsAt: subscription.trial_end
              ? new Date(subscription.trial_end * 1000)
              : null,
          },
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const tenantId = subscription.metadata?.tenantId;
        if (!tenantId) break;

        await prisma.tenant.update({
          where: { id: tenantId },
          data: {
            subscriptionStatus: "canceled",
            stripeSubscriptionId: null,
          },
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoiceRaw = event.data.object as unknown as Record<string, unknown>;
        const subId =
          typeof invoiceRaw.subscription === "string"
            ? invoiceRaw.subscription
            : null;
        if (subId) {
          await prisma.tenant.updateMany({
            where: { stripeSubscriptionId: subId },
            data: { subscriptionStatus: "active" },
          });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoiceRaw = event.data.object as unknown as Record<string, unknown>;
        const subId =
          typeof invoiceRaw.subscription === "string"
            ? invoiceRaw.subscription
            : null;
        if (subId) {
          await prisma.tenant.updateMany({
            where: { stripeSubscriptionId: subId },
            data: { subscriptionStatus: "past_due" },
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("POST /api/webhooks/stripe error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 400 },
    );
  }
}
