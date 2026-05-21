import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { constructPlatformStripeWebhookEvent } from "@/lib/stripe/webhook-verify";

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

    const event = constructPlatformStripeWebhookEvent(body, signature);

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

      case "invoice.payment_action_required": {
        // SaaS renewal where the studio's card needs SCA. Same status as
        // payment_failed so the admin sees a "Resolve in billing" CTA; the
        // dedicated email/banner is a TODO when there's actual traffic.
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
        console.log(
          `[stripe-platform-webhook] invoice.payment_action_required for sub ${subId} — studio admin needs to re-authenticate`,
        );
        break;
      }

      case "invoice.upcoming": {
        // Default: 7 días antes de la renovación. Aprovéchalo para enviar
        // un correo de heads-up al admin del studio ("tu suscripción Magic
        // se renueva el X por Y €"). Solo log por ahora.
        const invoiceRaw = event.data.object as unknown as Record<string, unknown>;
        const subId =
          typeof invoiceRaw.subscription === "string"
            ? invoiceRaw.subscription
            : null;
        const nextAttempt =
          typeof invoiceRaw.next_payment_attempt === "number"
            ? new Date(invoiceRaw.next_payment_attempt * 1000)
            : null;
        console.log(
          `[stripe-platform-webhook] invoice.upcoming for sub ${subId} — next attempt ${nextAttempt?.toISOString() ?? "unknown"}`,
        );
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
