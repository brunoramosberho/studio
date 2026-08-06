import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/currency";
import { resolveTenantCurrency } from "@/lib/currency";
import { resolveCancellationPolicy, resolveNoShowPenalty } from "@/lib/no-show-penalty";
import { bookingClauses } from "./notice";
import { noticeSentences } from "./render";

/**
 * The cancellation terms for one specific booking, ready to drop into an email.
 *
 * Emails know something the class page does not: which plan is paying for this
 * seat. So there is no reason to hedge — a member on FDV Unlimited can be told
 * their late cancel costs $100 and their no-show $200, instead of a generic
 * sentence that is wrong for them in both directions.
 *
 * Everything is resolved by tenant id rather than the request-scoped helpers,
 * because these emails are also sent from crons and webhooks where there is no
 * tenant header to read.
 */
export async function bookingPolicyNotice(opts: {
  tenantId: string;
  userId: string | null;
  packageUsed: string | null;
  locale: string;
}): Promise<{ sentences: string[]; studioNotice: string | null }> {
  const [tenant, currency, cancelPolicy, t] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: opts.tenantId },
      select: {
        noShowPenaltyEnabled: true,
        noShowLoseCredit: true,
        noShowChargeFee: true,
        noShowPenaltyAmount: true,
        noShowFeeAmountUnlimited: true,
        noShowPenaltyGraceHours: true,
        bookingNotice: true,
      },
    }),
    resolveTenantCurrency(opts.tenantId),
    resolveCancellationPolicy({
      tenantId: opts.tenantId,
      userId: opts.userId,
      packageUsed: opts.packageUsed,
    }),
    getTranslations({ locale: opts.locale, namespace: "classDetail" }),
  ]);

  if (!tenant) return { sentences: [], studioNotice: null };

  const penalty = resolveNoShowPenalty(
    tenant,
    cancelPolicy.isUnlimited,
    cancelPolicy.noShowFeeCentsOverride,
  );

  const clauses = bookingClauses({
    windowHours: cancelPolicy.windowHours,
    isUnlimited: cancelPolicy.isUnlimited,
    // The booking API already zeroes this for pack members, who forfeit the
    // credit instead.
    lateCancelFee: cancelPolicy.lateCancelFeeCents / 100,
    noShowLosesCredit: penalty.loseCredit,
    noShowFee: penalty.feeAmountCents / 100,
  });

  return {
    sentences: noticeSentences(
      clauses,
      (key, values) => t(key, values),
      (amount) => formatMoney(amount, currency),
    ),
    studioNotice: tenant.bookingNotice,
  };
}
