"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Users,
  TrendingUp,
  ChevronRight,
  ChevronDown,
  Clock,
  BarChart3,
  Banknote,
  Coins,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime } from "@/lib/utils";

interface PeriodStats {
  total: number;
  given: number;
  students: number;
}

interface HistoryEntry {
  id: string;
  startsAt: string;
  endsAt: string;
  className: string;
  classColor: string;
  capacity: number;
  students: number;
  isPast: boolean;
}

interface EarningsData {
  total: number;
  breakdown: { type: string; label: string; amount: number }[];
  currency: string;
  hasRates: boolean;
}

interface ClassEarning {
  id: string;
  startsAt: string;
  className: string;
  classColor: string;
  students: number;
  capacity: number;
  occupancy: number;
  earned: number;
}

interface CoachStatsData {
  week: PeriodStats;
  month: PeriodStats;
  year: PeriodStats;
  allTime: { given: number; students: number };
  earnings?: EarningsData;
  weekEarnings?: EarningsData;
  classEarnings?: ClassEarning[];
  history: HistoryEntry[];
}

interface MonthGroup {
  key: string;
  label: string;
  classes: HistoryEntry[];
  totalStudents: number;
  byType: { name: string; color: string; count: number; students: number }[];
}

type Period = "week" | "month" | "year";

