"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Palette,
  Plus,
  X,
  Filter,
  CalendarOff,
  Sparkles,
  AlertTriangle,
  EyeOff,
  Clock,
  Trash2,
  Loader2,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatTime, getWallClockInZone } from "@/lib/utils";
import { ClassFormDialog } from "@/components/admin/class-form-dialog";
import { ClassDetailDialog } from "@/components/admin/class-detail-dialog";
import { SectionTabs } from "@/components/admin/section-tabs";
import { SCHEDULE_TABS } from "@/components/admin/section-tab-configs";
import { PlannerPanel } from "@/components/admin/schedule-planner/PlannerPanel";
import { ScheduleVisibilityDialog } from "@/components/admin/schedule-visibility-dialog";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { ClassWithDetails } from "@/types";
import {
  formatSlotTime,
  generateSlotTimes,
  normalizeSlotTimes,
  parseSlotTime,
  resolveSlotStarts,
  slotIndexFor,
} from "@/lib/schedule/slots";

const ALL_STUDIOS = "__all__";

type ColorMode = "coach" | "classType";

interface WeekSlotsResponse {
  coaches: {
    id: string;
    userId: string;
    name: string;
    initials: string;
    color: string;
    image: string | null;
  }[];
  slots: Record<string, string[]>;
  openHour: number;
  closeHour: number;
}

