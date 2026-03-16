"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Users,
  Loader2,
  MapPin,
} from "lucide-react";
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
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { SpotsBadge } from "@/components/shared/spots-badge";
import { useScheduleStore } from "@/store/schedule-store";
import {
  cn,
  formatTime,
  formatTimeRange,
  formatRelativeDay,
  getLevelLabel,
} from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

const CLASS_TYPE_FILTERS = [
  "Todas",
  "Reformer Pilates",
  "Mat Flow",
  "Barre Fusion",
] as const;

const TIME_SECTIONS = [
  { key: "morning", label: "Mañana" },
  { key: "afternoon", label: "Tarde" },
  { key: "evening", label: "Noche" },
] as const;

function getTimeOfDay(date: Date | string): "morning" | "afternoon" | "evening" {
  const hour = new Date(date).getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function groupByTimeOfDay(items: ClassWithDetails[]) {
  const groups: Record<string, ClassWithDetails[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const cls of items) {
    groups[getTimeOfDay(cls.startsAt)].push(cls);
  }
  return groups;
}

export function ScheduleClient() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("Todas");
  const { currentDate, setCurrentDate, filters } = useScheduleStore();

  useEffect(() => {
    async function fetchClasses() {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.classTypeId) params.set("classTypeId", filters.classTypeId);
        if (filters.coachId) params.set("coachId", filters.coachId);
        if (filters.level) params.set("level", filters.level);
        const res = await fetch(`/api/classes?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setClasses(data);
        }
      } catch {
        // API may not be connected yet
      } finally {
        setLoading(false);
      }
    }
    fetchClasses();
  }, [filters]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const selectedDay = weekDays.find((d) => isSameDay(d, currentDate))
    ? currentDate
    : weekStart;

  function getFilteredClassesForDay(day: Date) {
    let filtered = classes.filter((c) => isSameDay(new Date(c.startsAt), day));
    if (activeFilter !== "Todas") {
      filtered = filtered.filter((c) => c.classType.name === activeFilter);
    }
    return filtered.sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  }

  const dayClasses = getFilteredClassesForDay(selectedDay);
  const grouped = groupByTimeOfDay(dayClasses);

  let cardIndex = 0;

  return (
    <PageTransition>
      {/* ── Dark header ── */}
      <div className="bg-[#1C1917] pb-5 pt-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Horarios
          </h1>
          <p className="mt-1 text-sm text-stone-400">
            Encuentra tu clase y reserva tu lugar
          </p>

          {/* Class type pills */}
          <div className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {CLASS_TYPE_FILTERS.map((type) => (
              <button
                key={type}
                onClick={() => setActiveFilter(type)}
                className={cn(
                  "shrink-0 rounded-full px-5 py-2 text-sm font-medium transition-all",
                  activeFilter === type
                    ? "bg-[#C9A96E] text-white shadow-lg shadow-[#C9A96E]/20"
                    : "bg-white/10 text-stone-300 hover:bg-white/[.15]",
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Week navigation */}
          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
              className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium capitalize text-stone-300">
              {format(weekStart, "MMMM yyyy", { locale: es })}
            </span>
            <button
              onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
              className="rounded-full p-2 text-stone-400 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Day selector pills */}
          <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:gap-2 sm:px-0">
            {weekDays.map((day) => {
              const active = isSameDay(day, selectedDay);
              const today = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setCurrentDate(day)}
                  className={cn(
                    "flex shrink-0 flex-col items-center rounded-xl px-3.5 py-2 transition-all sm:px-5",
                    active
                      ? "bg-[#C9A96E] text-white shadow-lg shadow-[#C9A96E]/25"
                      : today
                        ? "bg-white/10 text-[#C9A96E]"
                        : "bg-transparent text-stone-400 hover:bg-white/5",
                  )}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wider">
                    {format(day, "EEE", { locale: es })}
                  </span>
                  <span className="mt-0.5 text-lg font-bold leading-tight">
                    {format(day, "d")}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Class list (light) ── */}
      <div className="min-h-[50vh] bg-stone-50 pb-16">
        <div className="mx-auto max-w-5xl px-4 pt-5 sm:px-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-7 w-7 animate-spin text-[#C9A96E]" />
            </div>
          ) : dayClasses.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                ease: [0.25, 0.46, 0.45, 0.94] as const,
              }}
              className="py-20 text-center"
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-stone-200">
                <Calendar className="h-7 w-7 text-stone-400" />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-stone-800">
                Sin clases disponibles
              </h3>
              <p className="mx-auto mt-2 max-w-xs text-sm text-stone-500">
                No hay clases programadas para este día. Prueba seleccionando
                otra fecha o cambia el filtro.
              </p>
            </motion.div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDay.toISOString() + activeFilter}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-6"
              >
                {TIME_SECTIONS.map(({ key, label }) => {
                  const sectionClasses = grouped[key];
                  if (!sectionClasses || sectionClasses.length === 0) return null;
                  return (
                    <div key={key}>
                      {/* Section header */}
                      <div className="mb-3 flex items-center gap-2.5">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">
                          {label}
                        </h2>
                        <div className="h-px flex-1 bg-stone-200" />
                      </div>

                      <div className="space-y-2.5">
                        {sectionClasses.map((cls) => {
                          const idx = cardIndex++;
                          return (
                            <motion.div
                              key={cls.id}
                              initial={{ opacity: 0, y: 12 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.3,
                                delay: idx * 0.06,
                                ease: [0.25, 0.46, 0.45, 0.94] as const,
                              }}
                            >
                              <Card className="overflow-hidden rounded-2xl border-0 bg-white shadow-sm transition-shadow hover:shadow-md">
                                <CardContent className="p-0">
                                  {/* Desktop row */}
                                  <div className="hidden items-center gap-5 p-4 sm:flex">
                                    <div className="w-20 shrink-0 text-center">
                                      <p className="font-mono text-lg font-bold text-[#C9A96E]">
                                        {formatTime(cls.startsAt)}
                                      </p>
                                      <p className="flex items-center justify-center gap-1 text-[11px] text-stone-400">
                                        <Clock className="h-3 w-3" />
                                        {cls.classType.duration} min
                                      </p>
                                    </div>

                                    <div className="h-10 w-px bg-stone-100" />

                                    <div className="flex-1 min-w-0">
                                      <p className="font-display text-[15px] font-bold text-stone-900">
                                        {cls.classType.name}
                                      </p>
                                      <p className="mt-0.5 text-sm text-stone-500 truncate">
                                        {cls.coach.user.name}
                                      </p>
                                    </div>

                                    <Badge variant="level" className="shrink-0">
                                      {getLevelLabel(cls.classType.level)}
                                    </Badge>

                                    {cls.spotsLeft !== undefined && (
                                      <div className="flex w-24 shrink-0 items-center justify-center gap-1.5">
                                        <Users className="h-3.5 w-3.5 text-stone-400" />
                                        <SpotsBadge
                                          spotsLeft={cls.spotsLeft}
                                          maxCapacity={cls.classType.maxCapacity}
                                        />
                                      </div>
                                    )}

                                    <Link href={`/class/${cls.id}`} className="shrink-0">
                                      <Button
                                        size="sm"
                                        className="rounded-full bg-[#C9A96E] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#B8954F]"
                                      >
                                        Reservar
                                      </Button>
                                    </Link>
                                  </div>

                                  {/* Mobile stack */}
                                  <div className="flex flex-col p-4 sm:hidden">
                                    <div className="flex items-start gap-3.5">
                                      <div className="shrink-0 text-center">
                                        <p className="font-mono text-base font-bold text-[#C9A96E]">
                                          {formatTime(cls.startsAt)}
                                        </p>
                                        <p className="text-[10px] text-stone-400">
                                          {cls.classType.duration} min
                                        </p>
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="font-display text-sm font-bold text-stone-900">
                                          {cls.classType.name}
                                        </p>
                                        <p className="mt-0.5 text-xs text-stone-500 truncate">
                                          {cls.coach.user.name}
                                        </p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          <Badge variant="level" className="text-[10px]">
                                            {getLevelLabel(cls.classType.level)}
                                          </Badge>
                                          {cls.spotsLeft !== undefined && (
                                            <SpotsBadge
                                              spotsLeft={cls.spotsLeft}
                                              maxCapacity={cls.classType.maxCapacity}
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <Link href={`/class/${cls.id}`} className="mt-3">
                                      <Button
                                        size="sm"
                                        className="w-full rounded-full bg-[#C9A96E] text-sm font-semibold text-white transition-colors hover:bg-[#B8954F]"
                                      >
                                        Reservar
                                      </Button>
                                    </Link>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