const periodLabels: Record<Period, string> = {
  week: "Semana",
  month: "Mes",
  year: "Año",
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

function fmt(amount: number, currency: string = "MXN") {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

function groupByMonth(classes: HistoryEntry[]): MonthGroup[] {
  const map = new Map<string, HistoryEntry[]>();

  for (const cls of classes) {
    const d = new Date(cls.startsAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    const list = map.get(key) ?? [];
    list.push(cls);
    map.set(key, list);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, classes]) => {
      const [year, month] = key.split("-").map(Number);
      const label = new Date(year, month, 1).toLocaleDateString("es-MX", {
        month: "long",
        year: "numeric",
      });

      const totalStudents = classes.reduce((s, c) => s + c.students, 0);

      const typeMap = new Map<string, { color: string; count: number; students: number }>();
      for (const c of classes) {
        const existing = typeMap.get(c.className) ?? { color: c.classColor, count: 0, students: 0 };
        existing.count++;
        existing.students += c.students;
        typeMap.set(c.className, existing);
      }

      const byType = Array.from(typeMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.count - a.count);

      return { key, label, classes, totalStudents, byType };
    });
}

export default function CoachStatsPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [showAllClasses, setShowAllClasses] = useState(false);
  const [earningsView, setEarningsView] = useState<"week" | "month">("month");

  const { data, isLoading } = useQuery<CoachStatsData>({
    queryKey: ["coach-stats"],
    queryFn: async () => {
      const res = await fetch("/api/coach/stats");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const current = data?.[period];
  const pastClasses = useMemo(() => data?.history.filter((c) => c.isPast) ?? [], [data]);
  const monthGroups = useMemo(() => groupByMonth(pastClasses), [pastClasses]);
  const earnings = earningsView === "week" ? data?.weekEarnings : data?.earnings;
  const classEarnings = data?.classEarnings ?? [];

  const currentMonthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
  }, []);

  function formatClassDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <Link
        href="/coach"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Dashboard
      </Link>

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold">Mi Historial</h1>
        <p className="mt-1 text-sm text-muted">
          Resumen de clases, estadísticas y ganancias
        </p>
      </motion.div>

      {/* All-time highlight */}
      <motion.div variants={fadeUp} initial="hidden" animate="show">
        <Card className="border-coach/15 bg-gradient-to-br from-coach/5 to-transparent">
          <CardContent className="flex items-center justify-around p-5">
            <div className="text-center">
              {isLoading ? (
                <Skeleton className="mx-auto h-9 w-14" />
              ) : (
                <p className="font-mono text-3xl font-bold text-coach">
                  {data?.allTime.given ?? 0}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">Clases impartidas</p>
            </div>
            <div className="h-10 w-px bg-border/50" />
            <div className="text-center">
              {isLoading ? (
                <Skeleton className="mx-auto h-9 w-14" />
              ) : (
                <p className="font-mono text-3xl font-bold text-foreground">
                  {data?.allTime.students ?? 0}
                </p>
              )}
              <p className="mt-1 text-xs text-muted">Alumnas atendidas</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Earnings section ── */}
      {!isLoading && earnings?.hasRates && (
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold">
              <Banknote className="h-5 w-5 text-green-600" />
              Mis ganancias
            </h2>
            <div className="inline-flex items-center gap-0.5 rounded-lg bg-surface p-0.5">
              <button
                onClick={() => setEarningsView("week")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  earningsView === "week"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                Semana
              </button>
              <button
                onClick={() => setEarningsView("month")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  earningsView === "month"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                Mes
              </button>
            </div>
          </div>

          <Card className="border-green-100 bg-gradient-to-br from-green-50/40 to-transparent">
            <CardContent className="p-5">
              <motion.div
                key={earningsView}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <p className="font-display text-3xl font-bold text-green-700">
                  {fmt(earnings.total, earnings.currency)}
                </p>
                <p className="mt-0.5 text-xs text-green-600/70">
                  {earningsView === "week" ? "Esta semana" : "Este mes"}
                </p>
                {earnings.breakdown.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {earnings.breakdown.map((b, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm text-green-700/80">{b.label}</span>
                        <span className="font-mono text-sm font-semibold text-green-800">
                          {fmt(b.amount, earnings.currency)}
                        </span>
                      </div>
                    ))}
                    {earnings.breakdown.length > 1 && (
                      <div className="border-t border-green-200/50 pt-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-green-700">Total</span>
                        <span className="font-mono text-sm font-bold text-green-800">
                          {fmt(earnings.total, earnings.currency)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            </CardContent>
          </Card>

          {/* Per-class earnings */}
          {classEarnings.length > 0 && earningsView === "month" && (
            <Card>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-semibold">Ganancia por clase</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {classEarnings.length}
                    </Badge>
                  </div>
                  {classEarnings.length > 8 && (
                    <button
                      onClick={() => setShowAllClasses(!showAllClasses)}
                      className="text-xs font-medium text-coach hover:underline"
                    >
                      {showAllClasses ? "Ver menos" : `Ver todas (${classEarnings.length})`}
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {(showAllClasses ? classEarnings : classEarnings.slice(0, 8)).map((cls) => (
                    <Link
                      key={cls.id}
                      href={`/coach/class/${cls.id}`}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface/50"
                    >
                      <span
                        className="h-6 w-0.5 shrink-0 rounded-full"
                        style={{ backgroundColor: cls.classColor }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{cls.className}</p>
                        <p className="text-[11px] text-muted">
                          {formatClassDate(cls.startsAt)} · {formatTime(cls.startsAt)} · {cls.students}/{cls.capacity}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn(
                          "font-mono text-sm font-bold",
                          cls.earned > 0 ? "text-green-700" : "text-muted",
                        )}>
                          {cls.earned > 0 ? fmt(cls.earned, earnings.currency) : "—"}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </motion.div>
      )}

      {/* Period selector */}
      <div>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <BarChart3 className="h-5 w-5 text-coach" />
          Actividad
        </h2>

        <div className="flex gap-1 rounded-lg bg-surface p-1">
          {(["week", "month", "year"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "flex-1 rounded-md py-2 text-xs font-semibold transition-all",
                period === p
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        <motion.div
          key={period}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 grid grid-cols-3 gap-3"
        >
          <Card>
            <CardContent className="flex flex-col items-center gap-0.5 p-4 text-center">
              <CalendarDays className="h-4 w-4 text-muted/50" />
              {isLoading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <span className="font-mono text-2xl font-bold text-foreground">
                  {current?.total ?? 0}
                </span>
              )}
              <span className="text-[11px] text-muted">Programadas</span>
            </CardContent>
          </Card>
          <Card className="border-coach/15">
            <CardContent className="flex flex-col items-center gap-0.5 p-4 text-center">
              <TrendingUp className="h-4 w-4 text-coach/50" />
              {isLoading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <span className="font-mono text-2xl font-bold text-coach">
                  {current?.given ?? 0}
                </span>
              )}
              <span className="text-[11px] text-muted">Impartidas</span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center gap-0.5 p-4 text-center">
              <Users className="h-4 w-4 text-muted/50" />
              {isLoading ? (
                <Skeleton className="h-7 w-10" />
              ) : (
                <span className="font-mono text-2xl font-bold text-foreground">
                  {current?.students ?? 0}
                </span>
              )}
              <span className="text-[11px] text-muted">Alumnas</span>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Monthly breakdown */}
      <div>
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold">
          <Clock className="h-5 w-5 text-muted" />
          Resumen mensual
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : monthGroups.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Clock className="h-8 w-8 text-muted/30" />
              <p className="text-sm text-muted">Aún no hay clases pasadas</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-3"
          >
            {monthGroups.map((group) => {
              const isExpanded = expandedMonth === group.key;
              const isCurrent = group.key === currentMonthKey;

              return (
                <motion.div key={group.key} variants={fadeUp}>
                  <Card className={cn(isCurrent && "border-coach/20")}>
                    <CardContent className="p-0">
                      <button
                        onClick={() => setExpandedMonth(isExpanded ? null : group.key)}
                        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface/50"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold capitalize">
                              {group.label}
                            </p>
                            {isCurrent && (
                              <Badge variant="coach" className="text-[10px] px-1.5 py-0">
                                Actual
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-4 text-xs text-muted">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {group.classes.length} clase{group.classes.length !== 1 ? "s" : ""}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {group.totalStudents} alumna{group.totalStudents !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>

                        <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                          {group.byType.slice(0, 3).map((t) => (
                            <span
                              key={t.name}
                              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{
                                backgroundColor: `${t.color}15`,
                                color: t.color,
                              }}
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ backgroundColor: t.color }}
                              />
                              {t.count}× {t.name}
                            </span>
                          ))}
                        </div>

                        <ChevronDown
                          className={cn(
                            "h-4 w-4 shrink-0 text-muted transition-transform",
                            isExpanded && "rotate-180",
                          )}
                        />
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-border/50 px-4 py-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                Desglose por tipo
                              </p>
                              <div className="space-y-1.5">
                                {group.byType.map((t) => {
                                  const avgStudents = Math.round(t.students / t.count);
                                  return (
                                    <div key={t.name} className="flex items-center gap-2">
                                      <span
                                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: t.color }}
                                      />
                                      <span className="flex-1 text-sm font-medium">
                                        {t.name}
                                      </span>
                                      <span className="font-mono text-sm font-semibold">
                                        {t.count}
                                      </span>
                                      <span className="text-[11px] text-muted">
                                        · ~{avgStudents} alumnas/clase
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="border-t border-border/50 px-4 py-3">
                              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                                Detalle de clases
                              </p>
                              <div className="space-y-1">
                                {group.classes.map((cls) => (
                                  <Link
                                    key={cls.id}
                                    href={`/coach/class/${cls.id}`}
                                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface"
                                  >
                                    <span
                                      className="h-6 w-0.5 shrink-0 rounded-full"
                                      style={{ backgroundColor: cls.classColor, opacity: cls.isPast ? 0.5 : 1 }}
                                    />
                                    <span className="flex-1 text-xs font-medium">
                                      {cls.className}
                                    </span>
                                    <span className="text-[11px] text-muted">
                                      {formatClassDate(cls.startsAt)}
                                    </span>
                                    <span className="text-[11px] text-muted">
                                      {formatTime(cls.startsAt)}
                                    </span>
                                    <span className="font-mono text-[11px] text-muted">
                                      {cls.students}/{cls.capacity}
                                    </span>
                                    <ChevronRight className="h-3 w-3 text-muted/50" />
                                  </Link>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      <div className="pb-8" />
    </div>
  );
}
