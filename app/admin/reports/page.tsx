"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  CalendarDays,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { formatCurrency } from "@/lib/utils";

interface ReportsData {
  revenueChart: { name: string; revenue: number }[];
  attendanceChart: { name: string; rate: number }[];
  popularClasses: { name: string; count: number; color: string }[];
  retention: { month: string; rate: number }[];
}

const PIE_COLORS = ["#C9A96E", "#1A2C4E", "#2D5016", "#7C3AED", "#DC2626", "#0891B2"];

function ChartTooltip({ active, payload, label }: Record<string, unknown>) {
  if (!active || !(payload as unknown[])?.length) return null;
  const entry = (payload as { value: number; name: string }[])[0];
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 shadow-warm">
      <p className="text-xs text-muted">{(label as string) || entry.name}</p>
      <p className="font-mono text-sm font-bold text-foreground">{entry.value}%</p>
    </div>
  );
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
      const res = await fetch(`/api/admin/reports?${queryParams.toString()}`);
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
            <Card>
              <CardHeader>
                <CardTitle>Tasa de asistencia</CardTitle>
                <CardDescription>Porcentaje de asistencia por período</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data?.attendanceChart ?? []}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(26, 44, 78, 0.05)" }} />
                      <Bar
                        dataKey="rate"
                        fill="#1A2C4E"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Popular Classes Tab */}
        <TabsContent value="popular" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Clases más populares</CardTitle>
                <CardDescription>Distribución de reservas por tipo de clase</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="flex items-center justify-center">
                    <div className="h-64 w-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data?.popularClasses ?? []}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={3}
                          >
                            {data?.popularClasses?.map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="flex flex-col justify-center space-y-3">
                    {data?.popularClasses?.map((cls, i) => (
                      <div key={cls.name} className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                        <span className="flex-1 text-sm">{cls.name}</span>
                        <span className="font-mono text-sm font-semibold">
                          {cls.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Retention Tab */}
        <TabsContent value="retention" className="mt-4">
          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Retención de clientes</CardTitle>
                <CardDescription>Porcentaje de clientes que regresan cada mes</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data?.retention ?? []}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: "var(--color-muted)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, 100]}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(45, 80, 22, 0.05)" }} />
                      <Bar
                        dataKey="rate"
                        fill="#2D5016"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
