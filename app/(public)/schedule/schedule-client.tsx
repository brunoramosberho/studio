"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Users,
  Ticket,
  AlertTriangle,
} from "lucide-react";
import {
  format,
  addDays,
  startOfDay,
  isSameDay,
  isToday,
  isPast,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn, formatTime, formatRelativeDay } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ClassWithDetails } from "@/types";

function countryFlag(code: string) {
  return code.toUpperCase().split("").map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join("");
}

interface ScheduleClientProps {
  coachUserId?: string;
  classLinkPrefix?: string;
  title?: string;
  hideCoachFilter?: boolean;
  hideCredits?: boolean;
}

interface StudioItem { id: string; name: string; cityId: string }
interface CityItem { id: string; name: string; countryCode: string }
interface LocationCountry { code: string; cities: { id: string; name: string }[] }

export function ScheduleClient({
  coachUserId,
  classLinkPrefix = "/class",
  title = "Horarios",
  hideCoachFilter = false,
  hideCredits = false,
}: ScheduleClientProps = {}) {
  const { data: session } = useSession();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()));
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCoaches, setFilterCoaches] = useState<Set<string>>(new Set());
  const toggleCoach = useCallback((id: string) => {
    setFilterCoaches((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [filterStudio, setFilterStudio] = useState<string>("all");
  const [filterCity, setFilterCityRaw] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return sessionStorage.getItem("schedule-city") || "all";
  });
  function setFilterCity(city: string) {
    setFilterCityRaw(city);
    try { sessionStorage.setItem("schedule-city", city); } catch {}
  }
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const branding = useBranding();
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<ClassWithDetails | null>(null);

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cancel failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      setCancelTarget(null);
    },
  });

  const handleCancelBooking = useCallback((bookingId: string, cls?: ClassWithDetails) => {
    if (cls) setCancelTarget(cls);
  }, []);

  const { data: classes = [], isLoading: loadingClasses } = useQuery<ClassWithDetails[]>({
    queryKey: ["classes", coachUserId ?? "all"],
    queryFn: async () => {
      const url = coachUserId ? `/api/classes?coachId=${coachUserId}` : "/api/classes";
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: creditsPkgs } = useQuery<{ creditsTotal: number | null; creditsUsed: number }[]>({
    queryKey: ["packages", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/packages/mine");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
  });

  const credits = useMemo(() => {
    if (!creditsPkgs?.length) return null;
    const now = Date.now();
    const active = creditsPkgs.filter((p: any) => new Date(p.expiresAt).getTime() > now);
    if (!active.length) return null;
    if (active.some((p: any) => p.creditsTotal === null)) return -1;
    return active.reduce(
      (sum: number, p: any) => sum + Math.max(0, (p.creditsTotal ?? 0) - p.creditsUsed),
      0,
    );
  }, [creditsPkgs]);

  const { data: allStudios = [], isLoading: loadingStudios } = useQuery<StudioItem[]>({
    queryKey: ["studios"],
    queryFn: async () => {
      const res = await fetch("/api/studios");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((s: StudioItem) => ({ id: s.id, name: s.name, cityId: s.cityId }));
    },
  });

  const { data: cities = [] } = useQuery<CityItem[]>({
    queryKey: ["cities"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      if (!res.ok) return [];
      const countries: LocationCountry[] = await res.json();
      return countries.flatMap((c) =>
        c.cities.map((city) => ({ ...city, countryCode: c.code })),
      );
    },
  });

  // City auto-detection (runs once when cities data arrives)
  const [cityDetected, setCityDetected] = useState(false);
  useEffect(() => {
    if (cityDetected || cities.length === 0) return;
    async function detectCity() {
      let detectedCityId: string | null = null;

      if (session?.user) {
        try {
          const profRes = await fetch("/api/profile");
          if (profRes.ok) {
            const prof = await profRes.json();
            if (prof.cityId && cities.some((c) => c.id === prof.cityId)) {
              detectedCityId = prof.cityId;
            }
          }
        } catch {}
      }

      if (!detectedCityId && cities.length > 1) {
        try {
          const detectRes = await fetch("/api/detect-location");
          if (detectRes.ok) {
            const geo = await detectRes.json();
            if (geo.cityId && cities.some((c) => c.id === geo.cityId)) {
              detectedCityId = geo.cityId;
            }
          }
        } catch {}

        if (!detectedCityId) {
          try {
            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
            const isEurope = tz.startsWith("Europe/");
            const europeCity = cities.find((c) => c.countryCode === "ES");
            const americaCity = cities.find((c) => c.countryCode === "MX");
            if (isEurope && europeCity) detectedCityId = europeCity.id;
            else if (!isEurope && americaCity) detectedCityId = americaCity.id;
          } catch {}
        }
      }

      if (!detectedCityId && cities.length === 1) {
        detectedCityId = cities[0].id;
      }

      if (detectedCityId) setFilterCity(detectedCityId);
      setCityDetected(true);
    }
    detectCity();
  }, [cities, session?.user, cityDetected]);

  const studios = filterCity === "all"
    ? allStudios
    : allStudios.filter((s) => s.cityId === filterCity);
  const showCityFilter = cities.length > 1 && !session?.user;
  const showStudioFilter = studios.length > 1;

  const days = Array.from({ length: 7 }, (_, i) => addDays(currentDate, i));

  const classTypes = Array.from(
    new Map(classes.map((c) => [c.classType.id, c.classType])).values(),
  );
  const coaches = Array.from(
    new Map(classes.map((c) => [c.coach.id, c.coach])).values(),
  );

  const searchParams = useSearchParams();
  const [disciplineApplied, setDisciplineApplied] = useState(false);
  useEffect(() => {
    if (disciplineApplied || classTypes.length === 0) return;
    const disc = searchParams.get("discipline");
    if (disc) {
      const match = classTypes.find(
        (ct) => ct.name.toLowerCase() === disc.toLowerCase(),
      );
      if (match) setFilterType(match.id);
    }
    setDisciplineApplied(true);
  }, [searchParams, classTypes, disciplineApplied]);

  const cityStudioIds = filterCity === "all" || allStudios.length === 0
    ? null
    : new Set(allStudios.filter((s) => s.cityId === filterCity).map((s) => s.id));

  function getClassesForDay(day: Date) {
    return classes
      .filter((c) => isSameDay(new Date(c.startsAt), day))
      .filter((c) => filterType === "all" || c.classType.id === filterType)
      .filter((c) => filterCoaches.size === 0 || filterCoaches.has(c.coach.id))
      .filter((c) => !cityStudioIds || cityStudioIds.has(c.room?.studio?.id ?? ""))
      .filter((c) => filterStudio === "all" || c.room?.studio?.id === filterStudio)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
  }

  const selectedClasses = getClassesForDay(selectedDay);

  const mobileDays = useMemo(() => {
    const idx = days.findIndex((d) => isSameDay(d, selectedDay));
    const remaining = idx >= 0 ? days.slice(idx) : days;
    return remaining
      .map((day) => ({ day, classes: getClassesForDay(day) }))
      .filter((d) => d.classes.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, classes, filterType, filterCoaches, filterStudio, filterCity, days]);

  const initialLoading = (loadingClasses || !cityDetected) && classes.length === 0;

  if (initialLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  const isLoggedIn = !!session;

  return (
    <div className={cn("pb-24 pt-4 lg:pb-8 lg:pt-6", !isLoggedIn && "mx-auto max-w-[1200px] px-4")}>
      {/* ── Mobile layout ── */}
      <div className="lg:hidden">
        {/* Title + city/credits */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-foreground">
            {title}
          </h1>
          <div className="flex items-center gap-2">
            {!hideCredits && credits !== null && (
              <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1">
                <Ticket className="h-3.5 w-3.5 text-accent" />
                <span className="text-[12px] font-semibold text-accent">
                  {credits === -1 ? "Ilimitado" : `${credits} clases`}
                </span>
              </div>
            )}
            {showCityFilter && (
              <div className="relative">
                <select
                  value={filterCity}
                  onChange={(e) => { setFilterCity(e.target.value); setFilterStudio("all"); }}
                  className="appearance-none rounded-full border border-border bg-white py-1.5 pl-3 pr-7 text-[12px] font-medium text-foreground focus:outline-none"
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {countryFlag(c.countryCode)} {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              </div>
            )}
          </div>
        </div>

        {/* Week navigation */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => {
              const prev = addDays(currentDate, -7);
              setCurrentDate(prev);
              setSelectedDay(prev);
            }}
            className="rounded-full p-1.5 text-muted active:bg-surface"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[12px] font-semibold uppercase tracking-widest text-muted">
            {format(currentDate, "MMMM yyyy", { locale: es })}
          </span>
          <button
            onClick={() => {
              const next = addDays(currentDate, 7);
              setCurrentDate(next);
              setSelectedDay(next);
            }}
            className="rounded-full p-1.5 text-muted active:bg-surface"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day tabs — horizontal scroll */}
        <div
          ref={dayScrollRef}
          className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 scrollbar-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {days.map((day) => {
            const active = isSameDay(day, selectedDay);
            const today = isToday(day);
            const dayClasses = getClassesForDay(day);

            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(startOfDay(day))}
                className={cn(
                  "flex min-w-[52px] flex-shrink-0 flex-col items-center rounded-xl px-3 py-2 transition-colors",
                  active
                    ? "bg-foreground text-white"
                    : "text-muted hover:bg-surface",
                )}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider">
                  {format(day, "EEE", { locale: es })}
                </span>
                <span
                  className={cn(
                    "mt-0.5 text-[18px] font-bold",
                    active ? "text-white" : "text-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                {today && !active && (
                  <div className="mt-0.5 h-1 w-1 rounded-full bg-accent" />
                )}
                {dayClasses.length > 0 && !today && !active && (
                  <div className="mt-0.5 h-1 w-1 rounded-full bg-muted/30" />
                )}
              </button>
            );
          })}
        </div>

        {/* Coach avatar strip */}
        {!hideCoachFilter && coaches.length > 0 && (
          <div className="-mx-4 mb-3 overflow-x-auto px-4 scrollbar-none" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="flex gap-4">
              {coaches.map((c) => {
                const active = filterCoaches.has(c.id);
                const firstName = c.user.name?.split(" ")[0] || "Coach";
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCoach(c.id)}
                    className="flex flex-shrink-0 flex-col items-center gap-1"
                  >
                    <div
                      className={cn(
                        "h-14 w-14 overflow-hidden rounded-full border-2 transition-all",
                        active ? "border-foreground ring-2 ring-foreground/20" : "border-transparent",
                      )}
                    >
                      {c.user.image ? (
                        <img
                          src={c.user.image}
                          alt={firstName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-accent/20 text-base font-bold text-accent">
                          {firstName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className={cn(
                      "max-w-[56px] truncate text-[11px] font-medium",
                      active ? "text-foreground" : "text-muted",
                    )}>
                      {firstName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters (inline pills) */}
        <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-none">
          {showStudioFilter && (
            <div className="relative flex-shrink-0">
              <select
                value={filterStudio}
                onChange={(e) => setFilterStudio(e.target.value)}
                className="appearance-none rounded-full border border-border bg-white py-1.5 pl-3 pr-7 text-[12px] font-medium text-foreground focus:outline-none"
              >
                <option value="all">Estudio</option>
                {studios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            </div>
          )}
          <div className="relative flex-shrink-0">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="appearance-none rounded-full border border-border bg-white py-1.5 pl-3 pr-7 text-[12px] font-medium text-foreground focus:outline-none"
            >
              <option value="all">Disciplina</option>
              {classTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          </div>
        </div>

        {/* Continuous class list from selected day onwards */}
        <div className="space-y-3">
          {mobileDays.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              Sin clases disponibles
            </p>
          ) : (
            mobileDays.map(({ day, classes: dayClasses }, groupIdx) => (
              <div key={day.toISOString()}>
                {/* Day separator (skip for first group if it's the selected day) */}
                {groupIdx > 0 && (
                  <div className="flex items-center gap-3 pb-2 pt-4">
                    <div className="h-px flex-1 bg-border/60" />
                    <span className="text-[12px] font-medium text-muted">
                      {isToday(day)
                        ? "hoy"
                        : format(day, "EEEE d", { locale: es })}
                    </span>
                    <div className="h-px flex-1 bg-border/60" />
                  </div>
                )}
                <CollapsiblePastClasses
                  classes={dayClasses}
                  classLinkPrefix={classLinkPrefix}
                  onCancel={handleCancelBooking}
                  cancellingId={cancelMutation.isPending && cancelTarget?.myBookingId ? cancelTarget.myBookingId : null}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Desktop layout ── */}
      <div className="hidden lg:block">
        {/* Top bar: title (public only), week nav, filters */}
        <div className="mb-5 flex flex-wrap items-center gap-4">
          {!isLoggedIn && (
            <div className="mr-auto">
              <h1 className="font-display text-[1.75rem] font-bold leading-tight text-foreground">
                {branding.studioName} Studio
              </h1>
              <p className="text-[13px] text-muted">{branding.tagline}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(addDays(currentDate, -7))}
              className="rounded-full p-1.5 text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-xs font-medium uppercase tracking-widest text-muted">
              {format(currentDate, "MMMM yyyy", { locale: es })}
            </span>
            <button
              onClick={() => setCurrentDate(addDays(currentDate, 7))}
              className="rounded-full p-1.5 text-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            {showCityFilter && (
              <FilterSelect
                label="Ciudad"
                value={filterCity}
                onChange={(v) => { setFilterCity(v); setFilterStudio("all"); }}
                options={[
                  { value: "all", label: "Todas" },
                  ...cities.map((c) => ({ value: c.id, label: `${countryFlag(c.countryCode)} ${c.name}` })),
                ]}
              />
            )}
            {showStudioFilter && (
              <FilterSelect
                label="Estudio"
                value={filterStudio}
                onChange={setFilterStudio}
                options={[
                  { value: "all", label: "Todos" },
                  ...studios.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            )}
            <FilterSelect
              label="Disciplina"
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: "all", label: "Todas" },
                ...classTypes.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
          </div>
        </div>

        {/* Coach avatar strip — desktop */}
        {!hideCoachFilter && coaches.length > 0 && (
          <div className="mb-5 overflow-x-auto scrollbar-none">
            <div className="flex gap-5">
              {coaches.map((c) => {
                const active = filterCoaches.has(c.id);
                const firstName = c.user.name?.split(" ")[0] || "Coach";
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCoach(c.id)}
                    className="flex flex-shrink-0 flex-col items-center gap-1.5"
                  >
                    <div
                      className={cn(
                        "h-12 w-12 overflow-hidden rounded-full border-2 transition-all",
                        active
                          ? "border-foreground ring-2 ring-foreground/20"
                          : "border-transparent hover:border-foreground/20",
                      )}
                    >
                      {c.user.image ? (
                        <img
                          src={c.user.image}
                          alt={firstName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-accent/20 text-sm font-bold text-accent">
                          {firstName.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className={cn(
                      "max-w-[52px] truncate text-[11px] font-medium",
                      active ? "text-foreground" : "text-muted",
                    )}>
                      {firstName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Day headers */}
        <div className="mb-3 grid grid-cols-7 gap-2">
          {days.map((day) => {
            const today = isToday(day);
            return (
              <div key={day.toISOString()} className="text-center">
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider",
                    today ? "text-foreground" : "text-muted",
                  )}
                >
                  {today && "● "}
                  {format(day, "EEE", { locale: es })} {format(day, "d")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Class columns */}
        <div className="grid grid-cols-7 items-start gap-2">
          {days.map((day) => {
            const dayClasses = getClassesForDay(day);
            return (
              <DesktopDayColumn key={day.toISOString()} classes={dayClasses} classLinkPrefix={classLinkPrefix} onCancel={handleCancelBooking} cancellingId={cancelMutation.isPending && cancelTarget?.myBookingId ? cancelTarget.myBookingId : null} />
            );
          })}
        </div>
      </div>

      {/* Cancel confirmation sheet */}
      <AnimatePresence>
        {cancelTarget && cancelTarget.myBookingId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
              onClick={() => !cancelMutation.isPending && setCancelTarget(null)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-white pb-safe shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
            >
              <div className="flex justify-center pt-3 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>

              <div className="p-6 text-center">
                <div
                  className={cn(
                    "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                    canCancelClassFreely(cancelTarget) ? "bg-orange-50" : "bg-red-50",
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "h-6 w-6",
                      canCancelClassFreely(cancelTarget) ? "text-orange-500" : "text-red-500",
                    )}
                  />
                </div>

                <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                  Cancelar reserva
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {cancelTarget.classType.name} · {formatRelativeDay(cancelTarget.startsAt)}
                </p>

                {canCancelClassFreely(cancelTarget) ? (
                  <div className="mt-4 rounded-xl bg-green-50 px-4 py-3">
                    <p className="text-[13px] font-medium text-green-700">
                      Tu crédito será devuelto
                    </p>
                    <p className="mt-0.5 text-[12px] text-green-600">
                      Faltan más de 12 horas para la clase
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-red-50 px-4 py-3">
                    <p className="text-[13px] font-medium text-red-700">
                      Tu crédito NO será devuelto
                    </p>
                    <p className="mt-0.5 text-[12px] text-red-600">
                      Faltan menos de 12 horas ({hoursUntilClass(cancelTarget)}h).
                      Las cancelaciones tardías no reembolsan créditos.
                    </p>
                  </div>
                )}

                <div className="mt-6 flex flex-col gap-2">
                  <Button
                    variant="destructive"
                    className="w-full rounded-full"
                    onClick={() => cancelMutation.mutate(cancelTarget.myBookingId!)}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {canCancelClassFreely(cancelTarget) ? "Cancelar reserva" : "Cancelar sin reembolso"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full rounded-full"
                    onClick={() => setCancelTarget(null)}
                    disabled={cancelMutation.isPending}
                  >
                    Volver
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1000;

function canCancelClassFreely(cls: ClassWithDetails): boolean {
  return new Date(cls.startsAt).getTime() - Date.now() > CANCELLATION_WINDOW_MS;
}

function hoursUntilClass(cls: ClassWithDetails): number {
  return Math.max(0, Math.round((new Date(cls.startsAt).getTime() - Date.now()) / 3_600_000));
}

/* ── Collapsible past classes section ── */
function CollapsiblePastClasses({ classes, classLinkPrefix, onCancel, cancellingId }: { classes: ClassWithDetails[]; classLinkPrefix: string; onCancel: (id: string, cls?: ClassWithDetails) => void; cancellingId: string | null }) {
  const pastClasses = classes.filter((c) => isPast(new Date(c.startsAt)));
  const upcomingClasses = classes.filter((c) => !isPast(new Date(c.startsAt)));
  const [showPast, setShowPast] = useState(false);

  if (pastClasses.length === 0 || upcomingClasses.length === 0) {
    return (
      <div className="space-y-3">
        {classes.map((cls) => (
          <MobileClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} onCancel={onCancel} cancellingId={cancellingId} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {showPast && pastClasses.map((cls) => (
        <MobileClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} onCancel={onCancel} cancellingId={cancellingId} />
      ))}
      <button
        onClick={() => setShowPast(!showPast)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-medium text-muted transition-colors active:bg-surface"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showPast && "rotate-180")} />
        {showPast
          ? "Ocultar anteriores"
          : `${pastClasses.length} clase${pastClasses.length > 1 ? "s" : ""} anterior${pastClasses.length > 1 ? "es" : ""}`}
      </button>
      {upcomingClasses.map((cls) => (
        <MobileClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} onCancel={onCancel} cancellingId={cancellingId} />
      ))}
    </div>
  );
}

/* ── Mobile class card — Siclo-style list item ── */
function MobileClassCard({ cls, classLinkPrefix = "/class", onCancel, cancellingId }: { cls: ClassWithDetails; classLinkPrefix?: string; onCancel: (id: string, cls?: ClassWithDetails) => void; cancellingId: string | null }) {
  const past = isPast(new Date(cls.startsAt));
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - booked;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = (cls._count?.waitlist ?? 0) > 0;
  const myBookingId = cls.myBookingId;
  const isCancelling = cancellingId === myBookingId;

  return (
    <Link
      href={past ? "#" : `${classLinkPrefix}/${cls.id}`}
      className={cn(past && "pointer-events-none")}
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border px-4 py-3.5 transition-shadow",
          past
            ? "border-border/30 bg-surface/50 opacity-50"
            : "border-border/50 bg-white active:shadow-md",
        )}
      >
        {/* Time column */}
        <div className="w-14 flex-shrink-0 text-center">
          <p
            className={cn(
              "text-[15px] font-bold",
              past ? "text-muted" : "text-foreground",
            )}
          >
            {formatTime(cls.startsAt)}
          </p>
          <p className="text-[11px] text-muted">{cls.classType.duration} min</p>
        </div>

        {/* Divider */}
        <div
          className="h-10 w-0.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: cls.classType.color + "40" }}
        />

        {/* Coach photo + info */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {cls.coach.user.image ? (
            <img
              src={cls.coach.user.image}
              alt={cls.coach.user.name || "Coach"}
              className={cn(
                "h-9 w-9 flex-shrink-0 rounded-full object-cover",
                past && "grayscale",
              )}
            />
          ) : (
            <div
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent",
                past && "opacity-50",
              )}
            >
              {cls.coach.user.name?.charAt(0) || "C"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p
                className={cn(
                  "truncate text-[15px] font-bold",
                  past ? "text-muted" : "text-foreground",
                )}
              >
                {cls.classType.name}
              </p>
              {!past && cls.tag && (
                <span className="flex-shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  {cls.tag}
                </span>
              )}
            </div>
            <p className="truncate text-[13px] text-muted">
              con {cls.coach.user.name?.split(" ")[0]}
              {cls.room?.studio?.name && (
                <span className="text-muted/50"> · {cls.room.studio.name}</span>
              )}
            </p>
            {!past && cls.friendsGoing && cls.friendsGoing.length > 0 && (
              <div className="mt-1 flex items-center gap-1">
                <div className="flex -space-x-1">
                  {cls.friendsGoing.slice(0, 3).map((f) => (
                    <img
                      key={f.id}
                      src={f.image || ""}
                      alt={f.name || ""}
                      className="h-4 w-4 rounded-full border border-white object-cover"
                    />
                  ))}
                </div>
                <span className="text-[10px] text-accent">
                  {cls.friendsGoing.length === 1
                    ? `${cls.friendsGoing[0].name?.split(" ")[0]} va`
                    : `${cls.friendsGoing.length} amigos van`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Spots / Waitlist / Cancel */}
        <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
          {!past && myBookingId ? (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(myBookingId, cls); }}
              disabled={isCancelling}
              className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95 disabled:opacity-50"
            >
              {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancelar"}
            </button>
          ) : !past && isFull ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {hasWaitlist ? "Lista de espera" : "Llena"}
            </span>
          ) : !past && spotsLeft <= 3 ? (
            <span className="text-[11px] font-medium text-rose-500">
              {spotsLeft} {spotsLeft === 1 ? "lugar" : "lugares"}
            </span>
          ) : (
            <Users
              className={cn(
                "h-4 w-4",
                past ? "text-muted/20" : "text-muted/40",
              )}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

/* ── Desktop class card ── */
function DesktopDayColumn({ classes, classLinkPrefix, onCancel, cancellingId }: { classes: ClassWithDetails[]; classLinkPrefix: string; onCancel: (id: string, cls?: ClassWithDetails) => void; cancellingId: string | null }) {
  const pastClasses = classes.filter((c) => isPast(new Date(c.startsAt)));
  const upcomingClasses = classes.filter((c) => !isPast(new Date(c.startsAt)));
  const [showPast, setShowPast] = useState(false);

  if (pastClasses.length === 0 || upcomingClasses.length === 0) {
    return (
      <div className="space-y-2">
        {classes.map((cls) => (
          <DesktopClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} onCancel={onCancel} cancellingId={cancellingId} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showPast && pastClasses.map((cls) => (
        <DesktopClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} onCancel={onCancel} cancellingId={cancellingId} />
      ))}
      <button
        onClick={() => setShowPast(!showPast)}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 py-1.5 text-[10px] font-medium text-muted transition-colors hover:bg-surface/60"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", showPast && "rotate-180")} />
        {showPast ? "Ocultar" : `${pastClasses.length} anterior${pastClasses.length > 1 ? "es" : ""}`}
      </button>
      {upcomingClasses.map((cls) => (
        <DesktopClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} onCancel={onCancel} cancellingId={cancellingId} />
      ))}
    </div>
  );
}

function DesktopClassCard({ cls, classLinkPrefix = "/class", onCancel, cancellingId }: { cls: ClassWithDetails; classLinkPrefix?: string; onCancel: (id: string, cls?: ClassWithDetails) => void; cancellingId: string | null }) {
  const past = isPast(new Date(cls.startsAt));
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - booked;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = (cls._count?.waitlist ?? 0) > 0;
  const myBookingId = cls.myBookingId;
  const isCancelling = cancellingId === myBookingId;

  return (
    <Link href={`${classLinkPrefix}/${cls.id}`} className={cn(past && "pointer-events-none")}>
      <div
        className={cn(
          "flex h-[155px] flex-col justify-between rounded-2xl border px-4 py-3.5 transition-shadow",
          past
            ? "border-border/30 bg-surface/60"
            : "border-border/70 bg-white hover:shadow-md",
        )}
      >
        <div>
          <p
            className={cn(
              "text-[13px] font-medium",
              past ? "text-muted/50" : "text-foreground",
            )}
          >
            {formatTime(cls.startsAt)}
          </p>
          <p
            className={cn(
              "text-[11px]",
              past ? "text-muted/40" : "text-muted",
            )}
          >
            {cls.classType.duration} min
          </p>
          <p
            className={cn(
              "mt-1.5 truncate text-[14px] font-bold",
              past ? "text-muted/50" : "text-foreground",
            )}
          >
            {cls.classType.name}
          </p>
          {!past && cls.tag && (
            <span className="mt-0.5 inline-block rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-semibold text-accent">
              {cls.tag}
            </span>
          )}
          <div className="mt-1 flex items-center gap-1.5">
            {cls.coach.user.image ? (
              <img
                src={cls.coach.user.image}
                alt={cls.coach.user.name || "Coach"}
                className={cn(
                  "h-5 w-5 rounded-full object-cover",
                  past && "grayscale",
                )}
              />
            ) : (
              <div
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-[9px] font-bold text-accent",
                  past && "opacity-50",
                )}
              >
                {cls.coach.user.name?.charAt(0) || "C"}
              </div>
            )}
            <p
              className={cn(
                "truncate text-[12px]",
                past ? "text-muted/40" : "text-muted",
              )}
            >
              {cls.coach.user.name?.split(" ")[0]}
            </p>
          </div>
          {cls.room?.studio?.name && (
            <p className={cn("mt-0.5 truncate text-[10px]", past ? "text-muted/30" : "text-muted/50")}>
              {cls.room.studio.name}
            </p>
          )}
        </div>
        {!past && myBookingId ? (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCancel(myBookingId, cls); }}
            disabled={isCancelling}
            className="self-start rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95 disabled:opacity-50"
          >
            {isCancelling ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : "Cancelar"}
          </button>
        ) : !past && isFull ? (
          <span className="self-start rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
            {hasWaitlist ? "Lista de espera" : "Llena"}
          </span>
        ) : !past && spotsLeft <= 3 ? (
          <span className="text-[10px] font-medium text-rose-500">
            {spotsLeft} {spotsLeft === 1 ? "lugar" : "lugares"}
          </span>
        ) : (
          <Users
            className={cn(
              "h-3.5 w-3.5",
              past ? "text-muted/20" : "text-muted/30",
            )}
          />
        )}
      </div>
    </Link>
  );
}

/* ── Filter dropdown (inline) ── */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const isAll = value === "all";
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "appearance-none rounded-lg border bg-white py-2 pl-3 pr-8 text-[13px] font-medium focus:outline-none",
          isAll
            ? "border-border text-muted"
            : "border-foreground/20 text-foreground",
        )}
      >
        <option value="all">{label}</option>
        {options.filter((o) => o.value !== "all").map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
