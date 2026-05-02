import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";
import { currencySymbolFor } from "@/lib/currency";
import { prisma } from "@/lib/db";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { createCreditUsagesForPackage } from "@/lib/credits";
import { computeDebtAmount } from "@/lib/billing/debt";
import { getSubscriptionPeriod } from "@/lib/stripe/helpers";
import type Stripe from "stripe";

async function cancelFutureBookingsForPackage(userPackageId: string) {
  await prisma.booking.updateMany({
    where: {
      packageUsed: userPackageId,
      status: "CONFIRMED",
      class: { startsAt: { gt: new Date() } },
    },
    data: { status: "CANCELLED" },
  });
}

async function restoreFutureBookingsForPackage(userPackageId: string) {
  await prisma.booking.updateMany({
    where: {
      packageUsed: userPackageId,
      status: "CANCELLED",
      class: { startsAt: { gt: new Date() } },
    },
    data: { status: "CONFIRMED" },
  });
}

async function findUserPackageForPaymentIntent(paymentIntentId: string) {
  const payment = await prisma.stripePayment.findUnique({
    where: { stripePaymentIntentId: paymentIntentId },
  });
  if (!payment) return { payment: null, userPackage: null };

  let userPackage = null;
  if (
    payment.referenceId &&
    (payment.type === "membership" || payment.type === "class")
  ) {
    userPackage = await prisma.userPackage.findUnique({
      where: { id: payment.referenceId },
      include: { package: true },
    });
  }
  if (!userPackage) {
    userPackage = await prisma.userPackage.findFirst({
      where: { stripePaymentId: paymentIntentId },
      include: { package: true },
    });
  }
  return { payment, userPackage };
}

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

        // Marcar pago + activar UserPackage en una sola transacción para evitar
        // estados intermedios donde el pago aparece como succeeded pero el
        // paquete sigue PENDING_PAYMENT (impide al usuario reservar).
        const payment = await prisma.$transaction(async (tx) => {
          await tx.stripePayment.updateMany({
            where: { stripePaymentIntentId: pi.id },
            data: { status: "succeeded" },
          });

          const p = await tx.stripePayment.findUnique({
            where: { stripePaymentIntentId: pi.id },
          });

          if (
            p?.referenceId &&
            (p.type === "membership" || p.type === "class")
          ) {
            await tx.userPackage.updateMany({
              where: {
                id: p.referenceId,
                stripePaymentId: "pending_stripe",
              },
              data: { stripePaymentId: pi.id },
            });
            await tx.userPackage.updateMany({
              where: { id: p.referenceId },
              data: { status: "ACTIVE" },
            });
          }

          if (p?.referenceId && p.type === "product") {
            await tx.bookingProductOrder.updateMany({
              where: { id: p.referenceId, status: "PENDING_PAYMENT" },
              data: {
                status: "PAID",
                paidAt: new Date(),
                stripePaymentId: p.id,
              },
            });
          }

          return p;
        });

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

        const { userPackage } = await findUserPackageForPaymentIntent(pi.id);
        if (userPackage) {
          await prisma.userPackage.update({
            where: { id: userPackage.id },
            data: {
              status: "PAYMENT_FAILED",
              revokedAt: new Date(),
              revokedReason: "payment_failed",
            },
          });
          await cancelFutureBookingsForPackage(userPackage.id);
        }
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const pi =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
        if (!pi) break;

        const { userPackage } = await findUserPackageForPaymentIntent(pi);
        if (!userPackage) break;

        await prisma.userPackage.update({
          where: { id: userPackage.id },
          data: { status: "DISPUTED" },
        });
        await cancelFutureBookingsForPackage(userPackage.id);
        break;
      }

      case "charge.dispute.closed": {
        const dispute = event.data.object as Stripe.Dispute;
        const pi =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
        if (!pi) break;

        const { payment, userPackage } = await findUserPackageForPaymentIntent(pi);
        if (!userPackage || !payment) break;

        if (dispute.status === "lost") {
          const pkg = (userPackage as any).package as {
            credits: number | null;
            price: number;
            creditAllocations?: unknown[];
          } | null;

          const chargedAmount =
            typeof dispute.amount === "number" ? dispute.amount / 100 : payment.amount;

          const amount = pkg
            ? computeDebtAmount({
                creditsUsed: userPackage.creditsUsed,
                packageCredits: pkg.credits,
                packagePrice: pkg.price,
                hasAllocations: false,
                chargedAmount,
              })
            : chargedAmount;

          await prisma.$transaction(async (tx) => {
            await tx.userPackage.update({
              where: { id: userPackage.id },
              data: {
                status: "REVOKED",
                revokedAt: new Date(),
                revokedReason: "chargeback",
              },
            });
            await tx.stripePayment.updateMany({
              where: { stripePaymentIntentId: pi },
              data: { status: "refunded" },
            });
            if (amount > 0 && payment.memberId) {
              await tx.debt.create({
                data: {
                  tenantId: payment.tenantId,
                  userId: payment.memberId,
                  userPackageId: userPackage.id,
                  stripePaymentId: pi,
                  amount,
                  currency: payment.currency,
                  reason: "chargeback",
                  status: "OPEN",
                  notes: `Dispute lost for ${currencySymbolFor(payment.currency)}${chargedAmount}. Credits used: ${userPackage.creditsUsed}.`,
                },
              });
            }
          });
          await cancelFutureBookingsForPackage(userPackage.id);
        } else if (dispute.status === "won") {
          await prisma.userPackage.update({
            where: { id: userPackage.id },
            data: { status: "ACTIVE", revokedAt: null, revokedReason: null },
          });
          await restoreFutureBookingsForPackage(userPackage.id);
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const pi =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (!pi) break;

        const { payment, userPackage } = await findUserPackageForPaymentIntent(pi);
        if (!payment) break;

        const fullyRefunded = charge.amount_refunded >= charge.amount;

        if (fullyRefunded && userPackage) {
          const pkg = (userPackage as any).package as {
            credits: number | null;
            price: number;
          } | null;

          const refundedAmount = charge.amount_refunded / 100;
          const amount = pkg
            ? computeDebtAmount({
                creditsUsed: userPackage.creditsUsed,
                packageCredits: pkg.credits,
                packagePrice: pkg.price,
                hasAllocations: false,
                chargedAmount: refundedAmount,
              })
            : refundedAmount;

          await prisma.$transaction(async (tx) => {
            await tx.userPackage.update({
              where: { id: userPackage.id },
              data: {
                status: "REVOKED",
                revokedAt: new Date(),
                revokedReason: "refund",
              },
            });
            await tx.stripePayment.updateMany({
              where: { stripePaymentIntentId: pi },
              data: { status: "refunded" },
            });
            if (amount > 0 && userPackage.creditsUsed > 0 && payment.memberId) {
              await tx.debt.create({
                data: {
                  tenantId: payment.tenantId,
                  userId: payment.memberId,
                  userPackageId: userPackage.id,
                  stripePaymentId: pi,
                  amount,
                  currency: payment.currency,
                  reason: "refund",
                  status: "OPEN",
                  notes: `Refunded ${currencySymbolFor(payment.currency)}${refundedAmount}. Credits used: ${userPackage.creditsUsed}.`,
                },
              });
            }
          });
          await cancelFutureBookingsForPackage(userPackage.id);
        } else {
          await prisma.stripePayment.update({
            where: { stripePaymentIntentId: pi },
            data: {
              metadata: {
                partialRefund: {
                  amountRefunded: charge.amount_refunded / 100,
                  at: new Date().toISOString(),
                },
              },
            },
          });
        }
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
        const isOnDemand = memberSub.package.type === "ON_DEMAND_SUBSCRIPTION";

        let userPackageId: string | undefined;
        if (periodEnd && !isOnDemand) {
          const userPackage = await prisma.userPackage.create({
            data: {
              tenantId: memberSub.tenantId,
              userId: memberSub.userId,
              packageId: memberSub.packageId,
              creditsTotal: hasAllocations ? null : memberSub.package.credits,
              creditsUsed: 0,
              expiresAt: new Date(periodEnd * 1000),
              stripePaymentId: piId,
              status: "ACTIVE",
            },
          });
          userPackageId = userPackage.id;
          if (hasAllocations) {
            await createCreditUsagesForPackage(userPackage.id, memberSub.packageId);
          }
        }

        // On-demand subscriptions: skip UserPackage (no credits, no class
        // consumption) and create an Entitlement of type=on_demand for the
        // billing period so revenue accrual can recognize MRR.
        if (periodEnd && isOnDemand && periodStart) {
          const totalAmountCents = Math.round(amountPaid * 100);
          await prisma.entitlement.upsert({
            where: { userPackageId: `__od_${memberSub.id}_${periodEnd}` },
            create: {
              tenantId: memberSub.tenantId,
              userId: memberSub.userId,
              packageId: memberSub.packageId,
              memberSubscriptionId: memberSub.id,
              userPackageId: `__od_${memberSub.id}_${periodEnd}`,
              type: "on_demand",
              status: "active",
              totalAmountCents,
              currency: memberSub.package.currency?.toLowerCase() ?? "eur",
              creditsTotal: null,
              periodStart: new Date(periodStart * 1000),
              periodEnd: new Date(periodEnd * 1000),
            },
            update: {
              status: "active",
              totalAmountCents,
              periodEnd: new Date(periodEnd * 1000),
            },
          });
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
        const period = getSubscriptionPeriod(sub);

        await prisma.memberSubscription.update({
          where: { id: memberSub.id },
          data: {
            status: isPaused ? "paused" : (sub.status as string),
            cancelAtPeriodEnd: (sub.cancel_at_period_end as boolean) ?? false,
            ...(period && {
              currentPeriodStart: new Date(period.start * 1000),
              currentPeriodEnd: new Date(period.end * 1000),
            }),
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
        const memberSub = await prisma.memberSubscription.findUnique({
          where: { stripeSubscriptionId: sub.id },
        });
        await prisma.memberSubscription.updateMany({
          where: { stripeSubscriptionId: sub.id },
          data: { status: "canceled", canceledAt: new Date() },
        });
        if (memberSub) {
          await prisma.entitlement.updateMany({
            where: {
              memberSubscriptionId: memberSub.id,
              type: "on_demand",
              status: "active",
            },
            data: { status: "cancelled" },
          });
        }
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
