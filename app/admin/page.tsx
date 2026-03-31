"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  CalendarCheck,
  DollarSign,
  PieChart,
  UserPlus,
  TrendingUp,
  AlertTriangle,
  Clock,
  Package,
  Cake,
  Users,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { Card as TremorCard, Metric, Text, Flex } from "@tremor/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/admin/kpi-card";
import { useBranding } from "@/components/branding-provider";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { cn, formatCurrency, timeAgo, formatDate } from "@/lib/utils";

interface DashboardData {
  bookingsToday: number;
  bookingsThisWeek: number;
  revenueThisWeek: number;
  avgOccupancy: number;
  newClientsThisWeek: number;
  popularClassType: string;
  bookingsTodayChange: number;
  revenueWeekChange: number;
  occupancyChange: number;
  newClientsChange: number;
  revenueChart: { name: string; revenue: number }[];
  recentBookings: {
    id: string;
    userName: string;
    className: string;
    createdAt: string;
  }[];
  classesToday: number;
  attendanceToday: number;
  revenueToday: number;
  revenueThisMonth: number;
  revenueMonthChange: number;
  completedClassesMonth: number;
  activeMembersCount: number;
  lowOccupancyClasses: {
    id: string;
    name: string;
    startsAt: string;
    occupancyPct: number;
    enrolled: number;
    capacity: number;
    coachName: string | null;
  }[];
  expiringPackages: {
    userId: string;
    userName: string | null;
    userImage: string | null;
    packageName: string;
    expiresAt: string;
  }[];
  birthdaysThisWeek: {
    id: string;
    name: string | null;
    image: string | null;
    birthday: string;
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
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const res = await fetch("/api/admin/reports");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const totalAlerts =
    (data?.lowOccupancyClasses?.length ?? 0) +
    (data?.expiringPackages?.length ?? 0);

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
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
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
                icon={DollarSign}
                label="MRR"
                value={formatCurrency(data?.revenueThisMonth ?? 0)}
                change={data?.revenueMonthChange}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiCard
                icon={Users}
                label="Miembros"
                value={data?.activeMembersCount ?? 0}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiCard
                icon={PieChart}
                label="Ocupación"
                value={`${data?.avgOccupancy ?? 0}%`}
                change={data?.occupancyChange}
              />
            </motion.div>
            <motion.div variants={fadeUp}>
              <KpiCard
                icon={UserPlus}
                label="Nuevos esta semana"
                value={data?.newClientsThisWeek ?? 0}
                change={data?.newClientsChange}
              />
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Secondary metrics */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <motion.div key={i} variants={fadeUp}>
              <Skeleton className="h-24 rounded-2xl" />
            </motion.div>
          ))
        ) : (
          <>
            <motion.div variants={fadeUp}>
              <TremorCard className="p-4">
                <Flex justifyContent="between" alignItems="start">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
                      <CalendarCheck className="h-4.5 w-4.5 text-muted" />
                    </div>
                    <Text className="text-sm">Reservas hoy</Text>
                  </div>
                </Flex>
                <Metric className="mt-3">{data?.bookingsToday ?? 0}</Metric>
              </TremorCard>
            </motion.div>
            <motion.div variants={fadeUp}>
              <TremorCard className="p-4">
                <Flex justifyContent="between" alignItems="start">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
                      <CheckCircle className="h-4.5 w-4.5 text-muted" />
                    </div>
                    <Text className="text-sm">Clases impartidas (mes)</Text>
                  </div>
                </Flex>
                <Metric className="mt-3">{data?.completedClassesMonth ?? 0}</Metric>
              </TremorCard>
            </motion.div>
            <motion.div variants={fadeUp}>
              <TremorCard className="p-4">
                <Flex justifyContent="between" alignItems="start">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
                      <DollarSign className="h-4.5 w-4.5 text-muted" />
                    </div>
                    <Text className="text-sm">Ingresos esta semana</Text>
                  </div>
                </Flex>
                <Metric className="mt-3">{formatCurrency(data?.revenueThisWeek ?? 0)}</Metric>
              </TremorCard>
            </motion.div>
            <motion.div variants={fadeUp}>
              <TremorCard className="p-4">
                <Flex justifyContent="between" alignItems="start">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/40">
                      <Calendar className="h-4.5 w-4.5 text-muted" />
                    </div>
                    <Text className="text-sm">Hoy</Text>
                  </div>
                </Flex>
                <Metric className="mt-3">
                  {data?.classesToday ?? 0}{" "}
                  <span className="text-base font-normal text-muted">clases</span>
                </Metric>
                <Text className="mt-1 text-sm">{data?.attendanceToday ?? 0} check-ins</Text>
              </TremorCard>
            </motion.div>
          </>
        )}
      </motion.div>

      {/* Charts + Recent */}
      <div className="grid gap-6 lg:grid-cols-3">
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
                : data?.recentBookings?.length
                  ? data.recentBookings.slice(0, 6).map((booking) => (
                      <div key={booking.id} className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-admin/10">
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
                    ))
                  : (
                      <p className="text-sm text-muted/60">Sin reservas recientes</p>
                    )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Alerts */}
      {!isLoading && totalAlerts > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h2 className="font-display text-lg font-bold">
              Alertas
            </h2>
            <Badge variant="danger" className="ml-1 text-xs">
              {totalAlerts}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Low occupancy */}
            {data?.lowOccupancyClasses && data.lowOccupancyClasses.length > 0 && (
              <Card className="border-orange-200 bg-orange-50/50">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-orange-600" />
                    <span className="text-sm font-semibold text-orange-900">
                      Baja ocupación
                    </span>
                    <Badge className="ml-auto bg-orange-100 text-orange-700">
                      {data.lowOccupancyClasses.length}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-orange-700">
                    Clases en las próximas 24h con menos del 30% de ocupación
                  </p>
                  <div className="mt-3 space-y-2">
                    {data.lowOccupancyClasses.slice(0, 3).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-orange-900">
                            {c.name}
                          </p>
                          <p className="text-xs text-orange-600">
                            {c.enrolled}/{c.capacity} lugares
                          </p>
                        </div>
                        <span className="font-mono text-sm font-bold text-orange-700">
                          {c.occupancyPct}%
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="mt-3 w-full text-orange-700 hover:bg-orange-100"
                  >
                    <Link href="/admin/classes">Ver clases</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Expiring packages */}
            {data?.expiringPackages && data.expiringPackages.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-900">
                      Paquetes por vencer
                    </span>
                    <Badge className="ml-auto bg-amber-100 text-amber-700">
                      {data.expiringPackages.length}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-amber-700">
                    Vencen en los próximos 7 días
                  </p>
                  <div className="mt-3 space-y-2">
                    {data.expiringPackages.slice(0, 3).map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg bg-white/60 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium text-amber-900">
                            {p.userName ?? "Sin nombre"}
                          </p>
                          <p className="text-xs text-amber-600">
                            {p.packageName}
                          </p>
                        </div>
                        <span className="text-xs text-amber-700">
                          {formatDate(p.expiresAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="mt-3 w-full text-amber-700 hover:bg-amber-100"
                  >
                    <Link href="/admin/clients">Ver clientes</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

          </div>
        </motion.div>
      )}

      {/* Birthdays */}
      {!isLoading &&
        data?.birthdaysThisWeek &&
        data.birthdaysThisWeek.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Cake className="h-5 w-5 text-pink-500" />
                  <CardTitle className="text-base">
                    Cumpleaños de la semana
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {data.birthdaysThisWeek.map((u) => (
                    <div key={u.id} className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pink-100">
                        {u.image ? (
                          <img
                            src={u.image}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-semibold text-pink-600">
                            {(u.name ?? "?")[0]}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {u.name ?? "Sin nombre"}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(u.birthday).toLocaleDateString("es", {
                            day: "numeric",
                            month: "long",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
    </div>
  );
}
