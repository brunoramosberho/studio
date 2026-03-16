"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Clock,
  Filter,
  List,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { format, addDays, startOfWeek, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageTransition } from "@/components/shared/page-transition";
import { SpotsBadge } from "@/components/shared/spots-badge";
import { useScheduleStore } from "@/store/schedule-store";
import {
  formatTime,
  formatTimeRange,
  formatRelativeDay,
  getLevelLabel,
  cn,
} from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

export function ScheduleClient() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const { viewMode, setViewMode, currentDate, setCurrentDate, filters, setFilters, clearFilters } =
    useScheduleStore();

  useEffect(() => {
    async function fetchClasses() {
      try {
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
  const hasFilters = Object.values(filters).some(Boolean);

  function getClassesForDay(day: Date) {
    return classes.filter((c) => isSameDay(new Date(c.startsAt), day));
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-4xl font-bold text-foreground sm:text-5xl">
              Horarios
            </h1>
            <p className="mt-2 text-muted">
              Encuentra tu próxima clase y reserva tu lugar.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant={filterOpen ? "default" : "surface"}
              size="sm"
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros
              {hasFilters && (
                <span className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                  !
                </span>
              )}
            </Button>

            <Tabs
              value={viewMode}
              onValueChange={(v) => setViewMode(v as "week" | "day" | "list")}
            >
              <TabsList>
                <TabsTrigger value="week">
                  <Calendar className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="day">
                  <Clock className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="list">
                  <List className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {filterOpen && (
          <div className="mb-8 rounded-2xl bg-surface/80 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-foreground">
                Filtrar clases
              </h3>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 text-xs text-accent hover:text-accent/80"
                >
                  <X className="h-3 w-3" /> Limpiar
                </button>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL"].map((level) => (
                <button
                  key={level}
                  onClick={() =>
                    setFilters({
                      level: filters.level === level ? undefined : (level as typeof filters.level),
                    })
                  }
                  className={cn(
                    "rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                    filters.level === level
                      ? "bg-accent text-white"
                      : "bg-white text-muted hover:bg-accent/10 hover:text-accent",
                  )}
                >
                  {getLevelLabel(level)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Week navigation */}
        <div className="mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentDate(addDays(currentDate, -7))}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h2 className="font-display text-lg font-bold text-foreground">
            {format(weekStart, "d MMM", { locale: es })} –{" "}
            {format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCurrentDate(addDays(currentDate, 7))}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin text-accent" />
          </div>
        ) : classes.length === 0 ? (
          <div className="py-32 text-center">
            <Calendar className="mx-auto h-12 w-12 text-muted/30" />
            <h3 className="mt-4 font-display text-xl font-bold text-foreground">
              Sin clases disponibles
            </h3>
            <p className="mt-2 text-sm text-muted">
              No hay clases programadas para esta semana. Intenta con otra fecha
              o limpia los filtros.
            </p>
          </div>
        ) : (
          <>
            {/* Week View */}
            {viewMode === "week" && (
              <div className="grid gap-4 md:grid-cols-7">
                {weekDays.map((day) => {
                  const dayClasses = getClassesForDay(day);
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div key={day.toISOString()}>
                      <div
                        className={cn(
                          "mb-3 text-center",
                          isToday &&
                            "rounded-full bg-accent/10 py-1",
                        )}
                      >
                        <p className="text-xs uppercase tracking-wider text-muted">
                          {format(day, "EEE", { locale: es })}
                        </p>
                        <p
                          className={cn(
                            "font-mono text-lg font-medium",
                            isToday ? "text-accent" : "text-foreground",
                          )}
                        >
                          {format(day, "d")}
                        </p>
                      </div>
                      <div className="space-y-2">
                        {dayClasses.map((cls) => (
                          <Link
                            key={cls.id}
                            href={`/class/${cls.id}`}
                          >
                            <Card className="cursor-pointer transition-all hover:shadow-[var(--shadow-warm-md)] hover:-translate-y-0.5">
                              <CardContent className="p-3">
                                <p className="font-mono text-xs text-accent">
                                  {formatTime(cls.startsAt)}
                                </p>
                                <p className="mt-1 text-xs font-medium text-foreground line-clamp-1">
                                  {cls.classType.name}
                                </p>
                                <p className="mt-0.5 text-[10px] text-muted line-clamp-1">
                                  {cls.coach.user.name}
                                </p>
                                {cls.spotsLeft !== undefined && (
                                  <div className="mt-1.5">
                                    <SpotsBadge
                                      spotsLeft={cls.spotsLeft}
                                      maxCapacity={cls.classType.maxCapacity}
                                    />
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                        {dayClasses.length === 0 && (
                          <p className="py-4 text-center text-[10px] text-muted/40">
                            —
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Day View */}
            {viewMode === "day" && (
              <div className="space-y-3">
                <div className="mb-4 text-center">
                  <p className="font-display text-lg font-bold text-foreground">
                    {formatRelativeDay(currentDate)}
                  </p>
                </div>
                {getClassesForDay(currentDate).length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted">
                    No hay clases este día.
                  </p>
                ) : (
                  getClassesForDay(currentDate).map((cls) => (
                    <Link key={cls.id} href={`/class/${cls.id}`}>
                      <Card className="cursor-pointer transition-all hover:shadow-[var(--shadow-warm-md)]">
                        <CardContent className="flex items-center gap-4 p-5">
                          <div className="text-center">
                            <p className="font-mono text-lg font-medium text-accent">
                              {formatTime(cls.startsAt)}
                            </p>
                            <p className="text-[10px] text-muted">
                              {cls.classType.duration} min
                            </p>
                          </div>
                          <div className="h-10 w-px bg-border" />
                          <div className="flex-1">
                            <p className="font-display font-bold text-foreground">
                              {cls.classType.name}
                            </p>
                            <p className="text-sm text-muted">
                              {cls.coach.user.name}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="level">
                              {getLevelLabel(cls.classType.level)}
                            </Badge>
                            {cls.spotsLeft !== undefined && (
                              <div className="mt-1">
                                <SpotsBadge
                                  spotsLeft={cls.spotsLeft}
                                  maxCapacity={cls.classType.maxCapacity}
                                />
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))
                )}
              </div>
            )}

            {/* List View */}
            {viewMode === "list" && (
              <div className="space-y-8">
                {weekDays.map((day) => {
                  const dayClasses = getClassesForDay(day);
                  if (dayClasses.length === 0) return null;
                  return (
                    <div key={day.toISOString()}>
                      <h3 className="mb-3 font-display text-base font-bold capitalize text-foreground">
                        {formatRelativeDay(day)}
                      </h3>
                      <div className="space-y-2">
                        {dayClasses.map((cls) => (
                          <Link key={cls.id} href={`/class/${cls.id}`}>
                            <Card className="cursor-pointer transition-all hover:shadow-[var(--shadow-warm-md)]">
                              <CardContent className="flex items-center gap-4 p-4">
                                <p className="w-16 font-mono text-sm font-medium text-accent">
                                  {formatTime(cls.startsAt)}
                                </p>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {cls.classType.name}
                                  </p>
                                  <p className="text-xs text-muted">
                                    {cls.coach.user.name} · {cls.classType.duration} min
                                  </p>
                                </div>
                                {cls.spotsLeft !== undefined && (
                                  <SpotsBadge
                                    spotsLeft={cls.spotsLeft}
                                    maxCapacity={cls.classType.maxCapacity}
                                  />
                                )}
                              </CardContent>
                            </Card>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageTransition>
  );
}
