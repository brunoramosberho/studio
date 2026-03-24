"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  Users,
  Ticket,
} from "lucide-react";
import {
  format,
  addDays,
  startOfDay,
  isSameDay,
  isToday,
  isPast,
  startOfWeek,
  subWeeks,
  addWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn, formatTime } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";
import { useQuery } from "@tanstack/react-query";
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
  const [filterCoach, setFilterCoach] = useState<string>("all");
  const [filterStudio, setFilterStudio] = useState<string>("all");
  const [filterCity, setFilterCity] = useState<string>("all");
  const dayScrollRef = useRef<HTMLDivElement>(null);
  const branding = useBranding();

  const { data: classes = [], isLoading: loading } = useQuery<ClassWithDetails[]>({
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
    const active = creditsPkgs[0];
    return active.creditsTotal === null ? -1 : active.creditsTotal - active.creditsUsed;
  }, [creditsPkgs]);

  const { data: allStudios = [] } = useQuery<StudioItem[]>({
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

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const classTypes = Array.from(
    new Map(classes.map((c) => [c.classType.id, c.classType])).values(),
  );
  const coaches = Array.from(
    new Map(classes.map((c) => [c.coach.id, c.coach])).values(),
  );

  const cityStudioIds = filterCity === "all"
    ? null
    : new Set(allStudios.filter((s) => s.cityId === filterCity).map((s) => s.id));

  function getClassesForDay(day: Date) {
    return classes
      .filter((c) => isSameDay(new Date(c.startsAt), day))
      .filter((c) => filterType === "all" || c.classType.id === filterType)
      .filter((c) => filterCoach === "all" || c.coach.id === filterCoach)
      .filter((c) => !cityStudioIds || cityStudioIds.has(c.room?.studio?.id ?? ""))
      .filter((c) => filterStudio === "all" || c.room?.studio?.id === filterStudio)
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
  }

  const selectedClasses = getClassesForDay(selectedDay);

  if (loading) {
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
              const prev = subWeeks(currentDate, 1);
              setCurrentDate(prev);
              setSelectedDay(startOfWeek(prev, { weekStartsOn: 1 }));
            }}
            className="rounded-full p-1.5 text-muted active:bg-surface"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[12px] font-semibold uppercase tracking-widest text-muted">
            {format(weekStart, "MMMM yyyy", { locale: es })}
          </span>
          <button
            onClick={() => {
              const next = addWeeks(currentDate, 1);
              setCurrentDate(next);
              setSelectedDay(startOfWeek(next, { weekStartsOn: 1 }));
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
          {!hideCoachFilter && (
            <div className="relative flex-shrink-0">
              <select
                value={filterCoach}
                onChange={(e) => setFilterCoach(e.target.value)}
                className="appearance-none rounded-full border border-border bg-white py-1.5 pl-3 pr-7 text-[12px] font-medium text-foreground focus:outline-none"
              >
                <option value="all">Instructor</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.user.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            </div>
          )}
        </div>

        {/* Class list for selected day */}
        <div className="space-y-2">
          {selectedClasses.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              Sin clases para este día
            </p>
          ) : (
            selectedClasses.map((cls) => (
              <MobileClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} />
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
              onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
              className="rounded-full p-1.5 text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-xs font-medium uppercase tracking-widest text-muted">
              {format(weekStart, "MMMM yyyy", { locale: es })}
            </span>
            <button
              onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
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
            {!hideCoachFilter && (
              <FilterSelect
                label="Instructor"
                value={filterCoach}
                onChange={setFilterCoach}
                options={[
                  { value: "all", label: "Todos" },
                  ...coaches.map((c) => ({
                    value: c.id,
                    label: c.user.name || "Coach",
                  })),
                ]}
              />
            )}
          </div>
        </div>

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
              <div key={day.toISOString()} className="space-y-2">
                {dayClasses.map((cls) => (
                  <DesktopClassCard key={cls.id} cls={cls} classLinkPrefix={classLinkPrefix} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Mobile class card — Siclo-style list item ── */
function MobileClassCard({ cls, classLinkPrefix = "/class" }: { cls: ClassWithDetails; classLinkPrefix?: string }) {
  const past = isPast(new Date(cls.startsAt));
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - booked;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = (cls._count?.waitlist ?? 0) > 0;

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

        {/* Spots / Waitlist indicator */}
        <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
          {!past && isFull ? (
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
function DesktopClassCard({ cls, classLinkPrefix = "/class" }: { cls: ClassWithDetails; classLinkPrefix?: string }) {
  const past = isPast(new Date(cls.startsAt));
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - booked;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = (cls._count?.waitlist ?? 0) > 0;

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
        </div>
        {!past && isFull ? (
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
