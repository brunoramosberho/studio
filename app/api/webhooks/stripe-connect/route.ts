import { NextRequest, NextResponse, after } from "next/server";
import { constructConnectStripeWebhookEvent } from "@/lib/stripe/webhook-verify";
import { pushApplePassUpdate } from "@/lib/wallet/apns";
import { currencySymbolFor } from "@/lib/currency";
import { prisma } from "@/lib/db";
import { updateLifecycle } from "@/lib/referrals/lifecycle";
import { createCreditUsagesForPackage, restoreCredit } from "@/lib/credits";
import { computeDebtAmount } from "@/lib/billing/debt";
import { getSubscriptionPeriod } from "@/lib/stripe/helpers";
import { getInvoiceSubscriptionId } from "@/lib/stripe/invoice";
import { getStripe } from "@/lib/stripe/client";
import { getStripeClientForTenantId } from "@/lib/stripe/tenant-stripe";
import type Stripe from "stripe";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "mgic.app";

/**
 * Register the tenant's subdomain as a Payment Method Domain on the
 * connected account. Required for Apple Pay / Google Pay on direct charges.
 * Idempotent: ignores `payment_method_domain_already_exists`.
 */
async function ensureWalletDomainRegistered(
  connectedAccountId: string,
  tenantSlug: string,
): Promise<void> {
  const domain = `${tenantSlug}.${ROOT_DOMAIN}`;
  const stripe = getStripe();
  try {
    await stripe.paymentMethodDomains.create(
      { domain_name: domain },
      { stripeAccount: connectedAccountId },
    );
    console.log(`[wallet-domain] registered ${domain} on ${connectedAccountId}`);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "payment_method_domain_already_exists") return;
    console.error(
      `[wallet-domain] failed to register ${domain} on ${connectedAccountId}`,
      err,
    );
  }
}

/**
 * Cancel all CONFIRMED future bookings tied to a package and return any
 * credits they were holding back to the package. Used when a payment is
 * refunded or disputed — the buyer shouldn't owe anything for seats they
 * haven't actually attended yet.
 */
