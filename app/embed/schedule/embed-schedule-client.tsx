"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
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
import { Asterisk, ChevronDown, Dumbbell, Loader2, Ticket } from "lucide-react";
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
  /** Number of days to show, matching the tenant's /schedule visibility
   *  window (rolling N days or weekly release). Defaults to 7. */
  visibleDays?: number;
}

export function EmbedScheduleClient({
  tenantOrigin,
  visibleDays = 7,
}: EmbedScheduleClientProps) {
  const t = useTranslations("schedule");
  const tf = useTranslations("footer");
  const te = useTranslations("embed");
  const locale = useLocale();
  const dateFnsLocale = locale === "en" ? enUS : es;

  const containerRef = useRef<HTMLDivElement>(null);
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDay, setSelectedDay] = useState(today);
  const [filterTypes, setFilterTypes] = useState<Set<string>>(new Set());
  const [filterCoaches, setFilterCoaches] = useState<Set<string>>(new Set());

  const toggleType = useCallback((id: string) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCoach = useCallback((id: string) => {
    setFilterCoaches((prev) => {
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
    () =>
      Array.from({ length: Math.max(1, visibleDays) }, (_, i) =>
        addDays(today, i),
      ),
    [today, visibleDays],
  );

  const classTypes = useMemo(
    () =>
      Array.from(
        new Map(classes.map((c) => [c.classType.id, c.classType])).values(),
      ),
    [classes],
  );

  const coaches = useMemo(
    () =>
      Array.from(new Map(classes.map((c) => [c.coach.id, c.coach])).values()),
    [classes],
  );

  const getClassesForDay = useCallback(
    (day: Date) =>
      classes
        .filter((c) => isSameDay(new Date(c.startsAt), day))
        .filter((c) => filterTypes.size === 0 || filterTypes.has(c.classType.id))
        .filter((c) => filterCoaches.size === 0 || filterCoaches.has(c.coach.id))
        .sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        ),
    [classes, filterTypes, filterCoaches],
  );

  // Continuous list from the selected day onwards (mirrors /schedule): keep
  // leading/interior empty days as "rest day" dividers, but trim trailing empty
  // days so the list ends on the last day that actually has classes. This makes
  // the embed match the tenant's own /schedule instead of showing a bare "no
  // classes" when the selected day happens to be empty.
  const mobileDays = useMemo(() => {
    const idx = days.findIndex((d) => isSameDay(d, selectedDay));
    const remaining = idx >= 0 ? days.slice(idx) : days;
    const withClasses = remaining.map((day) => ({
      day,
      classes: getClassesForDay(day),
    }));
    let lastWithClasses = -1;
    for (let i = withClasses.length - 1; i >= 0; i--) {
      if (withClasses[i].classes.length > 0) {
        lastWithClasses = i;
        break;
      }
    }
    if (lastWithClasses === -1) return [];
    return withClasses.slice(0, lastWithClasses + 1);
  }, [selectedDay, days, getClassesForDay]);

  // The global app CSS sets `overscroll-behavior-y: none` on <html>/<body> to
  // kill iOS rubber-band in the PWA. Inside the embed iframe that backfires:
  // the host page auto-resizes the iframe to fit the content (see the resize
  // emitter below), so the iframe has no scroll room of its own, and `none`
  // then blocks the wheel from chaining to the host page — scrolling "sticks"
  // whenever the cursor is over the widget. Restore default scroll chaining.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overscrollBehaviorY;
    const prevBody = body.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "auto";
    body.style.overscrollBehaviorY = "auto";
    return () => {
      html.style.overscrollBehaviorY = prevHtml;
      body.style.overscrollBehaviorY = prevBody;
    };
  }, []);

  // Desktop wheel fix: a cross-origin iframe that's been auto-resized to its
  // content height (see the resize emitter below) has no scroll room of its
  // own, and the browser won't chain wheel events from a cross-origin frame to
  // the host page — so scrolling "sticks" whenever the cursor is over the
  // widget. (Touch on mobile chains fine, which is why it only bites desktop.)
  // Forward the wheel delta to the host loader, which scrolls the host page.
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const onWheel = (e: WheelEvent) => {
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16; // lines → px
      else if (e.deltaMode === 2) dy *= window.innerHeight; // pages → px
      window.parent.postMessage(
        { type: "magicstudio:embed:wheel", deltaY: dy },
        "*",
      );
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

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
  }, [isLoading, selectedDay, classes.length, filterTypes, filterCoaches]);

  const openInParent = useCallback(
    (path: string) => {
      if (typeof window === "undefined") return;
      const url = `${tenantOrigin}${path}`;

      // Not embedded (viewing the embed page directly) — just navigate.
      if (window.parent === window) {
        window.location.href = url;
        return;
      }

      // Embedded: ask the host loader to navigate its OWN (first-party) page to
      // the class. One tab, booking works (first-party cookies), and the
      // browser's native Back returns to the host on every platform — which the
      // new-tab + window.close() trick can't do (iOS Safari blocks closing tabs).
      window.parent.postMessage({ type: "magicstudio:embed:navigate", url }, "*");

      // Hosts on a hand-rolled static iframe (no loader to act on that message)
      // won't navigate, so if we're still alive a beat later, fall back to a new
      // tab. On success the host unloads and clears this timer first.
      window.setTimeout(() => {
        window.open(url, "_blank");
      }, 400);
    },
    [tenantOrigin],
  );

  const disciplinePills =
    classTypes.length > 0 ? (
      <div
        className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:px-0"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex items-center gap-1.5 lg:gap-2">
          {classTypes.map((ct) => {
            const active = filterTypes.has(ct.id);
            const Icon = ct.icon ? getIconComponent(ct.icon) : null;
            return (
              <button
                key={ct.id}
                onClick={() => toggleType(ct.id)}
                className={cn(
                  "flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all lg:px-3 lg:py-1.5 lg:text-xs",
                  active
                    ? "border-transparent text-white"
                    : "border-border bg-card text-foreground hover:bg-muted/30",
                )}
                style={
                  active && ct.color ? { backgroundColor: ct.color } : undefined
                }
              >
                {Icon ? (
                  <Icon className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                ) : (
                  <Dumbbell className="h-3 w-3 lg:h-3.5 lg:w-3.5" />
                )}
                {ct.name}
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  const coachStrip =
    coaches.length > 0 ? (
      <div
        className="-mx-4 mb-4 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:px-0"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="flex gap-4 lg:gap-5">
          {coaches.map((c) => {
            const active = filterCoaches.has(c.id);
            const firstName = c.name?.split(" ")[0] || "Coach";
            return (
              <button
                key={c.id}
                onClick={() => toggleCoach(c.id)}
                className="flex flex-shrink-0 flex-col items-center gap-1 lg:gap-1.5"
              >
                <div
                  className={cn(
                    "overflow-hidden rounded-full border-2 transition-all",
                    "h-12 w-12 lg:h-12 lg:w-12",
                    active
                      ? "border-foreground ring-2 ring-foreground/20"
                      : "border-transparent hover:border-foreground/20",
                  )}
                >
                  {c.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.photoUrl}
                      alt={firstName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-accent/20 text-sm font-bold text-accent">
                      {firstName.charAt(0)}
                    </div>
                  )}
                </div>
                <span
                  className={cn(
                    "max-w-[56px] truncate text-[11px] font-medium",
                    active ? "text-foreground" : "text-muted",
                  )}
                >
                  {firstName}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-[1200px] px-4 pb-8 pt-5"
    >
      {/* Title row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="font-display text-xl font-bold leading-tight text-foreground lg:text-[1.75rem]">
          {te("title")}
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => openInParent("/packages")}
            className="flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-[12px] font-semibold text-accent transition-opacity hover:opacity-80"
          >
            <Ticket className="h-3.5 w-3.5" />
            {te("viewPackages")}
          </button>
          <button
            type="button"
            onClick={() => openInParent("/login")}
            className="text-[13px] font-medium text-accent transition-opacity hover:opacity-80"
          >
            {te("myAccount")}
          </button>
        </div>
      </div>

      {/* ── Mobile / narrow layout ── */}
      <div className="lg:hidden">
        {/* Day tabs — horizontal scroll */}
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

        {/* Coach avatar strip */}
        {coachStrip}

        {/* Discipline pills */}
        {disciplinePills}

        {/* Continuous class list from the selected day onwards — mirrors the
            tenant's /schedule, with empty days shown as "rest day" dividers. */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : mobileDays.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
            {t("noClasses")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {mobileDays.map(({ day, classes: dayClasses }, groupIdx) => {
              const dayLabel = isToday(day)
                ? t("today")
                : format(day, "EEEE d", { locale: dateFnsLocale });

              // Empty day → "rest day" divider so it's clear there are simply
              // no classes that day (vs. the list being broken/incomplete).
              if (dayClasses.length === 0) {
                return (
                  <div
                    key={day.toISOString()}
                    className="flex items-center gap-3 py-2.5"
                  >
                    <div className="h-px flex-1 bg-border/40" />
                    <span className="text-[12px] font-medium text-muted/70">
                      <span className="capitalize">{dayLabel}</span>
                      {" · "}
                      {t("noClassesDay")}
                    </span>
                    <div className="h-px flex-1 bg-border/40" />
                  </div>
                );
              }

              return (
                <div key={day.toISOString()}>
                  {/* Day separator (skip for the first group — its cards
                      already show the weekday in the time column). */}
                  {groupIdx > 0 && (
                    <div className="flex items-center gap-3 pb-2 pt-4">
                      <div className="h-px flex-1 bg-border/60" />
                      <span className="text-[12px] font-medium text-muted capitalize">
                        {dayLabel}
                      </span>
                      <div className="h-px flex-1 bg-border/60" />
                    </div>
                  )}
                  <CollapsiblePastClasses
                    classes={dayClasses}
                    onOpen={(cls) => openInParent(`/class/${cls.id}`)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Desktop layout — full week grid ── */}
      <div className="hidden lg:block">
        {/* Discipline pills */}
        {disciplinePills && <div className="mb-5">{disciplinePills}</div>}

        {/* Coach avatar strip */}
        {coachStrip && <div className="mb-5">{coachStrip}</div>}

        {/* Day headers */}
        <div className="mb-3 grid grid-cols-7 gap-2">
          {days.map((day) => {
            const todayMarker = isToday(day);
            return (
              <div key={day.toISOString()} className="text-center">
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wider",
                    todayMarker ? "text-foreground" : "text-muted",
                  )}
                >
                  {todayMarker && "● "}
                  {format(day, "EEE", { locale: dateFnsLocale })}{" "}
                  {format(day, "d")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Class columns */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-7 items-start gap-2">
            {days.map((day) => (
              <DesktopDayColumn
                key={day.toISOString()}
                classes={getClassesForDay(day)}
                onOpen={(cls) => openInParent(`/class/${cls.id}`)}
              />
            ))}
          </div>
        )}
      </div>

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

/* ── Collapsible past-classes wrapper for mobile ── */
function CollapsiblePastClasses({
  classes,
  onOpen,
}: {
  classes: EmbedClass[];
  onOpen: (cls: EmbedClass) => void;
}) {
  const t = useTranslations("schedule");
  const pastClasses = classes.filter((c) => isPast(new Date(c.startsAt)));
  const upcomingClasses = classes.filter((c) => !isPast(new Date(c.startsAt)));
  const [showPast, setShowPast] = useState(false);

  if (pastClasses.length === 0 || upcomingClasses.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {classes.map((cls) => (
          <EmbedClassCard
            key={cls.id}
            cls={cls}
            onOpen={() => onOpen(cls)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {showPast &&
        pastClasses.map((cls) => (
          <EmbedClassCard
            key={cls.id}
            cls={cls}
            onOpen={() => onOpen(cls)}
          />
        ))}
      <button
        onClick={() => setShowPast((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-medium text-muted transition-colors active:bg-surface"
      >
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            showPast && "rotate-180",
          )}
        />
        {showPast
          ? t("hidePast")
          : pastClasses.length > 1
            ? t("pastClassesPlural", { count: pastClasses.length })
            : t("pastClasses", { count: pastClasses.length })}
      </button>
      {upcomingClasses.map((cls) => (
        <EmbedClassCard key={cls.id} cls={cls} onOpen={() => onOpen(cls)} />
      ))}
    </div>
  );
}

/* ── Desktop day column — stacks DesktopClassCards with collapsible past ── */
function DesktopDayColumn({
  classes,
  onOpen,
}: {
  classes: EmbedClass[];
  onOpen: (cls: EmbedClass) => void;
}) {
  const t = useTranslations("schedule");
  const pastClasses = classes.filter((c) => isPast(new Date(c.startsAt)));
  const upcomingClasses = classes.filter((c) => !isPast(new Date(c.startsAt)));
  const [showPast, setShowPast] = useState(false);

  if (pastClasses.length === 0 || upcomingClasses.length === 0) {
    return (
      <div className="space-y-2">
        {classes.map((cls) => (
          <DesktopClassCard key={cls.id} cls={cls} onOpen={() => onOpen(cls)} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showPast &&
        pastClasses.map((cls) => (
          <DesktopClassCard
            key={cls.id}
            cls={cls}
            onOpen={() => onOpen(cls)}
          />
        ))}
      <button
        onClick={() => setShowPast((v) => !v)}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-border/60 py-1.5 text-[10px] font-medium text-muted transition-colors hover:bg-surface/60"
      >
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            showPast && "rotate-180",
          )}
        />
        {showPast
          ? t("hideDesktop")
          : pastClasses.length > 1
            ? t("pastDesktopPlural", { count: pastClasses.length })
            : t("pastDesktop", { count: pastClasses.length })}
      </button>
      {upcomingClasses.map((cls) => (
        <DesktopClassCard key={cls.id} cls={cls} onOpen={() => onOpen(cls)} />
      ))}
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

/* ── Mobile class card — mirrors MobileClassCard in /schedule ── */
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
    <div
      role="button"
      tabIndex={past ? -1 : 0}
      aria-disabled={past}
      onClick={past ? undefined : onOpen}
      onKeyDown={(e) => {
        if (past) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-shadow",
        past
          ? "pointer-events-none cursor-default border-border/30 bg-surface/50 opacity-50"
          : "cursor-pointer border-border/50 bg-card hover:shadow-md active:shadow-md",
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
    </div>
  );
}

/* ── Desktop class card — compact vertical card inside a day column ── */
function DesktopClassCard({
  cls,
  onOpen,
}: {
  cls: EmbedClass;
  onOpen: () => void;
}) {
  const t = useTranslations("schedule");
  const past = isPast(new Date(cls.startsAt));
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - cls.bookingsCount;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = cls.waitlistCount > 0;

  return (
    <div
      role="button"
      tabIndex={past ? -1 : 0}
      aria-disabled={past}
      onClick={past ? undefined : onOpen}
      onKeyDown={(e) => {
        if (past) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "flex h-[155px] w-full flex-col justify-between rounded-2xl border px-4 py-3.5 text-left transition-shadow",
        past
          ? "pointer-events-none cursor-default border-border/30 bg-surface/60"
          : "cursor-pointer border-border/70 bg-card hover:shadow-md",
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
        <div
          className={cn(
            "mt-1.5 flex flex-wrap items-center gap-1",
            past && "opacity-50",
          )}
        >
          <DisciplinePill
            name={cls.classType.name}
            iconId={cls.classType.icon}
            color={cls.classType.color}
          />
          {!past && cls.tag && (
            <span className="inline-block rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold text-white">
              {cls.tag}
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-1.5">
          {cls.coach.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cls.coach.photoUrl}
              alt={cls.coach.name ?? "Coach"}
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
              {cls.coach.name?.charAt(0) || "C"}
            </div>
          )}
          <p
            className={cn(
              "truncate text-[12px]",
              past ? "text-muted/40" : "text-muted",
            )}
          >
            {cls.coach.name?.split(" ")[0]}
          </p>
        </div>
        {cls.room?.studio?.name && (
          <p
            className={cn(
              "mt-0.5 truncate text-[10px]",
              past ? "text-muted/30" : "text-muted/50",
            )}
          >
            {cls.room.studio.name}
          </p>
        )}
      </div>
      {!past && isFull ? (
        <span className="self-start rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">
          {hasWaitlist ? t("waitlist") : t("full")}
        </span>
      ) : !past && spotsLeft > 0 && spotsLeft <= 3 ? (
        <span className="text-[10px] font-medium text-rose-500">
          {spotsLeft === 1
            ? t("spotSingular", { count: spotsLeft })
            : t("spotPlural", { count: spotsLeft })}
        </span>
      ) : null}
    </div>
  );
}
