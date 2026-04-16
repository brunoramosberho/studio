"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { format, addDays, startOfDay, isSameDay, isPast } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2, Asterisk } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

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
  /** Absolute origin of the tenant site hosting /embed — used to open
   *  booking/login flows in a new tab outside the iframe. */
  tenantOrigin: string;
}

export function EmbedScheduleClient({ tenantOrigin }: EmbedScheduleClientProps) {
  const t = useTranslations("schedule");
  const tf = useTranslations("footer");
  const te = useTranslations("embed");
  const locale = useLocale();
  const dateFnsLocale = locale === "en" ? enUS : es;

  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: classes = [], isLoading } = useQuery<EmbedClass[]>({
    queryKey: ["embed-classes"],
    queryFn: async () => {
      const res = await fetch("/api/embed/classes");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const today = useMemo(() => startOfDay(new Date()), []);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(today, i)),
    [today],
  );

  const selectedClasses = useMemo(
    () =>
      classes
        .filter((c) => isSameDay(new Date(c.startsAt), selectedDay))
        .sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        ),
    [classes, selectedDay],
  );

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
  }, [isLoading, selectedDay, classes.length]);

  const openInParent = (path: string) => {
    // Break out of the iframe by opening the tenant site in a new tab.
    // The iframe itself already runs on the tenant subdomain, but host-site
    // sandboxing (e.g. restrictive iframe attributes) can block in-place
    // navigation; _blank reliably pops to the top-level browsing context.
    if (typeof window === "undefined") return;
    const url = `${tenantOrigin}${path}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const monthLabel = format(selectedDay, "MMMM", { locale: dateFnsLocale });

  return (
    <div
      ref={containerRef}
      className="embed-container mx-auto w-full max-w-[960px] px-4 pb-6 pt-5"
      style={{ colorScheme: "light" }}
    >
      {/* Title row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <h1 className="font-display text-[22px] font-bold leading-tight text-foreground">
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

      {/* Month label */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[13px] font-medium capitalize text-foreground">
          {monthLabel}
        </span>
      </div>

      {/* Day tabs */}
      <div
        className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 scrollbar-none"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {days.map((day) => {
          const active = isSameDay(day, selectedDay);
          const dayName = format(day, "EEE", { locale: dateFnsLocale })
            .charAt(0)
            .toLowerCase();
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedDay(startOfDay(day))}
              className={cn(
                "flex min-w-[44px] flex-shrink-0 flex-col items-center gap-0.5 rounded-full border border-border/60 px-2 py-1.5 transition-all",
                active
                  ? "border-transparent bg-foreground text-background"
                  : "bg-card text-foreground hover:border-foreground/30",
              )}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                {dayName}
              </span>
              <span className="text-[14px] font-bold">
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Prev/next arrows (desktop affordance) */}
      <div className="mb-3 flex items-center gap-3 text-muted">
        <button
          type="button"
          aria-label="previous day"
          onClick={() =>
            setSelectedDay((d) => {
              const prev = addDays(d, -1);
              return prev < today ? today : prev;
            })
          }
          className="rounded-full p-1 transition-colors hover:bg-surface"
          disabled={isSameDay(selectedDay, today)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="next day"
          onClick={() => setSelectedDay((d) => addDays(d, 1))}
          className="rounded-full p-1 transition-colors hover:bg-surface"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day header */}
      <h2 className="mb-1 text-[15px] font-semibold capitalize text-foreground">
        {format(selectedDay, "EEEE, MMM d", { locale: dateFnsLocale })}
      </h2>
      <p className="mb-4 text-[12px] text-muted">{te("timezoneHint")}</p>

      {/* Class list */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted" />
        </div>
      ) : selectedClasses.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t("noClasses")}</p>
      ) : (
        <ul className="space-y-4">
          {selectedClasses.map((cls) => (
            <EmbedClassRow
              key={cls.id}
              cls={cls}
              onReserve={() => openInParent(`/class/${cls.id}`)}
            />
          ))}
        </ul>
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

function EmbedClassRow({
  cls,
  onReserve,
}: {
  cls: EmbedClass;
  onReserve: () => void;
}) {
  const t = useTranslations("schedule");
  const te = useTranslations("embed");
  const past = isPast(new Date(cls.endsAt));
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - cls.bookingsCount;
  const isFull = spotsLeft <= 0;
  const coachInitial = cls.coach.name?.charAt(0) ?? "C";

  return (
    <li>
      <div className="border-b border-border/40 pb-5">
        <div className="flex items-start gap-3">
          <div className="w-[60px] flex-shrink-0 pt-0.5">
            <p className="text-[17px] font-bold leading-none text-foreground">
              {formatTime(cls.startsAt)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {cls.classType.duration} min
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold leading-tight text-foreground">
              {cls.classType.name}
            </p>
            {cls.coach.name && (
              <p className="mt-0.5 text-[13px] text-muted">
                {cls.coach.name}
              </p>
            )}

            <div className="mt-2 flex items-center gap-2">
              {cls.coach.photoUrl ? (
                <img
                  src={cls.coach.photoUrl}
                  alt={cls.coach.name ?? ""}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent">
                  {coachInitial}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-foreground/80">
                  {cls.classType.name}
                </p>
                {!past && spotsLeft > 0 && spotsLeft <= 3 && (
                  <p
                    className="text-[12px] font-medium italic"
                    style={{ color: cls.classType.color ?? "#FF5A2C" }}
                  >
                    {spotsLeft === 1
                      ? te("onlyOneSpot")
                      : te("onlyNSpots", { n: spotsLeft })}
                  </p>
                )}
                {past && (
                  <p className="text-[12px] text-muted">{te("finished")}</p>
                )}
              </div>
            </div>

            <div className="mt-3">
              <button
                type="button"
                onClick={onReserve}
                disabled={past}
                className={cn(
                  "w-full rounded-full py-3 text-[14px] font-semibold transition-colors",
                  past
                    ? "cursor-not-allowed bg-surface text-muted"
                    : isFull
                      ? "bg-foreground/80 text-background hover:bg-foreground"
                      : "bg-foreground text-background hover:bg-foreground/90",
                )}
              >
                {past
                  ? te("finished")
                  : isFull
                    ? t("waitlist")
                    : te("reserve")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
