"use client";

import { useMemo, useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useFormatMoney } from "@/components/tenant-provider";
import { getDayName } from "@/lib/analytics/mock-data";
import type { Coach, CoachMetrics } from "@/lib/analytics/types";
import {
  CalendarCheck,
  Users,
  UserX,
  DollarSign,
} from "lucide-react";

interface InstructorDetailProps {
  coach: Coach;
  metrics: CoachMetrics;
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 font-mono text-lg font-bold">{value}</p>
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

export function InstructorDetail({ coach, metrics }: InstructorDetailProps) {
  const formatCurrency = useFormatMoney();
  const hasManyDisciplines = coach.disciplines.length > 1;
  const [selectedDisc, setSelectedDisc] = useState<string>("all");
  const isMobile = useIsMobile();

  const displayMetrics = useMemo(() => {
    if (selectedDisc === "all" || !metrics.by_discipline[selectedDisc]) {
      return {
        occupancy: metrics.occupancy_rate,
        retention: metrics.retention_rate,
        students: metrics.unique_students,
      };
    }
    const d = metrics.by_discipline[selectedDisc];
    return {
      occupancy: d.occupancy_rate,
      retention: d.retention_rate,
      students: d.unique_students,
    };
  }, [selectedDisc, metrics]);

  const trendData = useMemo(
    () =>
      metrics.trend.map((val, i) => ({
        week: `S${i + 1}`,
        occupancy: val,
      })),
    [metrics.trend],
  );

  const sortedSlots = useMemo(
    () => [...metrics.by_slot].sort((a, b) => b.avg_occupancy - a.avg_occupancy),
    [metrics.by_slot],
  );

  const bestSlots = sortedSlots.slice(0, 3);
  const worstSlots = sortedSlots.slice(-3).reverse();

  const performanceMetrics = useMemo(
    () => [
      { label: "Ocupación media", value: metrics.occupancy_rate, color: "bg-indigo-500" },
      { label: "Retención de alumnos", value: metrics.retention_rate, color: "bg-emerald-500" },
      { label: "Puntualidad", value: metrics.punctuality, color: "bg-blue-500" },
      {
        label: "Alumnos que repiten",
        value: Math.round((metrics.repeat_students / Math.max(metrics.unique_students, 1)) * 100),
        color: "bg-violet-500",
      },
      {
        label: "Ausencias sin aviso",
        value: 100 - metrics.no_show_rate,
        color: "bg-amber-500",
      },
      ...(metrics.avg_rating
        ? [{ label: "Valoración media", value: Math.round(metrics.avg_rating * 20), color: "bg-pink-500" }]
        : []),
    ],
    [metrics],
  );

  return (
    <div className="space-y-5">
      {/* Discipline filter */}
      {hasManyDisciplines && (
        <div className="flex overflow-x-auto">
          <div className="inline-flex items-center gap-1 rounded-full bg-surface p-1">
            <button
              onClick={() => setSelectedDisc("all")}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                selectedDisc === "all"
                  ? "bg-card text-foreground shadow-[var(--shadow-warm-sm)]"
                  : "text-muted hover:text-foreground",
              )}
            >
              Todas
            </button>
            {coach.disciplines.map((cd) => (
              <button
                key={cd.discipline.id}
                onClick={() => setSelectedDisc(cd.discipline.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                  selectedDisc === cd.discipline.id
                    ? "bg-card text-foreground shadow-[var(--shadow-warm-sm)]"
                    : "text-muted hover:text-foreground",
                )}
              >
                {cd.discipline.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat icon={CalendarCheck} label="Clases" value={metrics.classes_held} />
        <MiniStat icon={Users} label="Alumnos únicos" value={displayMetrics.students} />
        <MiniStat icon={UserX} label="Ausencias sin aviso" value={`${metrics.no_show_rate}%`} />
        <MiniStat icon={DollarSign} label="Ingresos generados" value={formatCurrency(metrics.revenue)} />
      </div>

      {/* Occupancy trend chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted">
            Tendencia de ocupación
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40 sm:h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 4, right: 4, left: isMobile ? -10 : -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`fill-${coach.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={coach.color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={coach.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: isMobile ? 10 : 11, fill: "var(--color-muted)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: isMobile ? 10 : 11, fill: "var(--color-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={isMobile ? 30 : undefined}
                  label={isMobile ? undefined : {
                    value: "% de lugares ocupados",
                    angle: -90,
                    position: "insideLeft",
                    offset: 20,
                    style: { fontSize: 10, fill: "var(--color-muted)" },
                  }}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: "var(--color-foreground)",
                    border: "none",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 12,
                  }}
                  formatter={(value) => [`${value}%`, "Ocupación"]}
                />
                <Area
                  type="monotone"
                  dataKey="occupancy"
                  stroke={coach.color}
                  strokeWidth={2}
                  fill={`url(#fill-${coach.id})`}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Best and worst slots */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted">
              Sus mejores horarios
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {bestSlots.map((slot) => (
              <div
                key={`${slot.day}-${slot.time}`}
                className="flex items-center justify-between rounded-lg bg-green-50/50 px-3 py-2"
              >
                <span className="text-sm font-medium">
                  {getDayName(slot.day)} {slot.time}
                </span>
                <Badge variant="success">{slot.avg_occupancy}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted">
              Donde tiene más margen de mejora
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {worstSlots.map((slot) => (
              <div
                key={`${slot.day}-${slot.time}`}
                className="flex items-center justify-between rounded-lg bg-amber-50/50 px-3 py-2"
              >
                <span className="text-sm font-medium">
                  {getDayName(slot.day)} {slot.time}
                </span>
                <Badge variant="warning">{slot.avg_occupancy}%</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Performance radar as progress bars */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted">
            Radar de rendimiento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {performanceMetrics.map((metric) => (
            <div key={metric.label} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">{metric.label}</span>
                <span className="font-mono font-semibold">{metric.value}%</span>
              </div>
              <Progress value={metric.value} indicatorClassName={metric.color} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
