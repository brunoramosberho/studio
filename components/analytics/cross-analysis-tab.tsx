"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { getDayName } from "@/lib/analytics/mock-data";
import type {
  Coach,
  CoachMetrics,
  CrossCombination,
  Discipline,
  ScheduleSlot,
} from "@/lib/analytics/types";

interface CrossAnalysisTabProps {
  disciplineId?: string;
  disciplines: Discipline[];
  coaches: Coach[];
  coachMetrics: CoachMetrics[];
  combinations: CrossCombination[];
  slots: ScheduleSlot[];
  onOpenDisciplineFilter: () => void;
}

export function CrossAnalysisTab({
  disciplineId,
  coaches,
  coachMetrics,
  combinations,
  slots,
  onOpenDisciplineFilter,
}: CrossAnalysisTabProps) {
  if (!disciplineId) {
    return (
      <Card className="border-amber-200 bg-amber-50/50">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900">
                Selecciona una disciplina arriba para comparar instructores en
                igualdad de condiciones.
              </p>
              <p className="mt-1 text-sm text-amber-700">
                Comparar disciplinas distintas no tiene sentido.
              </p>
              <button
                onClick={onOpenDisciplineFilter}
                className="mt-3 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
              >
                Seleccionar disciplina
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <CrossCombinations combinations={combinations} />
      <ComparisonChart
        coaches={coaches}
        coachMetrics={coachMetrics}
        slots={slots}
        disciplineId={disciplineId}
      />
    </div>
  );
}

function CrossCombinations({
  combinations,
}: {
  combinations: CrossCombination[];
}) {
  if (combinations.length === 0) return null;

  return (
    <div>
      <h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted">
        Combinaciones destacadas
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {combinations.map((c, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: c.coach.color }}
                  >
                    {c.coach.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{c.coach.name}</p>
                    <p className="text-xs text-muted">
                      {getDayName(c.day)} {c.time}
                    </p>
                  </div>
                </div>
                <Badge variant="success" className="text-sm font-bold">
                  {c.occupancy}%
                </Badge>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted">
                {c.insight}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ComparisonChart({
  coaches,
  coachMetrics,
  slots,
  disciplineId,
}: {
  coaches: Coach[];
  coachMetrics: CoachMetrics[];
  slots: ScheduleSlot[];
  disciplineId: string;
}) {
  const relevantCoaches = useMemo(
    () =>
      coaches.filter((c) =>
        c.disciplines.some((d) => d.discipline.id === disciplineId),
      ),
    [coaches, disciplineId],
  );

  const chartData = useMemo(() => {
    const hours = [...new Set(slots.map((s) => s.time))].sort();

    return hours.map((hour) => {
      const entry: Record<string, string | number | null> = { hour };
      for (const coach of relevantCoaches) {
        const m = coachMetrics.find((cm) => cm.coach_id === coach.id);
        const slotMetric = m?.by_slot.find((s) => s.time === hour);
        entry[coach.name] = slotMetric?.avg_occupancy ?? null;
      }
      return entry;
    });
  }, [slots, relevantCoaches, coachMetrics]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted">
          Comparativa de instructores por horario
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
                label={{
                  value: "% ocupación media",
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
                formatter={(value, name) => {
                  if (value === null) return ["Sin clases", name];
                  return [`${value}% de ocupación`, name];
                }}
                labelFormatter={(label) => `Horario: ${label}`}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              />
              {relevantCoaches.map((coach) => (
                <Bar
                  key={coach.id}
                  dataKey={coach.name}
                  fill={coach.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
