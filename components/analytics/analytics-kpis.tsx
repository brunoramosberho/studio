"use client";

import {
  Users,
  CalendarCheck,
  Target,
  Repeat,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { KpiData } from "@/lib/analytics/types";

interface AnalyticsKpisProps {
  data: KpiData;
}

interface KpiItemConfig {
  key: keyof KpiData;
  deltaKey: keyof KpiData;
  label: string;
  tooltip: string;
  icon: typeof Users;
  format: (v: number) => string;
  color: string;
}

const kpiConfig: KpiItemConfig[] = [
  {
    key: "occupancy_rate",
    deltaKey: "occupancy_delta",
    label: "De cada 10 lugares, cuántos se llenan",
    tooltip: "Porcentaje promedio de lugares ocupados en todas las clases del período",
    icon: Target,
    format: (v) => {
      const out10 = (v / 10).toFixed(1);
      return `${out10} / 10`;
    },
    color: "var(--color-admin)",
  },
  {
    key: "active_students_count",
    deltaKey: "active_students_delta",
    label: "Alumnos que vinieron al menos una vez",
    tooltip: "Número de alumnos únicos que asistieron a al menos una clase en el período seleccionado",
    icon: Users,
    format: (v) => v.toLocaleString("es"),
    color: "var(--color-coach)",
  },
  {
    key: "classes_held",
    deltaKey: "classes_held_delta",
    label: "Clases impartidas",
    tooltip: "Total de clases que se llevaron a cabo en el período (no incluye canceladas)",
    icon: CalendarCheck,
    format: (v) => v.toLocaleString("es"),
    color: "var(--color-accent)",
  },
  {
    key: "retention_rate",
    deltaKey: "retention_delta",
    label: "Alumnos que volvieron la semana siguiente",
    tooltip:
      "Porcentaje de alumnos que reservaron al menos una clase adicional en los 7 días siguientes a su última clase",
    icon: Repeat,
    format: (v) => `${v}%`,
    color: "#F59E0B",
  },
];

export function AnalyticsKpis({ data }: AnalyticsKpisProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {kpiConfig.map((cfg) => {
        const value = data[cfg.key] as number;
        const delta = data[cfg.deltaKey] as number;
        const isPositive = delta >= 0;
        const Icon = cfg.icon;

        return (
          <Card key={cfg.key} className="overflow-hidden">
            <div
              className="h-0.5"
              style={{ backgroundColor: cfg.color, opacity: 0.3 }}
            />
            <CardContent className="p-3 sm:p-5">
              <div className="flex items-start justify-between">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${cfg.color} 10%, transparent)`,
                  }}
                >
                  <Icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: cfg.color }} />
                </div>
                <div className="flex items-center gap-1">
                  <div
                    className={cn(
                      "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold sm:px-2 sm:text-xs",
                      isPositive
                        ? "bg-green-50 text-green-600"
                        : "bg-red-50 text-red-600",
                    )}
                  >
                    {isPositive ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {isPositive ? "+" : ""}
                    {delta}%
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="hidden text-muted/40 transition-colors hover:text-muted sm:block">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{cfg.tooltip}</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              <div className="mt-2 sm:mt-3">
                <p className="font-mono text-xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {cfg.format(value)}
                </p>
                <p className="mt-0.5 text-[10px] leading-tight text-muted sm:text-xs">{cfg.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
