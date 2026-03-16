import { create } from "zustand";
import type { ScheduleFilters } from "@/types";

type ViewMode = "week" | "day" | "list";

interface ScheduleState {
  viewMode: ViewMode;
  currentDate: Date;
  filters: ScheduleFilters;
  setViewMode: (mode: ViewMode) => void;
  setCurrentDate: (date: Date) => void;
  setFilters: (filters: Partial<ScheduleFilters>) => void;
  clearFilters: () => void;
}

export const useScheduleStore = create<ScheduleState>((set) => ({
  viewMode: "week",
  currentDate: new Date(),
  filters: {},
  setViewMode: (mode) => set({ viewMode: mode }),
  setCurrentDate: (date) => set({ currentDate: date }),
  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),
  clearFilters: () => set({ filters: {} }),
}));
