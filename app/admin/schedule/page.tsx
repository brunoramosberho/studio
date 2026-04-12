"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Palette,
  Plus,
  X,
  Filter,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  isSameDay,
  isPast,
} from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatTime } from "@/lib/utils";
import { ClassFormDialog } from "@/components/admin/class-form-dialog";
import { ClassDetailDialog } from "@/components/admin/class-detail-dialog";
import type { ClassWithDetails } from "@/types";

type ColorMode = "coach" | "classType";

export default function AdminSchedulePage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [colorMode, setColorMode] = useState<ColorMode>("classType");

  const [filterStudio, setFilterStudio] = useState<string>("all");
  const [filterCoach, setFilterCoach] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const [selectedClass, setSelectedClass] = useState<ClassWithDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null);
  const [defaultDate, setDefaultDate] = useState("");
  const [defaultTime, setDefaultTime] = useState("");

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(weekEnd, "yyyy-MM-dd");

  const { data: classes, isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["admin-schedule", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/classes?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const hours = Array.from({ length: 16 }, (_, i) => i + 6);

  // Derive filter options from loaded classes
  const filterOptions = useMemo(() => {
    const studioMap = new Map<string, string>();
    const coachMap = new Map<string, string>();
    const typeMap = new Map<string, string>();
    for (const c of classes ?? []) {
      if (c.room?.studio) studioMap.set(c.room.studio.id, c.room.studio.name);
      coachMap.set(c.coach.id, c.coach.name ?? "Coach");
      typeMap.set(c.classType.id, c.classType.name);
    }
    return {
      studios: [...studioMap.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      coaches: [...coachMap.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      types: [...typeMap.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [classes]);

  const filtered = useMemo(() => {
    return (classes ?? []).filter((c) => {
      if (filterStudio !== "all" && c.room?.studio?.id !== filterStudio) return false;
      if (filterCoach !== "all" && c.coach.id !== filterCoach) return false;
      if (filterType !== "all" && c.classType.id !== filterType) return false;
      return true;
    });
  }, [classes, filterStudio, filterCoach, filterType]);

  const hasFilters = filterStudio !== "all" || filterCoach !== "all" || filterType !== "all";

  // Color assignment
  const coachColors: Record<string, string> = {};
  const typeColors: Record<string, string> = {};
  const palette = [
    "#1A2C4E", "#2D5016", "#C9A96E", "#7C3AED", "#DC2626",
    "#0891B2", "#D97706", "#059669", "#6366F1", "#DB2777",
  ];
  let cIdx = 0;
  let tIdx = 0;
  filtered.forEach((c) => {
    if (!coachColors[c.coach.id]) {
      coachColors[c.coach.id] = palette[cIdx % palette.length];
      cIdx++;
    }
    if (!typeColors[c.classType.id]) {
      typeColors[c.classType.id] = c.classType.color || palette[tIdx % palette.length];
      tIdx++;
    }
  });

  const getColor = (cls: ClassWithDetails) =>
    colorMode === "coach" ? coachColors[cls.coach.id] : typeColors[cls.classType.id];

  function handleClassClick(cls: ClassWithDetails) {
    setSelectedClass(cls);
    setDetailOpen(true);
  }

  function handleCellClick(day: Date, hour: number) {
    setEditingClass(null);
    setDefaultDate(format(day, "yyyy-MM-dd"));
    setDefaultTime(`${String(hour).padStart(2, "0")}:00`);
    setFormOpen(true);
  }

  function handleEdit(cls: ClassWithDetails) {
    setEditingClass(cls);
    setDefaultDate("");
    setDefaultTime("");
    setFormOpen(true);
  }

  function handleCreate() {
    setEditingClass(null);
    setDefaultDate("");
    setDefaultTime("");
    setFormOpen(true);
  }

  function clearFilters() {
    setFilterStudio("all");
    setFilterCoach("all");
    setFilterType("all");
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("schedule")}</h1>
          <p className="mt-1 text-sm text-muted">{t("scheduleSubtitle")}</p>
        </motion.div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setColorMode(colorMode === "coach" ? "classType" : "coach")}
          >
            <Palette className="h-4 w-4" />
            {colorMode === "coach" ? t("byType") : t("byCoach")}
          </Button>
          <Button onClick={handleCreate} size="sm" className="gap-1.5 bg-admin hover:bg-admin/90">
            <Plus className="h-4 w-4" />
            {t("createClass")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted" />
        <Select value={filterStudio} onValueChange={setFilterStudio}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder={t("studio")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStudios")}</SelectItem>
            {filterOptions.studios.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCoach} onValueChange={setFilterCoach}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder={t("coachLabel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allCoaches")}</SelectItem>
            {filterOptions.coaches.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder={t("discipline")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allDisciplines")}</SelectItem>
            {filterOptions.types.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs text-muted" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" />
            {t("clearFilters")}
          </Button>
        )}

        {hasFilters && (
          <Badge variant="outline" className="text-[10px]">
            {filtered.length} {t("classesCount")}
          </Badge>
        )}
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display text-base font-bold sm:text-lg">
          {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Week grid */}
      {isLoading ? (
        <Skeleton className="h-[600px] rounded-2xl" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[700px]">
              {/* Day headers */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
                <div className="p-2" />
                {days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border-l p-2 text-center",
                      isSameDay(day, new Date()) && "bg-admin/5",
                    )}
                  >
                    <p className="text-xs font-medium capitalize text-muted">
                      {format(day, "EEE", { locale: es })}
                    </p>
                    <p className={cn(
                      "text-sm font-bold",
                      isSameDay(day, new Date()) && "text-admin",
                    )}>
                      {format(day, "d")}
                    </p>
                  </div>
                ))}
              </div>

              {/* Hour rows */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="grid grid-cols-[60px_repeat(7,1fr)] border-b last:border-b-0"
                >
                  <div className="flex items-start justify-end p-1 pr-2">
                    <span className="font-mono text-[10px] text-muted">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  </div>
                  {days.map((day) => {
                    const dayClasses = filtered.filter((c) => {
                      const start = new Date(c.startsAt);
                      return isSameDay(start, day) && start.getHours() === hour;
                    });
                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() => dayClasses.length === 0 && handleCellClick(day, hour)}
                        className={cn(
                          "relative min-h-[52px] border-l p-0.5 transition-colors",
                          isSameDay(day, new Date()) && "bg-admin/[0.02]",
                          dayClasses.length === 0 && "cursor-pointer hover:bg-surface/60",
                        )}
                      >
                        {dayClasses.map((cls) => {
                          const past = isPast(new Date(cls.startsAt));
                          const isCancelled = cls.status === "CANCELLED";
                          const booked = cls._count?.bookings ?? 0;
                          const maxCap = cls.room?.maxCapacity ?? 0;

                          return (
                            <div
                              key={cls.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClassClick(cls);
                              }}
                              className={cn(
                                "mb-0.5 cursor-pointer rounded-md px-1.5 py-1 text-white transition-opacity hover:opacity-90",
                                past && !isCancelled && "opacity-50",
                                isCancelled && "opacity-30 line-through",
                              )}
                              style={{ backgroundColor: getColor(cls) }}
                            >
                              <p className="truncate text-[10px] font-semibold leading-tight">
                                {cls.classType.name}
                              </p>
                              <p className="truncate text-[9px] opacity-80">
                                {cls.coach.name?.split(" ")[0]} · {formatTime(cls.startsAt)}
                              </p>
                              <p className="text-[8px] opacity-60">
                                {booked}/{maxCap}
                                {isCancelled && ` · ${t("cancelled")}`}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Class detail dialog */}
      <ClassDetailDialog
        cls={selectedClass}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
      />

      {/* Create / Edit class dialog */}
      <ClassFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingClass={editingClass}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
      />
    </div>
  );
}
