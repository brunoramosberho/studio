"use client";

import { useQuery } from "@tanstack/react-query";
import { startOfWeek, endOfWeek, format } from "date-fns";
import type { ClassWithDetails, ScheduleFilters } from "@/types";

interface UseScheduleOptions {
  date: Date;
  filters?: ScheduleFilters;
  enabled?: boolean;
}

export function useSchedule({ date, filters = {}, enabled = true }: UseScheduleOptions) {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });

  const params = new URLSearchParams({
    from: format(weekStart, "yyyy-MM-dd"),
    to: format(weekEnd, "yyyy-MM-dd"),
  });

  if (filters.classTypeId) params.set("typeId", filters.classTypeId);
  if (filters.coachId) params.set("coachId", filters.coachId);
  if (filters.level) params.set("level", filters.level);

  return useQuery<ClassWithDetails[]>({
    queryKey: ["schedule", format(weekStart, "yyyy-MM-dd"), filters],
    queryFn: async () => {
      const res = await fetch(`/api/classes?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch schedule");
      return res.json();
    },
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
