"use client";

import { useQuery } from "@tanstack/react-query";

export interface TenantPolicies {
  cancellationWindowHours: number;
  noShowPenaltyEnabled: boolean;
  noShowLoseCredit: boolean;
  noShowChargeFee: boolean;
  noShowPenaltyAmount: number | null;
  noShowFeeAmountUnlimited: number | null;
  noShowPenaltyGraceHours: number;
  visibleScheduleDays: number;
}

const DEFAULTS: TenantPolicies = {
  cancellationWindowHours: 12,
  noShowPenaltyEnabled: false,
  noShowLoseCredit: true,
  noShowChargeFee: false,
  noShowPenaltyAmount: null,
  noShowFeeAmountUnlimited: null,
  noShowPenaltyGraceHours: 24,
  visibleScheduleDays: 7,
};

export function usePolicies() {
  const { data } = useQuery<TenantPolicies>({
    queryKey: ["tenant-policies"],
    queryFn: async () => {
      const res = await fetch("/api/admin/policies");
      if (!res.ok) return DEFAULTS;
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // cache for 5 min
  });

  return data ?? DEFAULTS;
}

export function getCancellationWindowMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}
