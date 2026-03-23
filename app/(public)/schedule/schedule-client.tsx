"use client";

import { useEffect, useState, useRef } from "react";
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
import type { ClassWithDetails } from "@/types";

export function ScheduleClient() {
  const { data: session } = useSession();
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(startOfDay(new Date()));
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCoach, setFilterCoach] = useState<string>("all");
  const dayScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchClasses() {
      setLoading(true);
      try {
        const res = await fetch("/api/classes");
        if (res.ok) setClasses(await res.json());
      } catch {
        /* no db */
      } finally {
        setLoading(false);
      }
    }
    fetchClasses();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    async function fetchCredits() {
      try {
        const res = await fetch("/api/packages/mine");
        if (res.ok) {
          const pkgs = await res.json();
          const active = pkgs[0];
          if (active) {
            setCredits(
              active.creditsTotal === null
                ? -1
                : active.creditsTotal - active.creditsUsed,
            );
          }
        }
      } catch {}
    }
    fetchCredits();
  }, [session]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const classTypes = Array.from(
    new Map(classes.map((c) => [c.classType.id, c.classType])).values(),
  );
  const coaches = Array.from(
    new Map(classes.map((c) => [c.coach.id, c.coach])).values(),
  );

  function getClassesForDay(day: Date) {
    return classes
      .filter((c) => isSameDay(new Date(c.startsAt), day))
      .filter((c) => filterType === "all" || c.classType.id === filterType)
      .filter((c) => filterCoach === "all" || c.coach.id === filterCoach)
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
        {/* Credits badge + title */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-foreground">
            Horarios
          </h1>
          {credits !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1">
              <Ticket className="h-3.5 w-3.5 text-accent" />
              <span className="text-[12px] font-semibold text-accent">
                {credits === -1 ? "Ilimitado" : `${credits} clases`}
              </span>
            </div>
          )}
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
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="appearance-none rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-medium text-foreground focus:outline-none"
          >
            <option value="all">Disciplina</option>
            {classTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={filterCoach}
            onChange={(e) => setFilterCoach(e.target.value)}
            className="appearance-none rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-medium text-foreground focus:outline-none"
          >
            <option value="all">Instructor</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.user.name}
              </option>
            ))}
          </select>
        </div>

        {/* Class list for selected day */}
        <div className="space-y-2">
          {selectedClasses.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              Sin clases para este día
            </p>
          ) : (
            selectedClasses.map((cls) => (
              <MobileClassCard key={cls.id} cls={cls} />
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
                Flō Studio
              </h1>
              <p className="text-[13px] text-muted">Pilates & Wellness</p>
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
            <FilterSelect
              label="Disciplina"
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: "all", label: "Todas" },
                ...classTypes.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
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
                  <DesktopClassCard key={cls.id} cls={cls} />
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
function MobileClassCard({ cls }: { cls: ClassWithDetails }) {
  const past = isPast(new Date(cls.startsAt));
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.classType.maxCapacity;
  const spotsLeft = maxCap - booked;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = (cls._count?.waitlist ?? 0) > 0;

  return (
    <Link
      href={past ? "#" : `/class/${cls.id}`}
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
            <p
              className={cn(
                "truncate text-[15px] font-bold",
                past ? "text-muted" : "text-foreground",
              )}
            >
              {cls.classType.name}
            </p>
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
function DesktopClassCard({ cls }: { cls: ClassWithDetails }) {
  const past = isPast(new Date(cls.startsAt));
  const booked = cls._count?.bookings ?? 0;
  const maxCap = cls.classType.maxCapacity;
  const spotsLeft = maxCap - booked;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = (cls._count?.waitlist ?? 0) > 0;

  return (
    <Link href={`/class/${cls.id}`} className={cn(past && "pointer-events-none")}>
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
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-border bg-white py-2 pl-3 pr-8 text-[13px] font-medium text-foreground focus:border-foreground focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
}