async function cancelFutureBookingsForPackage(userPackageId: string): Promise<number> {
  const futureBookings = await prisma.booking.findMany({
    where: {
      packageUsed: userPackageId,
      status: "CONFIRMED",
      class: { startsAt: { gt: new Date() } },
    },
    include: { class: { select: { classTypeId: true } } },
  });

  if (futureBookings.length === 0) return 0;

  for (const b of futureBookings) {
    await restoreCredit(userPackageId, b.class.classTypeId);
  }

  // Clear spotNumber so the freed seat doesn't stay occupied at the DB
  // unique-constraint level (`@@unique([classId, spotNumber])`).
  await prisma.booking.updateMany({
    where: { id: { in: futureBookings.map((b) => b.id) } },
    data: { status: "CANCELLED", spotNumber: null },
  });

  return futureBookings.length;
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

    const event = constructConnectStripeWebhookEvent(body, signature);

    const connectedAccountId = event.account;

    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object;

        // Pull the underlying charge + balance transaction so we can store
        // the Stripe fee, the net the studio receives, and the date funds
        // become available in the connected account's bank. Without this the
        // /admin/finance view has nothing to show in the "Fee / Net /
        // Arrives at bank" columns.
        let stripeFee: number | null = null;
        let netAmount: number | null = null;
        let availableOn: Date | null = null;
        try {
          if (connectedAccountId) {
            // Magic runs one platform Stripe entity per country, so the
            // connected account is only reachable through *its tenant's*
            // country-scoped client. Using the default getStripe() here throws
            // "does not have access to account" for any tenant whose entity
            // isn't the default one (e.g. ES), which silently left
            // fee/net/availableOn null in /admin/finance. Resolve the tenant
            // client from the PI metadata (set in createMemberPayment).
            const tenantId =
              typeof pi.metadata?.tenantId === "string" && pi.metadata.tenantId
                ? pi.metadata.tenantId
                : null;
            const stripeForTenant = tenantId
              ? await getStripeClientForTenantId(tenantId)
              : getStripe();
            const fullPi = await stripeForTenant.paymentIntents.retrieve(
              pi.id,
              { expand: ["latest_charge.balance_transaction"] },
              { stripeAccount: connectedAccountId },
            );
            const charge =
              typeof fullPi.latest_charge === "object" && fullPi.latest_charge
                ? fullPi.latest_charge
                : null;
            const bt =
              charge && typeof charge.balance_transaction === "object"
                ? charge.balance_transaction
                : null;
            if (bt) {
              stripeFee = bt.fee / 100;
              netAmount = bt.net / 100;
              if (bt.available_on) {
                availableOn = new Date(bt.available_on * 1000);
              }
            }
          }
        } catch (err) {
          console.error(
            "[stripe-webhook] failed to expand balance_transaction",
            err,
          );
        }

        // Marcar pago + activar UserPackage en una sola transacción para evitar
        // estados intermedios donde el pago aparece como succeeded pero el
        // paquete sigue PENDING_PAYMENT (impide al usuario reservar).
        const payment = await prisma.$transaction(async (tx) => {
          await tx.stripePayment.updateMany({
            where: { stripePaymentIntentId: pi.id },
            data: {
              status: "succeeded",
              ...(stripeFee != null && { stripeFee }),
              ...(netAmount != null && { netAmount }),
              ...(availableOn && { availableOn }),
            },
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
        if (payment?.id) {
          import("@/lib/staff")
            .then(({ onStripePaymentSucceeded }) => onStripePaymentSucceeded(payment.id))
            .catch((err) =>
              console.error("[stripe-webhook] commission accrual failed", payment.id, err),
            );
        }
        if (payment?.memberId) {
          const { memberId, tenantId } = payment;
          // Refresh the member's Apple Wallet pass after the response — a new
          // pack/membership changes the card's plan line.
          try {
            after(() => pushApplePassUpdate(memberId, tenantId).catch(() => {}));
          } catch {}
        }
        break;
      }

      case "payment_intent.canceled": {
        // Fires when a PaymentIntent times out (Stripe auto-cancels after
        // ~24h of inactivity) or is explicitly canceled. Without this our
        // StripePayment row would stay "pending" forever.
        const pi = event.data.object;
        await prisma.stripePayment.updateMany({
          where: { stripePaymentIntentId: pi.id, status: "pending" },
          data: { status: "canceled" },
        });
        const { userPackage } = await findUserPackageForPaymentIntent(pi.id);
        if (userPackage && userPackage.status === "PENDING_PAYMENT") {
          await prisma.userPackage.update({
            where: { id: userPackage.id },
            data: {
              status: "REVOKED",
              revokedAt: new Date(),
              revokedReason: "payment_failed",
            },
          });
          await cancelFutureBookingsForPackage(userPackage.id);
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

          // Cancel future bookings + restore credits first so the debt
          // calculation only counts what was actually consumed.
          await cancelFutureBookingsForPackage(userPackage.id);
          const refreshed = await prisma.userPackage.findUnique({
            where: { id: userPackage.id },
          });
          const effectiveCreditsUsed = refreshed?.creditsUsed ?? userPackage.creditsUsed;

          const amount = pkg
            ? computeDebtAmount({
                creditsUsed: effectiveCreditsUsed,
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
            if (amount > 0 && effectiveCreditsUsed > 0 && payment.memberId) {
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
                  notes: `Dispute lost for ${currencySymbolFor(payment.currency)}${chargedAmount}. Credits actually consumed: ${effectiveCreditsUsed}.`,
                },
              });
            }
          });
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

          // Cancel future bookings + restore their credits FIRST. Otherwise
          // creditsUsed still counts seats the buyer never attended and we'd
          // generate a phantom debt for a refund that fully made the studio
          // whole.
          await cancelFutureBookingsForPackage(userPackage.id);

          // Re-read the package so creditsUsed reflects only what's truly
          // been consumed (past CONFIRMED, ATTENDED, NO_SHOW bookings).
          const refreshed = await prisma.userPackage.findUnique({
            where: { id: userPackage.id },
          });
          const effectiveCreditsUsed = refreshed?.creditsUsed ?? userPackage.creditsUsed;

          const amount = pkg
            ? computeDebtAmount({
                creditsUsed: effectiveCreditsUsed,
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
            if (amount > 0 && effectiveCreditsUsed > 0 && payment.memberId) {
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
                  notes: `Refunded ${currencySymbolFor(payment.currency)}${refundedAmount}. Credits actually consumed: ${effectiveCreditsUsed}.`,
                },
              });
            }
          });
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
        const subId = getInvoiceSubscriptionId(inv);
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

      case "invoice.payment_action_required": {
        // Renovación automática que el banco bloqueó pidiendo SCA. Stripe
        // ya intentó cobrar y necesita que el cliente vuelva a confirmar.
        // Marcamos la suscripción como past_due para que la UI/cron pueda
        // alertar al cliente y mostrar el siguiente CTA.
        const inv = event.data.object as unknown as Record<string, unknown>;
        const subId = getInvoiceSubscriptionId(inv);
        if (!subId) break;
        await prisma.memberSubscription.updateMany({
          where: { stripeSubscriptionId: subId },
          data: { status: "past_due" },
        });
        // TODO: enviar email/push al member para que vuelva a /my/subscription
        // y complete el 3DS. Por ahora dejamos solo el cambio de status.
        console.log(
          `[stripe-webhook] invoice.payment_action_required for sub ${subId} — member needs to re-authenticate`,
        );
        break;
      }

      case "invoice.upcoming": {
        // Stripe avisa N días antes de la renovación (default: 7). Útil para
        // armar un correo "tu suscripción se renueva el X por Y €". El flag
        // queda registrado en logs; el email real lo armamos cuando empiece
        // a haber tráfico de renovaciones reales.
        const inv = event.data.object as unknown as Record<string, unknown>;
        const subId = getInvoiceSubscriptionId(inv);
        const nextAttempt =
          typeof inv.next_payment_attempt === "number"
            ? new Date(inv.next_payment_attempt * 1000)
            : null;
        console.log(
          `[stripe-webhook] invoice.upcoming for sub ${subId} — next attempt ${nextAttempt?.toISOString() ?? "unknown"}`,
        );
        // TODO: enviar email al member ("tu suscripción se renueva en N días")
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as unknown as Record<string, unknown>;
        const subId = getInvoiceSubscriptionId(inv);
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
        try {
          after(() => pushApplePassUpdate(memberSub.userId, memberSub.tenantId).catch(() => {}));
        } catch {}
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
          try {
            after(() => pushApplePassUpdate(memberSub.userId, memberSub.tenantId).catch(() => {}));
          } catch {}
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

        // Once the merchant can take charges, make sure their subdomain is
        // registered for Apple Pay / Google Pay on this connected account.
        // Domain registration on the platform account isn't enough for
        // direct charges. Idempotent, so safe to run on every update.
        if (account.charges_enabled) {
          const tenant = await prisma.tenant.findFirst({
            where: { stripeAccountId: connectedAccountId },
            select: { slug: true },
          });
          if (tenant?.slug) {
            ensureWalletDomainRegistered(connectedAccountId, tenant.slug).catch(
              (err) =>
                console.error("[wallet-domain] background error", err),
            );
          }
        }
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
