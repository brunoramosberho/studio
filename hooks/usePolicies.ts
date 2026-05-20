"use client";

import { useQuery } from "@tanstack/react-query";

export type ScheduleVisibilityMode = "ROLLING_DAYS" | "WEEKLY_RELEASE";

export interface TenantPolicies {
  cancellationWindowHours: number;
  noShowPenaltyEnabled: boolean;
  noShowLoseCredit: boolean;
  noShowChargeFee: boolean;
  noShowPenaltyAmount: number | null;
  noShowFeeAmountUnlimited: number | null;
  noShowPenaltyGraceHours: number;
  scheduleVisibilityMode: ScheduleVisibilityMode;
  visibleScheduleDays: number;
  scheduleReleaseDayOfWeek: number | null;
  scheduleReleaseHour: number | null;
  scheduleReleaseWeeksAhead: number | null;
  scheduleReleaseTimezone: string | null;
  scheduleEffectiveTimezone: string;
  visibleUntilIso: string | null;
}

const DEFAULTS: TenantPolicies = {
  cancellationWindowHours: 12,
  noShowPenaltyEnabled: false,
  noShowLoseCredit: true,
  noShowChargeFee: false,
  noShowPenaltyAmount: null,
  noShowFeeAmountUnlimited: null,
  noShowPenaltyGraceHours: 24,
  scheduleVisibilityMode: "ROLLING_DAYS",
  visibleScheduleDays: 7,
  scheduleReleaseDayOfWeek: null,
  scheduleReleaseHour: null,
  scheduleReleaseWeeksAhead: null,
  scheduleReleaseTimezone: null,
  scheduleEffectiveTimezone: "Europe/Madrid",
  visibleUntilIso: null,
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
