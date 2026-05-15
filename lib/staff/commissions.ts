import { prisma } from "@/lib/db";
import type { CommissionSource, Prisma } from "@prisma/client";

// Convert a float-money column (e.g. PosTransaction.amount, "$129.99") to
// cents. Rounds half-away-from-zero to dodge banker's rounding surprises
// where 1.005 would become 100 instead of 101.
function moneyToCents(amount: number): number {
  return Math.round(amount * 100);
}

// Map a PosTransaction.type / StripePayment.type string to a CommissionSource
// enum. Falls back to null when we can't classify (no commission triggers).
function classifySource(saleType: string): CommissionSource | null {
  switch (saleType) {
    case "package":
      return "PACKAGE";
    case "product":
      return "PRODUCT";
    case "subscription":
    case "membership":
      return "SUBSCRIPTION";
    case "penalty":
      return "PENALTY";
    case "pos":
    case "class":
    default:
      return null;
  }
}

interface CommissionTarget {
  tenantId: string;
  userId: string; // staff member who gets the commission
  source: CommissionSource;
  baseAmountCents: number;
  currency: string;
  occurredAt: Date;
  packageId?: string | null;
  productId?: string | null;
  posTransactionId?: string | null;
  stripePaymentId?: string | null;
  studioId?: string | null;
}

// Find every active commission rule for this staff member that matches the
// sale. Both POS_ANY and the specific source type are considered. Rules
// scoped to a packageId / productId only match the corresponding sale.
async function findApplicableRules(t: CommissionTarget) {
  const now = t.occurredAt;
  const sourceWhere: Prisma.StaffCommissionRuleWhereInput["sourceType"] = {
    in: ["POS_ANY", t.source],
  };

  const rules = await prisma.staffCommissionRule.findMany({
    where: {
      tenantId: t.tenantId,
      userId: t.userId,
      isActive: true,
      sourceType: sourceWhere,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      AND: [
        // package scope: null matches any package; non-null must match exactly
        { OR: [{ packageId: null }, { packageId: t.packageId ?? "__none__" }] },
        { OR: [{ productId: null }, { productId: t.productId ?? "__none__" }] },
      ],
    },
  });

  // Refine: a rule with source=PACKAGE shouldn't fire on a PRODUCT sale.
  // The POS_ANY rule fires for any non-null source.
  return rules.filter((r) => {
    if (r.sourceType === "POS_ANY") return true;
    return r.sourceType === t.source;
  });
}

// Accrue every applicable commission for a sale. Idempotent: uses the
// (sale, rule) unique constraint to upsert at most one earning per pair.
// Callers should invoke this after the sale row has been persisted.
export async function accrueCommissionsForSale(
  target: CommissionTarget,
): Promise<number> {
  const rules = await findApplicableRules(target);
  if (rules.length === 0) return 0;

  let created = 0;
  for (const rule of rules) {
    const amount = computeCommissionAmount(target.baseAmountCents, rule);
    if (amount <= 0) continue;

    const data = {
      tenantId: target.tenantId,
      userId: target.userId,
      studioId: target.studioId ?? null,
      ruleId: rule.id,
      sourceType: target.source,
      posTransactionId: target.posTransactionId ?? null,
      stripePaymentId: target.stripePaymentId ?? null,
      baseAmountCents: target.baseAmountCents,
      percentBps: rule.percentBps ?? null,
      commissionAmountCents: amount,
      currency: target.currency,
      occurredAt: target.occurredAt,
    };

    try {
      if (target.posTransactionId) {
        await prisma.staffCommissionEarning.upsert({
          where: {
            posTransactionId_ruleId: {
              posTransactionId: target.posTransactionId,
              ruleId: rule.id,
            },
          },
          update: {}, // immutable once accrued
          create: data,
        });
      } else if (target.stripePaymentId) {
        await prisma.staffCommissionEarning.upsert({
          where: {
            stripePaymentId_ruleId: {
              stripePaymentId: target.stripePaymentId,
              ruleId: rule.id,
            },
          },
          update: {},
          create: data,
        });
      }
      created++;
    } catch (err) {
      console.error("[staff-commissions] accrue failed", {
        ruleId: rule.id,
        target,
        err,
      });
    }
  }
  return created;
}

function computeCommissionAmount(
  baseAmountCents: number,
  rule: { percentBps: number | null; flatAmountCents: number | null },
): number {
  if (rule.percentBps && rule.percentBps > 0) {
    return Math.round((baseAmountCents * rule.percentBps) / 10_000);
  }
  if (rule.flatAmountCents && rule.flatAmountCents > 0) {
    return rule.flatAmountCents;
  }
  return 0;
}

// Entry point invoked from POS sale completion. The processedById column is
// the staff member who rang the sale.
export async function onPosTransactionCompleted(posTransactionId: string) {
  const tx = await prisma.posTransaction.findUnique({
    where: { id: posTransactionId },
    select: {
      id: true,
      tenantId: true,
      processedById: true,
      amount: true,
      currency: true,
      type: true,
      status: true,
      referenceId: true,
      conceptSub: true,
      createdAt: true,
    },
  });
  if (!tx || !tx.processedById) return 0;
  if (tx.status !== "completed") return 0;

  const source = classifySource(tx.type);
  if (!source) return 0;

  return accrueCommissionsForSale({
    tenantId: tx.tenantId,
    userId: tx.processedById,
    source,
    baseAmountCents: moneyToCents(tx.amount),
    currency: tx.currency.toUpperCase(),
    occurredAt: tx.createdAt,
    packageId: source === "PACKAGE" ? tx.referenceId : null,
    productId: source === "PRODUCT" ? tx.referenceId : null,
    posTransactionId: tx.id,
  });
}

// Entry point invoked from Stripe webhook (payment_intent.succeeded) and
// from the admin "attribute sale" action. Skips if no seller is attributed.
export async function onStripePaymentSucceeded(stripePaymentId: string) {
  const sp = await prisma.stripePayment.findUnique({
    where: { id: stripePaymentId },
    select: {
      id: true,
      tenantId: true,
      soldByUserId: true,
      amount: true,
      currency: true,
      type: true,
      status: true,
      referenceId: true,
      createdAt: true,
    },
  });
  if (!sp || !sp.soldByUserId) return 0;
  if (sp.status !== "succeeded") return 0;

  const source = classifySource(sp.type);
  if (!source) return 0;

  return accrueCommissionsForSale({
    tenantId: sp.tenantId,
    userId: sp.soldByUserId,
    source,
    baseAmountCents: moneyToCents(sp.amount),
    currency: sp.currency.toUpperCase(),
    occurredAt: sp.createdAt,
    packageId: source === "PACKAGE" ? sp.referenceId : null,
    productId: source === "PRODUCT" ? sp.referenceId : null,
    stripePaymentId: sp.id,
  });
}

// Reverse a commission when its underlying sale is refunded or voided.
// We don't delete — keeps an audit trail — just mark VOIDED so payroll
// excludes it.
export async function voidCommissionsForSale(args: {
  posTransactionId?: string;
  stripePaymentId?: string;
  reason: string;
}): Promise<number> {
  const where: Prisma.StaffCommissionEarningWhereInput = {
    status: "EARNED",
    OR: [
      args.posTransactionId ? { posTransactionId: args.posTransactionId } : { id: "__none__" },
      args.stripePaymentId ? { stripePaymentId: args.stripePaymentId } : { id: "__none__" },
    ],
  };
  const res = await prisma.staffCommissionEarning.updateMany({
    where,
    data: { status: "VOIDED", voidReason: args.reason },
  });
  return res.count;
}
