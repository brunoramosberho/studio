"use client";

import { useQuery } from "@tanstack/react-query";

interface TenantPolicies {
  cancellationWindowHours: number;
  noShowPenaltyEnabled: boolean;
  noShowPenaltyType: "CREDIT_LOSS" | "FEE";
  noShowPenaltyAmount: number | null;
}

const DEFAULTS: TenantPolicies = {
  cancellationWindowHours: 12,
  noShowPenaltyEnabled: false,
  noShowPenaltyType: "CREDIT_LOSS",
  noShowPenaltyAmount: null,
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
