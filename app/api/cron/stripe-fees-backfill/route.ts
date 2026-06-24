import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStripeClientForTenantId } from "@/lib/stripe/tenant-stripe";
import type Stripe from "stripe";

/**
 * Backfill Stripe fee / net / available-on for succeeded payments the
 * payment_intent.succeeded webhook couldn't capture.
 *
 * The charge's balance transaction often isn't created yet the instant the
 * webhook fires (async capture), so the handler reads a null `balance_transaction`
 * — no error is thrown, it just leaves stripeFee / netAmount / availableOn null,
 * which shows as "—" under FEE / NET and ARRIVES AT BANK in /admin/finance.
 * This sweep fills them in once the balance transaction exists.
 *
 * Two kinds of rows:
 *  - One-off card payments: a real PaymentIntent (`pi_…`) on the row.
 *  - Subscription renewals: the row carries the invoice (`in_…`) or a
 *    `backfill_sub_…`/`sub_…` placeholder; the economics live on the invoice's
 *    PaymentIntent, which we resolve before reading the balance transaction.
 */
type Ctx = { stripe: Stripe; account: string };

/** Pull the PaymentIntent id off an expanded invoice's payments list. */
function piFromInvoice(inv: unknown): string | null {
  const payments = (inv as { payments?: { data?: unknown[] } } | null)?.payments?.data ?? [];
  for (const entry of payments) {
    const e = entry as { payment?: { payment_intent?: string | { id?: string } } };
    const pi = e.payment?.payment_intent;
    if (typeof pi === "string") return pi;
    if (pi && typeof pi === "object" && pi.id) return pi.id;
  }
  // Legacy field, still present on older invoices.
  const legacy = (inv as { payment_intent?: string }).payment_intent;
  return typeof legacy === "string" ? legacy : null;
}

async function balanceTxnForPi(ctx: Ctx, piId: string) {
  const fullPi = await ctx.stripe.paymentIntents.retrieve(
    piId,
    { expand: ["latest_charge.balance_transaction"] },
    { stripeAccount: ctx.account },
  );
  const charge =
    typeof fullPi.latest_charge === "object" && fullPi.latest_charge
      ? fullPi.latest_charge
      : null;
  return charge && typeof charge.balance_transaction === "object"
    ? charge.balance_transaction
    : null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Resolve each tenant's country-scoped Stripe client + connected account once.
  const tenantCtx = new Map<string, Ctx | null>();
  async function ctxFor(tenantId: string): Promise<Ctx | null> {
    let ctx = tenantCtx.get(tenantId);
    if (ctx === undefined) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { stripeAccountId: true },
      });
      ctx = tenant?.stripeAccountId
        ? { stripe: await getStripeClientForTenantId(tenantId), account: tenant.stripeAccountId }
        : null;
      tenantCtx.set(tenantId, ctx);
    }
    return ctx;
  }

  let filled = 0, pending = 0, failed = 0;

  // ── 1) One-off PaymentIntent rows ──
  const piRows = await prisma.stripePayment.findMany({
    where: {
      status: "succeeded",
      stripeFee: null,
      stripePaymentIntentId: { startsWith: "pi_" },
      createdAt: { gte: cutoff },
    },
    select: { id: true, tenantId: true, stripePaymentIntentId: true },
    take: 200,
  });

  for (const p of piRows) {
    const piId = p.stripePaymentIntentId;
    if (!piId) continue;
    try {
      const ctx = await ctxFor(p.tenantId);
      if (!ctx) continue;
      const bt = await balanceTxnForPi(ctx, piId);
      if (!bt) { pending++; continue; }
      await prisma.stripePayment.update({
        where: { id: p.id },
        data: {
          stripeFee: bt.fee / 100,
          netAmount: bt.net / 100,
          ...(bt.available_on ? { availableOn: new Date(bt.available_on * 1000) } : {}),
        },
      });
      filled++;
    } catch (err) {
      console.error("[stripe-fees-backfill] pi", piId, err);
      failed++;
    }
  }

  // ── 2) Subscription rows (resolve invoice/subscription → PaymentIntent) ──
  const subRows = await prisma.stripePayment.findMany({
    where: {
      type: "subscription",
      status: "succeeded",
      stripeFee: null,
      createdAt: { gte: cutoff },
    },
    select: { id: true, tenantId: true, stripePaymentIntentId: true, amount: true },
    take: 100,
  });

  for (const p of subRows) {
    const ref = p.stripePaymentIntentId;
    if (!ref) continue;
    try {
      const ctx = await ctxFor(p.tenantId);
      if (!ctx) continue;

      let piId: string | null = null;
      if (ref.startsWith("pi_")) {
        piId = ref;
      } else if (ref.startsWith("in_")) {
        // Live renewal: the row holds the invoice id.
        const inv = await ctx.stripe.invoices.retrieve(
          ref,
          { expand: ["payments"] },
          { stripeAccount: ctx.account },
        );
        piId = piFromInvoice(inv);
      } else {
        // backfill_sub_<subBody> or sub_… → resolve via the subscription's
        // latest invoice (guarded by amount so multi-renewal subs don't grab
        // the wrong invoice).
        const subId = ref.startsWith("backfill_sub_")
          ? "sub_" + ref.slice("backfill_sub_".length)
          : ref.startsWith("sub_")
            ? ref
            : null;
        if (subId) {
          const sub = await ctx.stripe.subscriptions.retrieve(
            subId,
            { expand: ["latest_invoice.payments"] },
            { stripeAccount: ctx.account },
          );
          const inv = sub.latest_invoice as unknown as { total?: number } | null;
          if (inv && Math.round(inv.total ?? -1) === Math.round(p.amount * 100)) {
            piId = piFromInvoice(inv);
          }
        }
      }

      if (!piId) { pending++; continue; }
      const bt = await balanceTxnForPi(ctx, piId);
      if (!bt) { pending++; continue; }
      await prisma.stripePayment.update({
        where: { id: p.id },
        data: {
          stripeFee: bt.fee / 100,
          netAmount: bt.net / 100,
          ...(bt.available_on ? { availableOn: new Date(bt.available_on * 1000) } : {}),
        },
      });
      filled++;
    } catch (err) {
      console.error("[stripe-fees-backfill] sub", ref, err);
      failed++;
    }
  }

  return NextResponse.json({ filled, pending, failed });
}
