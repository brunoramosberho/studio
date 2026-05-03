"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { BarChart3, Clock, UserCog, GitCompareArrows } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import type { Period } from "@/lib/analytics/types";

import { AnalyticsKpis } from "@/components/analytics/analytics-kpis";
import { ScheduleHeatmap } from "@/components/analytics/schedule-heatmap";
import { InstructorTab } from "@/components/analytics/instructor-tab";
import { CrossAnalysisTab } from "@/components/analytics/cross-analysis-tab";
import { SectionTabs } from "@/components/admin/section-tabs";
import { INSIGHTS_TABS } from "@/components/admin/section-tab-configs";

function usePeriodLabels() {
  const t = useTranslations("admin");
  return [
    { value: "week" as Period, label: t("periodWeek") },
    { value: "month" as Period, label: t("periodMonth") },
    { value: "quarter" as Period, label: t("periodQuarter") },
  ];
}

export default function AnalyticsPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const PERIODS = usePeriodLabels();
  const [disciplineId, setDisciplineId] = useState<string | undefined>(
    undefined,
  );
  const [period, setPeriod] = useState<Period>("month");
  const disciplineSelectRef = useRef<HTMLButtonElement>(null);

  const { data, isLoading } = useAnalytics({ disciplineId, period });

  const selectedDiscipline = data?.disciplines.find(
    (d) => d.id === disciplineId,
  );

  function handleDisciplineChange(value: string) {
    setDisciplineId(value === "all" ? undefined : value);
  }

  function openDisciplineFilter() {
    disciplineSelectRef.current?.click();
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto max-w-6xl space-y-8">
        <SectionTabs tabs={INSIGHTS_TABS} ariaLabel="Insights sections" />
        {/* Sticky header with filters */}
        <div className="sticky top-[calc(3.5rem+4px)] z-20 -mx-4 bg-background/80 px-4 py-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <h1 className="font-display text-2xl font-bold sm:text-3xl">
                {t("performance")}
              </h1>
              {selectedDiscipline && (
                <Badge
                  className="text-xs"
                  style={{
                    backgroundColor: `${selectedDiscipline.color}15`,
                    color: selectedDiscipline.color,
                  }}
                >
                  {selectedDiscipline.name}
                </Badge>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="flex items-center gap-2 sm:gap-3"
            >
              {/* Discipline selector */}
              <Select
                value={disciplineId ?? "all"}
                onValueChange={handleDisciplineChange}
              >
                <SelectTrigger ref={disciplineSelectRef} className="h-9 w-[calc(50%-0.25rem)] min-w-0 text-xs sm:w-48">
                  <SelectValue placeholder={t("allDisciplines")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allDisciplines")}</SelectItem>
                  {data?.disciplines.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: d.color }}
                        />
                        {d.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Period segmented control */}
              <div className="inline-flex items-center gap-0.5 rounded-full bg-surface p-1">
                {PERIODS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPeriod(p.value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                      period === p.value
                        ? "bg-card text-foreground shadow-[var(--shadow-warm-sm)]"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* KPIs */}
        {isLoading || !data ? (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <AnalyticsKpis data={data.kpis} />
          </motion.div>
        )}

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Tabs defaultValue="schedule">
            <TabsList>
              <TabsTrigger value="schedule" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("bySchedule")}</span>
              </TabsTrigger>
              <TabsTrigger value="instructors" className="gap-1.5">
                <UserCog className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("byInstructor")}</span>
              </TabsTrigger>
              <TabsTrigger value="cross" className="gap-1.5">
                <GitCompareArrows className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("crossAnalysis")}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="schedule">
              {isLoading || !data ? (
                <div className="space-y-4">
                  <Skeleton className="h-64 rounded-2xl" />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Skeleton className="h-48 rounded-2xl" />
                    <Skeleton className="h-48 rounded-2xl" />
                  </div>
                </div>
              ) : (
                <ScheduleHeatmap
                  grid={data.occupancy_grid}
                  slots={data.schedule_slots}
                />
              )}
            </TabsContent>

            <TabsContent value="instructors">
              {isLoading || !data ? (
                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className="w-full space-y-3 lg:w-[40%]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-28 rounded-2xl" />
                    ))}
                  </div>
                  <div className="flex-1">
                    <Skeleton className="h-96 rounded-2xl" />
                  </div>
                </div>
              ) : (
                <InstructorTab
                  coaches={data.coaches}
                  metrics={data.coach_metrics}
                />
              )}
            </TabsContent>

            <TabsContent value="cross">
              {isLoading || !data ? (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={i} className="h-32 rounded-2xl" />
                    ))}
                  </div>
                  <Skeleton className="h-72 rounded-2xl" />
                </div>
              ) : (
                <CrossAnalysisTab
                  disciplineId={disciplineId}
                  disciplines={data.disciplines}
                  coaches={data.coaches}
                  coachMetrics={data.coach_metrics}
                  combinations={data.cross_combinations}
                  slots={data.schedule_slots}
                  onOpenDisciplineFilter={openDisciplineFilter}
                />
              )}
            </TabsContent>
          </Tabs>
        </motion.div>
      </div>
    </TooltipProvider>
  );
}
