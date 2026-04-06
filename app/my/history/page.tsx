"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Calendar, Flame, TrendingUp, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTransition } from "@/components/shared/page-transition";
import { formatTime, cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import type { BookingWithDetails } from "@/types";
import { BiometricsCard } from "@/components/booking/biometrics-card";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

interface MonthGroup {
  key: string;
  label: string;
  entries: BookingWithDetails[];
}

function groupByMonth(bookings: BookingWithDetails[]): MonthGroup[] {
  const groups = new Map<string, BookingWithDetails[]>();

  for (const b of bookings) {
    const d = new Date(b.class.startsAt);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, entries]) => {
      const [year, month] = key.split("-").map(Number);
      const label = format(new Date(year, month, 1), "MMMM yyyy", { locale: es });
      return { key, label, entries };
    });
}

function computeStreak(bookings: BookingWithDetails[]): number {
  const attended = bookings
    .filter((b) => b.status === "ATTENDED")
    .map((b) => {
      const d = new Date(b.class.startsAt);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    });

  const uniqueDays = [...new Set(attended)].sort().reverse();
  if (uniqueDays.length === 0) return 0;

  let streak = 1;
  for (let i = 1; i < uniqueDays.length; i++) {
    const curr = new Date(uniqueDays[i - 1]);
    const prev = new Date(uniqueDays[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export default function HistoryPage() {
  const [bookings, setBookings] = useState<BookingWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        const res = await fetch("/api/bookings?status=history");
        if (res.ok) setBookings(await res.json());
      } catch {
        /* silently fail */
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const stats = useMemo(() => {
    const attended = bookings.filter((b) => b.status === "ATTENDED");
    const now = new Date();
    const thisMonthCount = attended.filter((b) => {
      const d = new Date(b.class.startsAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    return {
      total: attended.length,
      streak: computeStreak(bookings),
      thisMonth: thisMonthCount,
    };
  }, [bookings]);

  const groups = useMemo(() => groupByMonth(bookings), [bookings]);

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Historial
        </h1>

        {/* Stats */}
        {loading ? (
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="flex flex-col items-center p-4 text-center">
                <TrendingUp className="h-5 w-5 text-accent" />
                <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                  {stats.total}
                </p>
                <p className="text-[10px] text-muted">Total clases</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center p-4 text-center">
                <Flame className="h-5 w-5 text-orange-500" />
                <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                  {stats.streak}
                </p>
                <p className="text-[10px] text-muted">Racha semanal</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center p-4 text-center">
                <Calendar className="h-5 w-5 text-accent" />
                <p className="mt-2 font-mono text-2xl font-bold text-foreground">
                  {stats.thisMonth}
                </p>
                <p className="text-[10px] text-muted">Este mes</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* History grouped by month */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <Calendar className="h-10 w-10 text-muted/30" />
              <p className="mt-3 font-display text-lg font-bold text-foreground">
                Sin historial
              </p>
              <p className="mt-1 text-sm text-muted">
                Tu historial de clases aparecerá aquí
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group.key}>
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted capitalize">
                  {group.label}
                </p>
                <motion.div
                  className="space-y-2"
                  variants={stagger}
                  initial="hidden"
                  animate="show"
                >
                  {group.entries.map((booking) => {
                    const isAttended = booking.status === "ATTENDED";
                    const d = new Date(booking.class.startsAt);

                    return (
                      <motion.div key={booking.id} variants={fadeUp}>
                        <Card>
                          <CardContent className="flex items-center gap-4 p-4">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface">
                              <span className="font-mono text-xs font-bold text-foreground">
                                {format(d, "dd")}
                              </span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-display text-sm font-bold text-foreground">
                                {booking.class.classType.name}
                              </p>
                              <p className="mt-0.5 text-xs text-muted">
                                {booking.class.coach.user.name} · {formatTime(booking.class.startsAt)}
                              </p>
                            </div>
                            <Badge variant={isAttended ? "success" : "danger"}>
                              <span className="flex items-center gap-1">
                                {isAttended ? (
                                  <CheckCircle2 className="h-3 w-3" />
                                ) : (
                                  <XCircle className="h-3 w-3" />
                                )}
                                {isAttended ? "Asistió" : "No asistió"}
                              </span>
                            </Badge>
                          </CardContent>
                        </Card>
                        {isAttended && <BiometricsCard bookingId={booking.id} />}
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
}
