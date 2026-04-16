"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getDayName, HOURS } from "@/lib/analytics/mock-data";
import type { OccupancyCell, ScheduleSlot } from "@/lib/analytics/types";

interface ScheduleHeatmapProps {
  grid: OccupancyCell[];
  slots: ScheduleSlot[];
}

function getOccupancyStyle(pct: number) {
  if (pct >= 90) {
    return {
      bg: "bg-green-500/20 border border-green-500/40",
      text: "text-green-600 font-bold",
    };
  }
  if (pct >= 75) {
    return {
      bg: "bg-amber-500/10 border border-amber-500/40",
      text: "text-muted-foreground",
    };
  }
  return {
    bg: "bg-muted/30",
    text: "text-muted/50",
  };
}

export function ScheduleHeatmap({ grid, slots }: ScheduleHeatmapProps) {
  const activeHours = useMemo(() => {
    const hours = new Set(slots.map((s) => s.time));
    return HOURS.filter((h) => hours.has(h));
  }, [slots]);

  const activeDays = useMemo(() => {
    const days = new Set(slots.map((s) => s.day_of_week));
    return Array.from(days).sort();
  }, [slots]);

  const cellMap = useMemo(() => {
    const map = new Map<string, OccupancyCell>();
    for (const cell of grid) {
      map.set(`${cell.day}-${cell.hour}`, cell);
    }
    return map;
  }, [grid]);

  const rankedSlots = useMemo(() => {
    const sorted = [...grid].sort((a, b) => b.avg_occupancy - a.avg_occupancy);
    return {
      top: sorted.slice(0, 4),
      bottom: sorted.slice(-4).reverse(),
    };
  }, [grid]);

  return (
    <div className="space-y-6">
      {/* Heatmap table */}
      <Card>
        <CardContent className="relative overflow-x-auto p-3 sm:p-5">
          {/* Scroll fade hint on mobile */}
          <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-6 bg-gradient-to-l from-card to-transparent sm:hidden" />
          <table className="w-full border-collapse text-center text-[10px] sm:text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-[5] bg-card p-1 text-left text-muted font-medium sm:p-2" />
                {activeHours.map((h) => (
                  <th
                    key={h}
                    className="p-1 font-medium text-muted whitespace-nowrap sm:p-1.5"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeDays.map((day) => (
                <tr key={day}>
                  <td className="sticky left-0 z-[5] bg-card p-1 text-left font-medium text-foreground whitespace-nowrap sm:p-2">
                    <span className="hidden sm:inline">{getDayName(day)}</span>
                    <span className="sm:hidden">{getDayName(day).slice(0, 3)}</span>
                  </td>
                  {activeHours.map((hour) => {
                    const cell = cellMap.get(`${day}-${hour}`);
                    if (!cell) {
                      return (
                        <td key={hour} className="p-1 sm:p-1.5">
                          <div className="flex h-8 items-center justify-center rounded-lg text-muted/20 sm:h-10">
                            —
                          </div>
                        </td>
                      );
                    }
                    const style = getOccupancyStyle(cell.avg_occupancy);
                    return (
                      <td key={hour} className="p-1 sm:p-1.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={cn(
                                "flex h-8 min-w-[2.5rem] cursor-default items-center justify-center rounded-lg text-[10px] transition-colors sm:h-10 sm:min-w-[3rem] sm:text-xs",
                                style.bg,
                                style.text,
                              )}
                            >
                              {cell.avg_occupancy}%
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {getDayName(cell.day)} {cell.hour} · Promedio{" "}
                            {cell.avg_occupancy}% de ocupación ·{" "}
                            {cell.class_count} clases en el período
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Top & bottom slots */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted">
              Horarios más populares
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rankedSlots.top.map((cell) => (
              <div key={`${cell.day}-${cell.hour}`} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {getDayName(cell.day)} {cell.hour}
                  </span>
                  <Badge variant="success">{cell.avg_occupancy}%</Badge>
                </div>
                <Progress
                  value={cell.avg_occupancy}
                  indicatorClassName="bg-green-500"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted">
              Horarios con oportunidad
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rankedSlots.bottom.map((cell) => (
              <div key={`${cell.day}-${cell.hour}`} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {getDayName(cell.day)} {cell.hour}
                  </span>
                  <Badge variant="warning">Oportunidad</Badge>
                </div>
                <Progress
                  value={cell.avg_occupancy}
                  indicatorClassName="bg-amber-500"
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
