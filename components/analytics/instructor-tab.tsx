"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { Coach, CoachMetrics } from "@/lib/analytics/types";
import { InstructorDetail } from "./instructor-detail";

interface InstructorTabProps {
  coaches: Coach[];
  metrics: CoachMetrics[];
}

type SortKey = "occupancy" | "retention" | "students" | "revenue";

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function sortMetrics(metrics: CoachMetrics[], key: SortKey): CoachMetrics[] {
  const sorted = [...metrics];
  switch (key) {
    case "occupancy":
      return sorted.sort((a, b) => b.occupancy_rate - a.occupancy_rate);
    case "retention":
      return sorted.sort((a, b) => b.retention_rate - a.retention_rate);
    case "students":
      return sorted.sort((a, b) => b.unique_students - a.unique_students);
    case "revenue":
      return sorted.sort((a, b) => b.revenue - a.revenue);
  }
}

export function InstructorTab({ coaches, metrics }: InstructorTabProps) {
  const [selectedCoachId, setSelectedCoachId] = useState<string>(
    coaches[0]?.id ?? "",
  );
  const [sortKey, setSortKey] = useState<SortKey>("occupancy");

  const sortedMetrics = useMemo(
    () => sortMetrics(metrics, sortKey),
    [metrics, sortKey],
  );

  const selectedCoach = coaches.find((c) => c.id === selectedCoachId);
  const selectedMetrics = metrics.find((m) => m.coach_id === selectedCoachId);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Left column — coach list */}
      <div className="w-full shrink-0 space-y-3 lg:w-[40%]">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium uppercase tracking-wide text-muted">
            Instructores
          </span>
          <Select
            value={sortKey}
            onValueChange={(v) => setSortKey(v as SortKey)}
          >
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="occupancy">Ocupación</SelectItem>
              <SelectItem value="retention">Retención</SelectItem>
              <SelectItem value="students">Alumnos</SelectItem>
              <SelectItem value="revenue">Ingresos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sortedMetrics.map((m) => {
          const coach = coaches.find((c) => c.id === m.coach_id);
          if (!coach) return null;
          const isSelected = coach.id === selectedCoachId;
          const trendDelta =
            m.trend.length >= 2
              ? m.trend[m.trend.length - 1] - m.trend[m.trend.length - 2]
              : 0;

          return (
            <button
              key={coach.id}
              onClick={() => setSelectedCoachId(coach.id)}
              className={cn(
                "w-full rounded-2xl bg-white p-4 text-left shadow-[var(--shadow-warm)] transition-all",
                isSelected
                  ? "ring-2 ring-admin"
                  : "hover:shadow-[var(--shadow-warm-md)]",
              )}
            >
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: coach.color }}
                >
                  {getInitials(coach.name)}
                </div>

                {/* Name & disciplines */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{coach.name}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {coach.disciplines.slice(0, 1).map((cd) => (
                      <Badge
                        key={cd.discipline.id}
                        className="text-[10px]"
                        style={{
                          backgroundColor: `${cd.discipline.color}15`,
                          color: cd.discipline.color,
                        }}
                      >
                        {cd.discipline.name}
                      </Badge>
                    ))}
                    {coach.disciplines.length > 1 && (
                      <Badge variant="outline" className="text-[10px]">
                        +{coach.disciplines.length - 1} más
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Trend delta */}
                <div
                  className={cn(
                    "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    trendDelta >= 0
                      ? "bg-green-50 text-green-600"
                      : "bg-red-50 text-red-600",
                  )}
                >
                  {trendDelta >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trendDelta >= 0 ? "+" : ""}
                  {trendDelta}
                </div>
              </div>

              {/* Inline metrics */}
              <div className="mt-3 flex gap-4 text-xs text-muted">
                <div>
                  <span className="font-mono font-semibold text-foreground">
                    {m.occupancy_rate}%
                  </span>{" "}
                  ocup.
                </div>
                <div>
                  <span className="font-mono font-semibold text-foreground">
                    {m.retention_rate}%
                  </span>{" "}
                  retenc.
                </div>
                <div>
                  <span className="font-mono font-semibold text-foreground">
                    {m.unique_students}
                  </span>{" "}
                  alumnos
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Right column — detail panel */}
      <div className="flex-1">
        {selectedCoach && selectedMetrics ? (
          <InstructorDetail coach={selectedCoach} metrics={selectedMetrics} />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-muted">
            Selecciona un instructor para ver su detalle
          </div>
        )}
      </div>
    </div>
  );
}
