"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  isToday,
  subWeeks,
  addWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { motion } from "framer-motion";
import { cn, formatTime } from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

export function ScheduleClient() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCoach, setFilterCoach] = useState<string>("all");

  useEffect(() => {
    async function fetchClasses() {
      setLoading(true);
      try {
        const res = await fetch("/api/classes");
        if (res.ok) {
          const data = await res.json();
          setClasses(data);
        }
      } catch {
        // API may not be connected
      } finally {
        setLoading(false);
      }
    }
    fetchClasses();
  }, []);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const classTypes = Array.from(
    new Map(classes.map((c) => [c.classType.id, c.classType])).values()
  );
  const coaches = Array.from(
    new Map(classes.map((c) => [c.coach.id, c.coach])).values()
  );

  function getClassesForDay(day: Date) {
    return classes
      .filter((c) => isSameDay(new Date(c.startsAt), day))
      .filter((c) => filterType === "all" || c.classType.id === filterType)
      .filter((c) => filterCoach === "all" || c.coach.id === filterCoach);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header: studio info + filters (desktop sidebar style) */}
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* Sidebar — desktop only */}
        <aside className="hidden shrink-0 lg:block lg:w-56">
          <div className="sticky top-24 space-y-6">
            <div>
              <h1 className="font-display text-3xl font-bold text-foreground">
                Flō Studio
              </h1>
              <p className="mt-1 text-sm text-muted">Pilates & Wellness</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                  Por disciplina
                </label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground focus:border-foreground focus:outline-none"
                >
                  <option value="all">Todas</option>
                  {classTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                  Por instructor
                </label>
                <select
                  value={filterCoach}
                  onChange={(e) => setFilterCoach(e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm text-foreground focus:border-foreground focus:outline-none"
                >
                  <option value="all">Todos</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Week navigation */}
          <div className="mb-6 flex items-center justify-between">
            <button
              onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
              className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-sm font-medium text-muted">
              {format(weekStart, "MMMM yyyy", { locale: es })}
            </h2>
            <button
              onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
              className="rounded-full p-2 text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Week grid — desktop: 7 columns */}
          <div className="hidden lg:grid lg:grid-cols-7 lg:gap-px lg:rounded-2xl lg:bg-border/50 lg:overflow-hidden">
            {weekDays.map((day) => {
              const dayClasses = getClassesForDay(day);
              const today = isToday(day);
              return (
                <div key={day.toISOString()} className="bg-white">
                  {/* Day header */}
                  <div
                    className={cn(
                      "border-b border-border/50 px-2 py-3 text-center",
                      today && "bg-foreground"
                    )}
                  >
                    <p
                      className={cn(
                        "text-[10px] font-medium uppercase tracking-wider",
                        today ? "text-white/70" : "text-muted"
                      )}
                    >
                      {today && "● "}
                      {format(day, "EEE", { locale: es })}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        today ? "text-white" : "text-foreground"
                      )}
                    >
                      {format(day, "d", { locale: es })}
                    </p>
                  </div>

                  {/* Classes */}
                  <div className="min-h-[200px] space-y-px">
                    {dayClasses.map((cls, i) => (
                      <motion.div
                        key={cls.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03, duration: 0.2 }}
                      >
                        <Link href={`/class/${cls.id}`}>
                          <div className="group cursor-pointer border-b border-border/30 px-3 py-3 transition-colors hover:bg-surface/60">
                            <p className="text-xs text-muted">
                              <span className="font-medium text-foreground">
                                {formatTime(cls.startsAt)}
                              </span>
                              {" – "}
                              {cls.classType.duration} min
                            </p>
                            <p className="mt-1 text-[13px] font-semibold leading-tight text-foreground">
                              {cls.classType.name.split(" ")[0]} con{" "}
                              {cls.coach.user.name?.split(" ")[0]}
                            </p>
                            <div className="mt-1.5">
                              <Users className="h-3.5 w-3.5 text-muted/40" />
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    ))}
                    {dayClasses.length === 0 && (
                      <div className="flex h-[200px] items-center justify-center">
                        <p className="text-xs text-muted/30">—</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile: 2-column grid with scroll */}
          <div className="lg:hidden">
            <div className="grid grid-cols-2 gap-3">
              {weekDays.slice(0, 6).map((day) => {
                const dayClasses = getClassesForDay(day);
                const today = isToday(day);
                return (
                  <div key={day.toISOString()}>
                    {/* Day header */}
                    <div className="mb-2 text-center">
                      <p
                        className={cn(
                          "text-xs font-semibold uppercase tracking-wider",
                          today ? "text-foreground" : "text-muted"
                        )}
                      >
                        {today && "● "}
                        {format(day, "EEE d", { locale: es })}
                      </p>
                    </div>

                    {/* Class cards */}
                    <div className="space-y-2">
                      {dayClasses.map((cls, i) => (
                        <motion.div
                          key={cls.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            delay: i * 0.04,
                            duration: 0.25,
                            ease: "easeOut" as const,
                          }}
                        >
                          <Link href={`/class/${cls.id}`}>
                            <div className="rounded-xl border border-border/60 bg-white px-3 py-3 transition-colors active:bg-surface">
                              <p className="text-xs text-muted">
                                <span className="font-medium text-foreground">
                                  {formatTime(cls.startsAt)}
                                </span>
                                {" – "}
                                {cls.classType.duration} min
                              </p>
                              <p className="mt-1 text-sm font-semibold leading-tight text-foreground">
                                {cls.classType.name.split(" ")[0]} con{" "}
                                {cls.coach.user.name?.split(" ")[0]}
                              </p>
                              <div className="mt-1.5">
                                <Users className="h-3.5 w-3.5 text-muted/40" />
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                      ))}
                      {dayClasses.length === 0 && (
                        <p className="py-8 text-center text-xs text-muted/30">
                          —
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile bottom filters */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white px-4 py-3 safe-bottom lg:hidden">
        <div className="flex gap-3">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium text-foreground focus:border-foreground focus:outline-none"
          >
            <option value="all">Por disciplina</option>
            {classTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={filterCoach}
            onChange={(e) => setFilterCoach(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium text-foreground focus:border-foreground focus:outline-none"
          >
            <option value="all">Por instructor</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.user.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
