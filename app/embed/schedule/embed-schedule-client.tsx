"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import {
  format,
  addDays,
  startOfDay,
  isSameDay,
  isToday,
  isPast,
} from "date-fns";
import { es, enUS } from "date-fns/locale";
import { Asterisk, Dumbbell, Loader2 } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { getIconComponent } from "@/components/admin/icon-picker";

interface EmbedClass {
  id: string;
  startsAt: string;
  endsAt: string;
  tag: string | null;
  classType: {
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
    level: string;
    duration: number;
  };
  room: {
    id: string;
    maxCapacity: number;
    studio: { id: string; name: string } | null;
  } | null;
  coach: {
    id: string;
    userId: string;
    name: string | null;
    photoUrl: string | null;
  };
  bookingsCount: number;
  waitlistCount: number;
}

interface EmbedScheduleClientProps {
  /** Absolute origin of the tenant site — used to open
   *  booking/login flows in a new tab outside the iframe. */
  tenantOrigin: string;
}

export function EmbedScheduleClient({ tenantOrigin }: EmbedScheduleClientProps) {
  const t = useTranslations("schedule");
  const tf = useTranslations("footer");
  const te = useTranslations("embed");
  const locale = useLocale();
  const dateFnsLocale = locale === "en" ? enUS : es;

  const containerRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDay, setSelectedDay] = useState(today);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());

  const toggleType = useCallback((id: string) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { data: classes = [], isLoading } = useQuery<EmbedClass[]>({
    queryKey: ["embed-classes"],
    queryFn: async () => {
      const res = await fetch("/api/embed/classes");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(today, i)),
    [today],
  );

  const classTypes = useMemo(
    () =>
      Array.from(
        new Map(classes.map((c) => [c.classType.id, c.classType])).values(),
      ),
    [classes],
  );

  function getClassesForDay(day: Date) {
    return classes
      .filter((c) => isSameDay(new Date(c.startsAt), day))
      .filter((c) => filterTypes.size === 0 || filterTypes.has(c.classType.id))
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
  }

  const selectedClasses = getClassesForDay(selectedDay);

  // If today has no upcoming classes, jump forward to the next day with
  // classes so the widget lands on something useful.
  const autoAdvancedRef = useRef(false);
  useEffect(() => {
    if (autoAdvancedRef.current || isLoading || classes.length === 0) return;
    autoAdvancedRef.current = true;

    const todayClasses = classes.filter((c) =>
      isSameDay(new Date(c.startsAt), today),
    );
    const hasUpcoming = todayClasses.some(
      (c) => !isPast(new Date(c.startsAt)),
    );
    if (hasUpcoming) return;

    for (let i = 1; i < 7; i++) {
      const next = addDays(today, i);
      if (classes.some((c) => isSameDay(new Date(c.startsAt), next))) {
        setSelectedDay(next);
        break;
      }
    }
  }, [isLoading, classes, today]);

  // Emit height updates so the host page's loader can resize the iframe.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.parent === window) return;

    const emit = () => {
      const h =
        containerRef.current?.scrollHeight ?? document.body.scrollHeight ?? 0;
      window.parent.postMessage(
        { type: "magicstudio:embed:resize", height: h },
        "*",
      );
    };

    emit();
    const ro = new ResizeObserver(emit);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("load", emit);
    return () => {
      ro.disconnect();
      window.removeEventListener("load", emit);
    };
  }, [isLoading, selectedDay, classes.length, filterTypes]);

  const openInParent = useCallback(
    (path: string) => {
      if (typeof window === "undefined") return;
      const url = `${tenantOrigin}${path}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [tenantOrigin],
  );

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-[640px] px-4 pb-8 pt-5"
    >
      {/* Title row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="font-display text-xl font-bold leading-tight text-foreground">
          {te("title")}
        </h1>
        <button
          type="button"
          onClick={() => openInParent("/login")}
          className="shrink-0 text-[13px] font-medium text-accent transition-opacity hover:opacity-80"
        >
          {te("myAccount")}
        </button>
      </div>

      {/* Day tabs — horizontal scroll, matches /schedule */}
      <div
        className="-mx-4 mb-4 flex gap-1 overflow-x-auto px-4 scrollbar-none"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {days.map((day) => {
          const active = isSameDay(day, selectedDay);
          const todayMarker = isToday(day);
          const dayClasses = getClassesForDay(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(startOfDay(day))}
              className={cn(
                "flex min-w-[52px] flex-shrink-0 flex-col items-center rounded-xl px-3 py-2 transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted hover:bg-surface",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                {format(day, "EEE", { locale: dateFnsLocale })}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-[18px] font-bold",
                  active ? "text-background" : "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              {todayMarker && !active && (
                <div className="mt-0.5 h-1 w-1 rounded-full bg-accent" />
              )}
              {dayClasses.length > 0 && !todayMarker && !active && (
                <div className="mt-0.5 h-1 w-1 rounded-full bg-muted/30" />
              )}
            </button>
          );
        })}
      </div>

      {/* Discipline pills */}
      {classTypes.length > 0 && (
        <div
          className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="flex items-center gap-1.5">
            {classTypes.map((ct) => {
              const active = filterTypes.has(ct.id);
              const Icon = ct.icon ? getIconComponent(ct.icon) : null;
              return (
                <button
                  key={ct.id}
                  onClick={() => toggleType(ct.id)}
                  className={cn(
                    "flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                    active
                      ? "border-transparent text-white"
                      : "border-border bg-card text-foreground hover:bg-muted/30",
                  )}
                  style={
                    active && ct.color
                      ? { backgroundColor: ct.color }
                      : undefined
                  }
                >
                  {Icon ? (
                    <Icon className="h-3 w-3" />
                  ) : (
                    <Dumbbell className="h-3 w-3" />
                  )}
                  {ct.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Class list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : selectedClasses.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted">
          {t("noClasses")}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {selectedClasses.map((cls) => (
            <EmbedClassCard
              key={cls.id}
              cls={cls}
              onOpen={() => openInParent(`/class/${cls.id}`)}
            />
          ))}
        </div>
      )}

      {/* Powered by — keeps us visible on every tenant embed */}
      <div className="mt-10 border-t border-border/40 pt-4">
        <a
          href="https://mgic.app"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-muted/60 transition-colors hover:text-muted"
        >
          <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-current">
            <Asterisk className="h-2.5 w-2.5 text-white" strokeWidth={3} />
          </span>
          {tf("developedBy")} Magic Studio
        </a>
      </div>
    </div>
  );
}

/* ── Discipline pill — matches the one in /schedule ── */
function DisciplinePill({
  name,
  iconId,
  color,
  onTap,
}: {
  name: string;
  iconId?: string | null;
  color?: string | null;
  onTap?: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  const Icon = iconId ? getIconComponent(iconId) : null;
  const pillColor = color || "#475569";
  return (
    <button
      type="button"
      onClick={onTap}
      className="inline-flex min-w-0 max-w-[180px] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-70"
      style={{
        borderColor: `${pillColor}30`,
        backgroundColor: `${pillColor}12`,
        color: pillColor,
      }}
    >
      {Icon ? (
        <Icon className="h-2.5 w-2.5 shrink-0" />
      ) : (
        <Dumbbell className="h-2.5 w-2.5 shrink-0" />
      )}
      <span className="truncate">{name}</span>
    </button>
  );
}

/* ── Class card — mirrors MobileClassCard in /schedule ── */
function EmbedClassCard({
  cls,
  onOpen,
}: {
  cls: EmbedClass;
  onOpen: () => void;
}) {
  const t = useTranslations("schedule");
  const locale = useLocale();
  const dateFnsLocale = locale === "en" ? enUS : es;
  const past = isPast(new Date(cls.startsAt));
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - cls.bookingsCount;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = cls.waitlistCount > 0;

  return (
    <button
      type="button"
      onClick={past ? undefined : onOpen}
      disabled={past}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-shadow",
        past
          ? "pointer-events-none cursor-default border-border/30 bg-surface/50 opacity-50"
          : "border-border/50 bg-card hover:shadow-md active:shadow-md",
      )}
    >
      {/* Time column */}
      <div className="w-[4.5rem] flex-shrink-0 text-center">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-muted/60">
          {format(new Date(cls.startsAt), "EEE d", { locale: dateFnsLocale })}
        </p>
        <p
          className={cn(
            "text-[13px] font-bold leading-tight",
            past ? "text-muted" : "text-foreground",
          )}
        >
          {formatTime(cls.startsAt)}
        </p>
        <p className="text-[10px] text-muted">{cls.classType.duration} min</p>
      </div>

      {/* Vertical color divider */}
      <div
        className="h-10 w-0.5 flex-shrink-0 rounded-full"
        style={{
          backgroundColor: (cls.classType.color ?? "#475569") + "40",
        }}
      />

      {/* Coach photo + info */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {cls.coach.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cls.coach.photoUrl}
            alt={cls.coach.name ?? "Coach"}
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
            {cls.coach.name?.charAt(0) || "C"}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <DisciplinePill
              name={cls.classType.name}
              iconId={cls.classType.icon}
              color={cls.classType.color}
            />
            {!past && cls.tag && (
              <span className="flex-shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
                {cls.tag}
              </span>
            )}
          </div>
          <p className="truncate text-[13px] text-muted">
            {t("with")} {cls.coach.name?.split(" ")[0]}
            {cls.room?.studio?.name && (
              <span className="text-muted/50"> · {cls.room.studio.name}</span>
            )}
          </p>
        </div>
      </div>

      {/* Right: spots / waitlist / full */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1">
        {!past && isFull ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
            {hasWaitlist ? t("waitlist") : t("full")}
          </span>
        ) : !past && spotsLeft > 0 && spotsLeft <= 3 ? (
          <span className="text-[11px] font-medium text-rose-500">
            {spotsLeft === 1
              ? t("spotSingular", { count: spotsLeft })
              : t("spotPlural", { count: spotsLeft })}
          </span>
        ) : null}
      </div>
    </button>
  );
}
