"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
} from "lucide-react";
import { Card as TremorCard, BarChart, DonutChart } from "@tremor/react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { formatCurrency } from "@/lib/utils";

interface ReportsData {
  revenueChart: { name: string; revenue: number }[];
  attendanceChart: { name: string; rate: number }[];
  popularClasses: { name: string; count: number; color: string }[];
  retention: { month: string; rate: number; total: number; active: number }[];
}

export default function AdminReportsPage() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const queryParams = new URLSearchParams();
  if (dateFrom) queryParams.set("from", dateFrom);
  if (dateTo) queryParams.set("to", dateTo);

  const { data, isLoading } = useQuery<ReportsData>({
    queryKey: ["admin-reports-detail", dateFrom, dateTo],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reports/detailed?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Reportes</h1>
          <p className="mt-1 text-muted">Métricas y análisis del estudio</p>
        </motion.div>

        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted" />
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
          />
          <span className="text-muted">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
          />
        </div>
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Ingresos</TabsTrigger>
          <TabsTrigger value="attendance">Asistencia</TabsTrigger>
          <TabsTrigger value="popular">Popularidad</TabsTrigger>
          <TabsTrigger value="retention">Retención</TabsTrigger>
        </TabsList>

        {/* Revenue Tab */}
        <TabsContent value="revenue" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <RevenueChart data={data?.revenueChart ?? []} title="Ingresos por período" />
          )}
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <TremorCard className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                    Tasa de asistencia
                  </p>
                  <p className="mt-1 text-sm text-muted">Porcentaje de asistencia por período</p>
                </div>
                <BarChart3 className="h-4 w-4 text-muted" />
              </div>
              <BarChart
                className="mt-4 h-80"
                data={data?.attendanceChart ?? []}
                index="name"
                categories={["rate"]}
                colors={["blue"]}
                valueFormatter={(v) => `${Number(v)}%`}
                showLegend={false}
                yAxisWidth={44}
              />
            </TremorCard>
          )}
        </TabsContent>

        {/* Popular Classes Tab */}
        <TabsContent value="popular" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <TremorCard className="p-4">
              <div>
                <p className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                  Clases más populares
                </p>
                <p className="mt-1 text-sm text-muted">Distribución de reservas por tipo de clase</p>
              </div>
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <DonutChart
                  className="h-64"
                  data={data?.popularClasses ?? []}
                  category="count"
                  index="name"
                  valueFormatter={(v) => `${Number(v)}`}
                />
                <div className="space-y-3">
                  {(data?.popularClasses ?? [])
                    .slice()
                    .sort((a, b) => b.count - a.count)
                    .map((cls) => (
                      <div key={cls.name} className="flex items-center gap-3">
                        <span className="flex-1 text-sm">{cls.name}</span>
                        <span className="font-mono text-sm font-semibold">{cls.count}</span>
                      </div>
                    ))}
                </div>
              </div>
            </TremorCard>
          )}
        </TabsContent>

        {/* Retention Tab */}
        <TabsContent value="retention" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <TremorCard className="p-4">
              <div>
                <p className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                  Retención por cohorte
                </p>
                <p className="mt-1 text-sm text-muted">
                  % de miembros activos (30 días), por antigüedad
                </p>
              </div>
              <BarChart
                className="mt-4 h-80"
                data={data?.retention ?? []}
                index="month"
                categories={["rate"]}
                colors={["emerald"]}
                valueFormatter={(v) => `${Number(v)}%`}
                showLegend={false}
                yAxisWidth={44}
              />
              {data?.retention && data.retention.some((r) => r.rate < 60) && (
                <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Algún cohorte está por debajo del 60% de retención. El benchmark saludable es &gt;60% a 90 días.
                </div>
              )}
            </TremorCard>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