export default function AdminSchedulePage() {
  const t = useTranslations("admin");
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [colorMode, setColorMode] = useState<ColorMode>("classType");
  const [showAvailability, setShowAvailability] = useState(false);

  // FRONT_DESK gets a read-only schedule: no create/edit/cancel buttons, no
  // empty-cell click to open the create form, no instructor-availability
  // overlay (its API is ADMIN-only). API routes enforce the same boundary.
  const { data: me } = useQuery<{ role: string }>({
    queryKey: ["admin", "me-role"],
    queryFn: async () => {
      const res = await fetch("/api/admin/me");
      if (!res.ok) throw new Error("Not admin");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const canEdit = me?.role === "ADMIN";

  // Studio filter is single-select (not multi/All): the calendar grid
  // can't visually overlay multiple studios meaningfully. We default to
  // the first studio and hide the picker if the tenant only has one.
  const { data: tenantStudios } = useQuery<{ studios: { id: string; name: string }[] }>({
    queryKey: ["admin-schedule-studios"],
    queryFn: async () => {
      const res = await fetch("/api/admin/studios");
      if (!res.ok) return { studios: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [slotEditorOpen, setSlotEditorOpen] = useState(false);
  const [filterStudio, setFilterStudio] = useState<string>("");
  const [filterCoach, setFilterCoach] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  // Seed filterStudio with the first available studio once the list loads,
  // and re-seed if the current pick disappears from the tenant.
  useEffect(() => {
    const list = tenantStudios?.studios ?? [];
    if (list.length === 0) return;
    if (filterStudio === ALL_STUDIOS) return;
    if (filterStudio && list.some((s) => s.id === filterStudio)) return;
    setFilterStudio(list[0].id);
  }, [tenantStudios, filterStudio]);

  // Picking an instructor switches to all studios: their week is what you
  // want to see, and they may teach across locations.
  function handleCoachFilter(value: string) {
    setFilterCoach(value);
    if (value !== "all") setFilterStudio(ALL_STUDIOS);
  }

  // Studio name goes on the card only when several studios share the grid —
  // otherwise it's noise.
  const showStudioOnCard =
    (tenantStudios?.studios.length ?? 0) > 1 && filterStudio === ALL_STUDIOS;

  const [selectedClass, setSelectedClass] = useState<ClassWithDetails | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null);
  const [defaultDate, setDefaultDate] = useState("");
  const [defaultTime, setDefaultTime] = useState("");

  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerSeed, setPlannerSeed] = useState<string | null>(null);

  const [visibilityOpen, setVisibilityOpen] = useState(false);

  // Spark chat can hand off planning intent here via ?planner=spark + a seed
  // message in sessionStorage. Open the panel and pass the seed through so
  // PlannerPanel sends it as the first planner message.
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get("planner") !== "spark") return;
    let seed: string | null = null;
    try {
      seed = sessionStorage.getItem("spark-planner-seed");
      sessionStorage.removeItem("spark-planner-seed");
    } catch {}
    if (seed) setPlannerSeed(seed);
    setPlannerOpen(true);
    // Strip the query param so a reload doesn't re-trigger.
    router.replace("/admin/schedule", { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(weekEnd, "yyyy-MM-dd");

  const { data: classes, isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["admin-schedule", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/classes?from=${from}&to=${to}&includeCancelled=true`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: weekSlots } = useQuery<WeekSlotsResponse>({
    queryKey: ["admin-schedule-week-slots", from],
    queryFn: async () => {
      const res = await fetch(
        `/api/admin/availability/week-slots?weekStart=${from}`,
      );
      if (!res.ok) throw new Error("Failed to fetch week slots");
      return res.json();
    },
    enabled: showAvailability,
  });

  const coachById = useMemo(() => {
    const map = new Map<string, WeekSlotsResponse["coaches"][number]>();
    for (const c of weekSlots?.coaches ?? []) map.set(c.id, c);
    return map;
  }, [weekSlots]);

  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  // Grid rows: hourly by default, or the studio's configured class times.
  const { data: gridConfig } = useQuery<{
    scheduleSlotTimes: string[];
    openHour: number;
    closeHour: number;
  }>({
    queryKey: ["admin-schedule-grid-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/schedule/grid-config");
      if (!res.ok) return { scheduleSlotTimes: [], openHour: 6, closeHour: 22 };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const slotStarts = useMemo(
    () =>
      resolveSlotStarts(
        gridConfig?.scheduleSlotTimes,
        gridConfig?.openHour ?? 6,
        gridConfig?.closeHour ?? 22,
      ),
    [gridConfig],
  );

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
      // Hide cancelled classes unless they had bookings (so admin sees them)
      if (c.status === "CANCELLED" && (c._count?.bookings ?? 0) === 0) return false;
      if (filterStudio && filterStudio !== ALL_STUDIOS && c.room?.studio?.id !== filterStudio)
        return false;
      if (filterCoach !== "all" && c.coach.id !== filterCoach) return false;
      if (filterType !== "all" && c.classType.id !== filterType) return false;
      return true;
    });
  }, [classes, filterStudio, filterCoach, filterType]);

  // Studio filter doesn't count as "active" since it's always set — it's
  // the scoping context, not an optional narrowing.
  const hasFilters = filterCoach !== "all" || filterType !== "all";

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
      // Use the coach's own profile colour so the schedule matches the colour
      // shown everywhere else (coach detail, analytics, ratings, availability).
      coachColors[c.coach.id] = c.coach.color || palette[cIdx % palette.length];
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

  function handleCellClick(day: Date, startMinutes: number) {
    setEditingClass(null);
    setDefaultDate(format(day, "yyyy-MM-dd"));
    setDefaultTime(formatSlotTime(startMinutes));
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
    // Studio is the scoping context, not a filter — leave it as-is.
    setFilterCoach("all");
    setFilterType("all");
  }

  return (
    <TooltipProvider delayDuration={120}>
    <div className="mx-auto max-w-7xl space-y-5">
      <SectionTabs tabs={SCHEDULE_TABS} ariaLabel="Schedule view" />
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("schedule")}</h1>
          <p className="mt-1 text-sm text-muted">{t("scheduleSubtitle")}</p>
        </motion.div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <Button
              onClick={() => setPlannerOpen(true)}
              size="sm"
              className="gap-1.5 bg-gradient-to-r from-admin to-admin/80 text-white shadow-sm hover:from-admin/90 hover:to-admin/70"
            >
              <Sparkles className="h-4 w-4" />
              Planea con Spark
            </Button>
          )}
          {canEdit && (
            <Button
              variant={showAvailability ? "secondary" : "ghost"}
              size="sm"
              className="gap-1.5"
              onClick={() => setShowAvailability((v) => !v)}
              title="Mostrar disponibilidad de instructores"
            >
              <CalendarOff className="h-4 w-4" />
              Disponibilidad
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setVisibilityOpen(true)}
              title={t("openVisibilitySettings")}
            >
              <Eye className="h-4 w-4" />
              {t("visibility")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => setColorMode(colorMode === "coach" ? "classType" : "coach")}
          >
            <Palette className="h-4 w-4" />
            {colorMode === "coach" ? t("byType") : t("byCoach")}
          </Button>
          {canEdit && (
            <Button onClick={handleCreate} size="sm" className="gap-1.5 bg-admin hover:bg-admin/90">
              <Plus className="h-4 w-4" />
              {t("createClass")}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted" />
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setSlotEditorOpen(true)}
          >
            <Clock className="h-3.5 w-3.5" />
            {t("slotEditorButton")}
          </Button>
        )}
        {/* Studio is single-select (calendar can't overlay multiple
            cleanly). Hidden when the tenant only has one studio. */}
        {(tenantStudios?.studios.length ?? 0) > 1 && (
          <Select value={filterStudio} onValueChange={setFilterStudio}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder={t("studio")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STUDIOS}>{t("allStudios")}</SelectItem>
              {(tenantStudios?.studios ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={filterCoach} onValueChange={handleCoachFilter}>
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

              {/* Slot rows — hourly by default, or the studio's class times */}
              {slotStarts.map((slotStart, rowIndex) => {
                const hour = Math.floor(slotStart / 60);
                return (
                <div
                  key={slotStart}
                  className="grid grid-cols-[60px_repeat(7,1fr)] border-b last:border-b-0"
                >
                  <div className="flex items-start justify-end p-1 pr-2">
                    <span className="font-mono text-[10px] text-muted">
                      {formatSlotTime(slotStart)}
                    </span>
                  </div>
                  {days.map((day) => {
                    const dayClasses = filtered.filter((c) => {
                      // Bucket classes by the studio's wall-clock day+hour, not
                      // the admin's browser tz, so a Madrid class at 08:15
                      // always lands in the 08:00 row for Monday regardless of
                      // where the admin is viewing from.
                      const tz = c.room?.studio?.city?.timezone ?? undefined;
                      if (!tz) {
                        const start = new Date(c.startsAt);
                        return isSameDay(start, day) && start.getHours() === hour;
                      }
                      const wc = getWallClockInZone(c.startsAt, tz);
                      return (
                        wc.year === day.getFullYear() &&
                        wc.month === day.getMonth() + 1 &&
                        wc.day === day.getDate() &&
                        wc.hour === hour
                      );
                    });
                    const slotKey = `${format(day, "yyyy-MM-dd")}-${hour}`;
                    const availableIds =
                      showAvailability && weekSlots
                        ? weekSlots.slots[slotKey] ?? []
                        : [];
                    // Skip coaches already assigned in this cell — their chip
                    // is already implied by the class card.
                    const teachingHere = new Set(dayClasses.map((c) => c.coach.id));
                    const availableOthers = availableIds.filter(
                      (id) => !teachingHere.has(id),
                    );
                    return (
                      <div
                        key={day.toISOString()}
                        onClick={() =>
                          canEdit && dayClasses.length === 0 && handleCellClick(day, hour)
                        }
                        className={cn(
                          "relative min-h-[52px] border-l p-0.5 transition-colors",
                          isSameDay(day, new Date()) && "bg-admin/[0.02]",
                          canEdit && dayClasses.length === 0 && "cursor-pointer hover:bg-surface/60",
                        )}
                      >
                        {dayClasses.map((cls) => {
                          const past = isPast(new Date(cls.startsAt));
                          const isCancelled = cls.status === "CANCELLED";
                          const booked = cls._count?.bookings ?? 0;
                          const maxCap = cls.room?.maxCapacity ?? 0;
                          // Not yet released to the public schedule: dashed
                          // outline instead of the solid card, so a glance
                          // separates "programada" from "ya publicada".
                          const unpublished =
                            !past && !isCancelled && cls.visibleToClients === false;
                          const warning = !past && !isCancelled ? cls.availabilityWarning : null;

                          const card = (
                            <div
                              key={cls.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleClassClick(cls);
                              }}
                              className={cn(
                                "mb-0.5 cursor-pointer rounded-md px-1.5 py-1 text-white transition-opacity hover:opacity-90",
                                // Transparent border on every card so the
                                // dashed one below doesn't shift its content.
                                "border-2 border-transparent",
                                past && !isCancelled && "opacity-50",
                                isCancelled && "opacity-30 line-through",
                                // Not published yet: full color at full
                                // strength — it's the most actionable class on
                                // the grid, so it must not read as disabled.
                                // The dashed edge + eye-off icon carry it.
                                unpublished && "border-dashed border-white/70",
                              )}
                              style={{ backgroundColor: getColor(cls) }}
                            >
                              <p className="flex items-center gap-1 truncate text-[10px] font-semibold leading-tight">
                                {warning && (
                                  <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-400" />
                                )}
                                {unpublished && <EyeOff className="h-2.5 w-2.5 shrink-0 opacity-70" />}
                                <span className="truncate">{cls.classType.name}</span>
                              </p>
                              <p className="truncate text-[9px] opacity-80">
                                {cls.coach.name} · {formatTime(cls.startsAt, cls.room?.studio?.city?.timezone ?? undefined)}
                              </p>
                              <p className="truncate text-[8px] opacity-60">
                                {booked}/{maxCap}
                                {showStudioOnCard && cls.room?.studio?.name
                                  ? ` · ${cls.room.studio.name}`
                                  : ""}
                                {isCancelled && ` · ${t("cancelled")}`}
                              </p>
                            </div>
                          );

                          if (!warning && !unpublished) return card;
                          return (
                            <Tooltip key={cls.id}>
                              <TooltipTrigger asChild>
                                <div>{card}</div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px] px-2 py-1">
                                <p className="text-[11px]">
                                  {warning
                                    ? t(
                                        warning === "time_off"
                                          ? "warnCoachTimeOff"
                                          : "warnCoachOutsideHours",
                                        { name: cls.coach.name ?? "" },
                                      )
                                    : t("notPublishedYet")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                        {showAvailability && availableOthers.length > 0 && (
                          <div
                            className="mt-0.5 flex flex-wrap items-center gap-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {availableOthers.slice(0, 4).map((id) => {
                              const coach = coachById.get(id);
                              if (!coach) return null;
                              return (
                                <Tooltip key={id}>
                                  <TooltipTrigger asChild>
                                    <span
                                      className="inline-flex h-[16px] min-w-[16px] cursor-default items-center justify-center rounded-full px-1 text-[8px] font-bold text-white ring-1 ring-white/60"
                                      style={{ backgroundColor: coach.color }}
                                    >
                                      {coach.initials[0]}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    className="px-2 py-1"
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <span
                                        className="inline-block h-2 w-2 rounded-full"
                                        style={{ backgroundColor: coach.color }}
                                      />
                                      {coach.name}
                                    </span>
                                  </TooltipContent>
                                </Tooltip>
                              );
                            })}
                            {availableOthers.length > 4 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default text-[8px] font-medium text-muted">
                                    +{availableOthers.length - 4}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <div className="flex flex-col gap-1">
                                    {availableOthers.slice(4).map((id) => {
                                      const coach = coachById.get(id);
                                      if (!coach) return null;
                                      return (
                                        <span
                                          key={id}
                                          className="flex items-center gap-1.5"
                                        >
                                          <span
                                            className="inline-block h-2 w-2 rounded-full"
                                            style={{
                                              backgroundColor: coach.color,
                                            }}
                                          />
                                          {coach.name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <SlotTimesDialog
        open={slotEditorOpen}
        onOpenChange={setSlotEditorOpen}
        current={gridConfig?.scheduleSlotTimes ?? []}
        openHour={gridConfig?.openHour ?? 6}
        closeHour={gridConfig?.closeHour ?? 22}
      />

      {/* Class detail dialog */}
      <ClassDetailDialog
        cls={selectedClass}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        canEdit={canEdit}
      />

      {/* Create / Edit class dialog (only mounted for ADMIN) */}
      {canEdit && (
        <ClassFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          editingClass={editingClass}
          defaultDate={defaultDate}
          defaultTime={defaultTime}
          // Scope room options to the studio currently selected in the
          // schedule filter — saves the admin from picking a room in the
          // wrong studio.
          defaultStudioId={filterStudio}
        />
      )}

      {canEdit && (
        <PlannerPanel
          open={plannerOpen}
          onOpenChange={(o) => {
            setPlannerOpen(o);
            if (!o) setPlannerSeed(null);
          }}
          seedMessage={plannerSeed}
          onSeedConsumed={() => setPlannerSeed(null)}
        />
      )}

      {canEdit && (
        <ScheduleVisibilityDialog open={visibilityOpen} onOpenChange={setVisibilityOpen} />
      )}
    </div>
    </TooltipProvider>
  );
}


// ── Slot times editor ─────────────────────────────────────────────────
// Studios whose classes don't start on the hour (07:00, 08:10, 09:20…)
// set the exact starts here, so clicking an empty cell prefills the real
// class time. Empty list = one row per hour, the default.

function SlotTimesDialog({
  open,
  onOpenChange,
  current,
  openHour,
  closeHour,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: string[];
  openHour: number;
  closeHour: number;
}) {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const [times, setTimes] = useState<string[]>(current);
  const [seeded, setSeeded] = useState(false);
  const [firstTime, setFirstTime] = useState(formatSlotTime(openHour * 60));
  const [interval, setIntervalMin] = useState("70");
  const [count, setCount] = useState("8");
  const [newTime, setNewTime] = useState("");

  // Re-seed from the server value each time the dialog opens.
  if (open && !seeded) {
    setTimes(current);
    setSeeded(true);
  }
  if (!open && seeded) setSeeded(false);

  const save = useMutation({
    mutationFn: async (value: string[]) => {
      const res = await fetch("/api/admin/settings/availability", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleSlotTimes: value }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-schedule-grid-config"] });
      toast.success(t("slotEditorSaved"));
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addTime = () => {
    const parsed = parseSlotTime(newTime);
    if (parsed === null) return;
    const next = normalizeSlotTimes([...times, formatSlotTime(parsed)]);
    if (next) setTimes(next);
    setNewTime("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("slotEditorTitle")}</DialogTitle>
          <DialogDescription>{t("slotEditorDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-surface/40 p-3">
            <p className="mb-2 text-xs font-medium text-foreground">
              {t("slotEditorGenerate")}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-[10px] text-muted">
                  {t("slotEditorFirst")}
                </label>
                <Input
                  type="time"
                  value={firstTime}
                  onChange={(e) => setFirstTime(e.target.value)}
                  className="h-8 w-[110px] text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted">
                  {t("slotEditorInterval")}
                </label>
                <Input
                  type="number"
                  min={5}
                  value={interval}
                  onChange={(e) => setIntervalMin(e.target.value)}
                  className="h-8 w-[80px] text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] text-muted">
                  {t("slotEditorCount")}
                </label>
                <Input
                  type="number"
                  min={1}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="h-8 w-[70px] text-xs"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setTimes(
                    generateSlotTimes(
                      firstTime,
                      parseInt(interval, 10) || 60,
                      parseInt(count, 10) || 1,
                    ),
                  )
                }
              >
                {t("slotEditorApply")}
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-foreground">
              {times.length > 0
                ? t("slotEditorList", { count: times.length })
                : t("slotEditorHourly")}
            </p>
            {times.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {times.map((time) => (
                  <span
                    key={time}
                    className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 font-mono text-xs text-foreground"
                  >
                    {time}
                    <button
                      onClick={() => setTimes(times.filter((x) => x !== time))}
                      className="text-muted transition-colors hover:text-rose-600"
                      aria-label={t("delete")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="h-8 w-[110px] text-xs"
              />
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addTime}>
                {t("slotEditorAdd")}
              </Button>
              {times.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted"
                  onClick={() => setTimes([])}
                >
                  {t("slotEditorReset")}
                </Button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {t("slotEditorWindow", {
                open: formatSlotTime(openHour * 60),
                close: formatSlotTime(closeHour * 60),
              })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button onClick={() => save.mutate(times)} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
