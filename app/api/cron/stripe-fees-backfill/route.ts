import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripeClientForTenantId } from "@/lib/stripe/tenant-stripe";
import type Stripe from "stripe";

/**
 * Backfill Stripe fee / net / available-on for succeeded payments the
 * payment_intent.succeeded webhook couldn't capture.
 *
 * The charge's balance transaction often isn't created yet the instant the
 * webhook fires, so the handler reads a null `balance_transaction` — no error
 * is thrown (so nothing is logged), it just silently leaves stripeFee /
 * netAmount / availableOn null, which shows as "—" under FEE / NET and
 * ARRIVES AT BANK in /admin/finance. This hourly sweep fills them in once the
 * balance transaction exists (which it does within minutes).
 *
 * Only real PaymentIntents (`pi_…`) are handled; subscription rows carry a
 * `backfill_sub_…` placeholder id and get their economics elsewhere.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const payments = await prisma.stripePayment.findMany({
    where: {
      status: "succeeded",
      stripeFee: null,
      stripePaymentIntentId: { startsWith: "pi_" },
      createdAt: { gte: cutoff },
    },
    select: { id: true, tenantId: true, stripePaymentIntentId: true },
    take: 200,
  });

  // Resolve each tenant's country-scoped Stripe client + connected account once.
  const tenantCtx = new Map<
    string,
    { stripe: Stripe; account: string } | null
  >();

  let filled = 0;
  let pending = 0;
  let failed = 0;

  for (const p of payments) {
    const piId = p.stripePaymentIntentId;
    if (!piId) continue;
    try {
      let ctx = tenantCtx.get(p.tenantId);
      if (ctx === undefined) {
        const tenant = await prisma.tenant.findUnique({
          where: { id: p.tenantId },
          select: { stripeAccountId: true },
        });
        ctx = tenant?.stripeAccountId
          ? {
              stripe: await getStripeClientForTenantId(p.tenantId),
              account: tenant.stripeAccountId,
            }
          : null;
        tenantCtx.set(p.tenantId, ctx);
      }
      if (!ctx) continue;

      const fullPi = await ctx.stripe.paymentIntents.retrieve(
        piId,
        { expand: ["latest_charge.balance_transaction"] },
        { stripeAccount: ctx.account },
      );
      const charge =
        typeof fullPi.latest_charge === "object" && fullPi.latest_charge
          ? fullPi.latest_charge
          : null;
      const bt =
        charge && typeof charge.balance_transaction === "object"
          ? charge.balance_transaction
          : null;
      if (!bt) {
        // Balance transaction not created yet — pick it up next run.
        pending++;
        continue;
      }

      await prisma.stripePayment.update({
        where: { id: p.id },
        data: {
          stripeFee: bt.fee / 100,
          netAmount: bt.net / 100,
          ...(bt.available_on
            ? { availableOn: new Date(bt.available_on * 1000) }
            : {}),
        },
      });
      filled++;
    } catch (err) {
      console.error("[stripe-fees-backfill]", piId, err);
      failed++;
    }
  }

  return NextResponse.json({ scanned: payments.length, filled, pending, failed });
}
