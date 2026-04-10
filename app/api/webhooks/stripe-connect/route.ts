import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { prisma } from "@/lib/db";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { createCreditUsagesForPackage } from "@/lib/credits";

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

        if (payment?.memberId && payment.tenantId) {
          updateLifecycle(payment.memberId, payment.tenantId, "purchased").catch(
            (err) => console.error("Lifecycle update (purchased) failed:", err),
          );
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
        const inv = event.data.object as unknown as Record<string, unknown>;
        const subId =
          typeof inv.subscription === "string"
            ? inv.subscription
            : (inv.subscription as Record<string, string> | null)?.id;
        if (!subId) break;

        const memberSub = await prisma.memberSubscription.findUnique({
          where: { stripeSubscriptionId: subId },
          include: { package: { include: { creditAllocations: true } } },
        });
        if (!memberSub) break;

        const lines = inv.lines as { data?: { period?: { start?: number; end?: number } }[] } | undefined;
        const periodStart = lines?.data?.[0]?.period?.start;
        const periodEnd = lines?.data?.[0]?.period?.end;

        await prisma.memberSubscription.update({
          where: { id: memberSub.id },
          data: {
            status: "active",
            currentPeriodStart: new Date((periodStart ?? Date.now() / 1000) * 1000),
            currentPeriodEnd: new Date((periodEnd ?? Date.now() / 1000) * 1000),
          },
        });

        const piId = (inv.payment_intent as string) ?? (inv.id as string);
        const amountPaid = typeof inv.amount_paid === "number" ? inv.amount_paid / 100 : memberSub.package.price;

        const hasAllocations = memberSub.package.creditAllocations.length > 0;

        let userPackageId: string | undefined;
        if (periodEnd) {
          const userPackage = await prisma.userPackage.create({
            data: {
              tenantId: memberSub.tenantId,
              userId: memberSub.userId,
              packageId: memberSub.packageId,
              creditsTotal: hasAllocations ? null : memberSub.package.credits,
              creditsUsed: 0,
              expiresAt: new Date(periodEnd * 1000),
              stripePaymentId: piId,
            },
          });
          userPackageId = userPackage.id;
          if (hasAllocations) {
            await createCreditUsagesForPackage(userPackage.id, memberSub.packageId);
          }
        }

        if (piId) {
          const existing = await prisma.stripePayment.findUnique({
            where: { stripePaymentIntentId: piId },
          });
          if (!existing) {
            await prisma.stripePayment.create({
              data: {
                tenantId: memberSub.tenantId,
                memberId: memberSub.userId,
                stripePaymentIntentId: piId,
                amount: amountPaid,
                currency: memberSub.package.currency?.toLowerCase() ?? "eur",
                status: "succeeded",
                type: "subscription",
                concept: memberSub.package.name,
                conceptSub: "Renovación automática",
                referenceId: userPackageId ?? null,
              },
            });
          }
        }

        updateLifecycle(memberSub.userId, memberSub.tenantId, "member").catch(
          (err) => console.error("Lifecycle update (member) failed:", err),
        );
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as unknown as Record<string, unknown>;
        const subId =
          typeof inv.subscription === "string"
            ? inv.subscription
            : (inv.subscription as Record<string, string> | null)?.id;
        if (!subId) break;

        const failedSub = await prisma.memberSubscription.findUnique({
          where: { stripeSubscriptionId: subId },
          include: { package: true },
        });

        await prisma.memberSubscription.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { status: "past_due" },
        });

        if (failedSub) {
          const failedPiId = (inv.payment_intent as string) ?? `inv_failed_${inv.id}`;
          const failedAmount = typeof inv.amount_due === "number" ? inv.amount_due / 100 : failedSub.package.price;
          const existing = await prisma.stripePayment.findUnique({
            where: { stripePaymentIntentId: failedPiId },
          });
          if (!existing) {
            await prisma.stripePayment.create({
              data: {
                tenantId: failedSub.tenantId,
                memberId: failedSub.userId,
                stripePaymentIntentId: failedPiId,
                amount: failedAmount,
                currency: failedSub.package.currency?.toLowerCase() ?? "eur",
                status: "failed",
                type: "subscription",
                concept: failedSub.package.name,
                conceptSub: "Renovación fallida",
              },
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as unknown as Record<string, unknown>;
        const subId = sub.id as string;
        const memberSub = await prisma.memberSubscription.findUnique({
          where: { stripeSubscriptionId: subId },
        });
        if (!memberSub) break;

        const isPaused = !!sub.pause_collection;
        const periodStart = sub.current_period_start as number | undefined;
        const periodEnd = sub.current_period_end as number | undefined;

        await prisma.memberSubscription.update({
          where: { id: memberSub.id },
          data: {
            status: isPaused ? "paused" : (sub.status as string),
            cancelAtPeriodEnd: (sub.cancel_at_period_end as boolean) ?? false,
            ...(periodStart && { currentPeriodStart: new Date(periodStart * 1000) }),
            ...(periodEnd && { currentPeriodEnd: new Date(periodEnd * 1000) }),
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
