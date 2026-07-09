import { prisma } from "@/lib/db";
import type { CommissionSource, Prisma } from "@prisma/client";

// Convert a float-money column (e.g. PosTransaction.amount, "$129.99") to
// cents. Rounds half-away-from-zero to dodge banker's rounding surprises
// where 1.005 would become 100 instead of 101.
function moneyToCents(amount: number): number {
  return Math.round(amount * 100);
}

// ── Volume tiers (Option A: whole-month-at-achieved-tier) ────────────────────
// A tiered rule pays the rate of the tier its holder's total matching sales
// reach in the period, applied to that whole volume. Stored as a JSON array of
// { minCents, percentBps } on StaffCommissionRule.tiers.

export interface CommissionTier {
  // Inclusive lower bound of monthly matching-sales volume (cents) at which
  // this tier's rate kicks in. A well-formed list starts at 0.
  minCents: number;
  // Rate applied to the WHOLE volume once this tier is reached. 500 = 5%.
  percentBps: number;
}

// Parse + sanitize a tiers JSON blob into a sorted, valid tier list. Returns []
// when the blob isn't a usable tier list, so callers treat the rule as
// non-tiered (flat percent / flat amount).
export function parseTiers(raw: unknown): CommissionTier[] {
  if (!Array.isArray(raw)) return [];
  const tiers: CommissionTier[] = [];
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const rec = t as Record<string, unknown>;
    const minCents = Math.round(Number(rec.minCents));
    const percentBps = Math.round(Number(rec.percentBps));
    if (!Number.isFinite(minCents) || minCents < 0) continue;
    if (!Number.isFinite(percentBps) || percentBps < 0 || percentBps > 10_000) continue;
    tiers.push({ minCents, percentBps });
  }
  return tiers.sort((a, b) => a.minCents - b.minCents);
}

// The tier reached by `volumeCents` — the last tier whose minCents <= volume.
export function tierForVolume(
  tiers: CommissionTier[],
  volumeCents: number,
): { tier: CommissionTier; index: number } | null {
  let picked: { tier: CommissionTier; index: number } | null = null;
  for (let i = 0; i < tiers.length; i++) {
    if (volumeCents >= tiers[i].minCents) picked = { tier: tiers[i], index: i };
    else break;
  }
  return picked;
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
    // Tiered rules are computed at read time from the month's total volume, not
    // accrued per-sale — skip them here so they never double-count.
    if (parseTiers(rule.tiers).length > 0) continue;
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

// The PosTransaction / StripePayment `type` strings that a given commission
// source counts as sales of. Mirrors classifySource() in reverse.
function saleTypesForSource(source: CommissionSource): string[] {
  switch (source) {
    case "PRODUCT":
      return ["product"];
    case "PACKAGE":
      return ["package"];
    case "SUBSCRIPTION":
      return ["subscription", "membership"];
    case "PENALTY":
      return ["penalty"];
    case "POS_ANY":
      return ["product", "package", "subscription", "membership", "penalty"];
    default:
      return [];
  }
}

export interface TieredCommissionResult {
  ruleId: string;
  sourceType: CommissionSource;
  studioId: string | null;
  // Total matching sales for the holder in the period (cents).
  volumeCents: number;
  // The rate of the reached tier (bps) and its position in the ladder.
  percentBps: number;
  tierIndex: number;
  tierCount: number;
  // Commission = volumeCents * percentBps / 10000.
  amountCents: number;
}

// Compute volume-tiered commissions for a set of staff over a period (Option A:
// the tier reached by each holder's total matching sales in the period sets the
// rate applied to their whole matching volume). Tiered rules never accrue
// per-sale earnings, so this is the single source of truth for their payout —
// call it wherever monthly commission is read (staff list, payroll). Sales are
// counted only inside each rule's own effective window ∩ the period, so an
// effective-dated tier change doesn't retroactively re-rate earlier sales.
export async function computeTieredCommissions(args: {
  tenantId: string;
  userIds: string[];
  from: Date;
  to: Date;
}): Promise<Map<string, { totalCents: number; rules: TieredCommissionResult[] }>> {
  const { tenantId, userIds, from, to } = args;
  const out = new Map<string, { totalCents: number; rules: TieredCommissionResult[] }>();
  if (userIds.length === 0) return out;

  const rules = await prisma.staffCommissionRule.findMany({
    where: {
      tenantId,
      userId: { in: userIds },
      isActive: true,
      effectiveFrom: { lt: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }],
    },
  });

  for (const rule of rules) {
    const tiers = parseTiers(rule.tiers);
    if (tiers.length === 0) continue;
    const saleTypes = saleTypesForSource(rule.sourceType);
    if (saleTypes.length === 0) continue;

    // Clamp the sales window to the rule's effective window ∩ the period.
    const windowStart = rule.effectiveFrom > from ? rule.effectiveFrom : from;
    const windowEnd = rule.effectiveTo && rule.effectiveTo < to ? rule.effectiveTo : to;
    if (windowEnd <= windowStart) continue;

    const scope: { referenceId?: string } = {};
    if (rule.productId) scope.referenceId = rule.productId;
    else if (rule.packageId) scope.referenceId = rule.packageId;

    const [posAgg, stripeAgg] = await Promise.all([
      prisma.posTransaction.aggregate({
        where: {
          tenantId,
          processedById: rule.userId,
          status: "completed",
          type: { in: saleTypes },
          createdAt: { gte: windowStart, lt: windowEnd },
          ...scope,
        },
        _sum: { amount: true },
      }),
      prisma.stripePayment.aggregate({
        where: {
          tenantId,
          soldByUserId: rule.userId,
          status: "succeeded",
          type: { in: saleTypes },
          createdAt: { gte: windowStart, lt: windowEnd },
          ...scope,
        },
        _sum: { amount: true },
      }),
    ]);

    const volumeCents = moneyToCents(
      (posAgg._sum.amount ?? 0) + (stripeAgg._sum.amount ?? 0),
    );
    if (volumeCents <= 0) continue;
    const picked = tierForVolume(tiers, volumeCents);
    if (!picked) continue;
    const amountCents = Math.round((volumeCents * picked.tier.percentBps) / 10_000);
    if (amountCents <= 0) continue;

    const entry = out.get(rule.userId) ?? { totalCents: 0, rules: [] };
    entry.rules.push({
      ruleId: rule.id,
      sourceType: rule.sourceType,
      studioId: rule.studioId,
      volumeCents,
      percentBps: picked.tier.percentBps,
      tierIndex: picked.index,
      tierCount: tiers.length,
      amountCents,
    });
    entry.totalCents += amountCents;
    out.set(rule.userId, entry);
  }

  return out;
}
