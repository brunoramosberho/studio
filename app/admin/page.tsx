"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  DollarSign,
  PieChart,
  UserPlus,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/admin/kpi-card";
import { useBranding } from "@/components/branding-provider";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { cn, formatCurrency, timeAgo } from "@/lib/utils";
import type { AdminStats } from "@/types";

interface ReportsData extends AdminStats {
  revenueChart: { name: string; revenue: number }[];
  recentBookings: {
    id: string;
    userName: string;
    className: string;
    createdAt: string;
  }[];
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function AdminDashboard() {
  const { studioName } = useBranding();
  const { data, isLoading } = useQuery<ReportsData>({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const res = await fetch("/api/admin/reports");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Dashboard</h1>
        <p className="mt-1 text-muted">Resumen general de {studioName} Studio</p>
      </motion.div>

      {/* KPI Cards */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <motion.div key={i} variants={fadeUp}>
              <Skeleton className="h-32 rounded-2xl" />
            </motion.div>
          ))
        ) : (
          <>
            <motion.div variants={fadeUp}>
              <KpiCard
                icon={CalendarCheck}
                label="Reservas hoy"
                value={data?.bookingsToday ?? 0}
                change={12}
                accentColor="var(--color-admin)"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiCard
                icon={DollarSign}
                label="Ingresos esta semana"
                value={formatCurrency(data?.revenueThisWeek ?? 0)}
                change={8}
                accentColor="var(--color-accent)"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiCard
                icon={PieChart}
                label="Ocupación promedio"
                value={`${data?.avgOccupancy ?? 0}%`}
                change={-3}
                accentColor="#7C6D5D"
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiCard
                icon={UserPlus}
                label="Nuevos clientes"
                value={data?.newClientsThisWeek ?? 0}
                change={15}
                accentColor="var(--color-coach)"
              />
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Charts + Recent */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Revenue chart */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {isLoading ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : (
            <RevenueChart
              data={data?.revenueChart ?? []}
              title="Ingresos semanales"
            />
          )}
        </motion.div>

        {/* Sidebar cards */}
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          {/* Popular class */}
          <Card className="border-accent/20 bg-gradient-to-br from-accent/5 to-transparent">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                <span className="text-xs font-medium text-accent">Más popular</span>
              </div>
              {isLoading ? (
                <Skeleton className="mt-2 h-6 w-32" />
              ) : (
                <p className="mt-2 font-display text-lg font-bold">
                  {data?.popularClassType ?? "—"}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Recent bookings */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Reservas recientes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))
                : data?.recentBookings?.slice(0, 6).map((booking) => (
                    <div key={booking.id} className="flex items-center gap-3">
                      <div className="h-8 w-8 shrink-0 rounded-full bg-admin/10 flex items-center justify-center">
                        <span className="text-xs font-semibold text-admin">
                          {booking.userName?.[0] ?? "?"}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {booking.userName}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {booking.className}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-muted">
                        {timeAgo(booking.createdAt)}
                      </span>
                    </div>
                  ))}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
