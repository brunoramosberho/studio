"use client";

import { useQuery } from "@tanstack/react-query";
import type { AnalyticsData, Period } from "./types";

interface UseAnalyticsParams {
  disciplineId?: string;
  period: Period;
}

export function useAnalytics({ disciplineId, period }: UseAnalyticsParams) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", disciplineId ?? "all", period],
    queryFn: async () => {
      const params = new URLSearchParams({ period });
      if (disciplineId) params.set("disciplineId", disciplineId);
      const res = await fetch(`/api/admin/analytics?${params}`);
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    staleTime: 60_000,
  });
}
