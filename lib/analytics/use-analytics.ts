"use client";

import { useQuery } from "@tanstack/react-query";
import { getMockAnalytics } from "./mock-data";
import type { AnalyticsData, Period } from "./types";

interface UseAnalyticsParams {
  disciplineId?: string;
  period: Period;
}

export function useAnalytics({ disciplineId, period }: UseAnalyticsParams) {
  return useQuery<AnalyticsData>({
    queryKey: ["analytics", disciplineId ?? "all", period],
    queryFn: async () => {
      // TODO: Replace with actual API call:
      // const params = new URLSearchParams({ period });
      // if (disciplineId) params.set("disciplineId", disciplineId);
      // const res = await fetch(`/api/analytics?${params}`);
      // if (!res.ok) throw new Error("Failed to fetch analytics");
      // return res.json();

      await new Promise((r) => setTimeout(r, 600));
      return getMockAnalytics(disciplineId, period);
    },
    staleTime: 60_000,
  });
}
