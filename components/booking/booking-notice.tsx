"use client";

import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePolicies } from "@/hooks/usePolicies";
import { useCurrency } from "@/components/tenant-provider";
import { formatMoney } from "@/lib/currency";
import { policyClauses, type NoticePolicy } from "@/lib/policies/notice";
import { noticeSentences } from "@/lib/policies/render";

/**
 * The cancellation terms as one sentence pair, built from the studio's actual
 * policy.
 *
 * Takes the policy as an argument rather than reading it from the hook so the
 * admin preview can render unsaved edits through this same path. Two copies of
 * this composition would drift, and the admin would be previewing something
 * other than what members read.
 */
export function useBookingPolicyText(policy: NoticePolicy): string {
  const t = useTranslations("classDetail");
  const currency = useCurrency();

  return noticeSentences(
    policyClauses(policy),
    (key, values) => t(key, values),
    (amount) => formatMoney(amount, currency),
  ).join(" ");
}

/**
 * The small print under the booking button: what happens if you cancel late,
 * followed by whatever else the studio wants members to know.
 *
 * The old copy was a fixed sentence that said "12 hours" to every studio and
 * never mentioned money, while Betoro and FDV were both already charging a
 * no-show fee — members found out about it afterwards.
 */
export function BookingNotice() {
  const policies = usePolicies();
  const policyText = useBookingPolicyText(policies);

  return (
    <div className="mt-10 flex items-start gap-2.5">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted/40" />
      <div className="space-y-1.5 text-[11px] leading-relaxed text-muted/60">
        <p>{policyText}</p>
        {/* The studio's own words get their own paragraph and keep their line
            breaks — it is usually a separate instruction ("bring your mat"),
            not a continuation of the cancellation terms. */}
        {policies.bookingNotice && (
          <p className="whitespace-pre-line">{policies.bookingNotice}</p>
        )}
      </div>
    </div>
  );
}
