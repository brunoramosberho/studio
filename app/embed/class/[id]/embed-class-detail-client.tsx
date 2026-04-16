"use client";

import { useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { format } from "date-fns";
import { es, enUS } from "date-fns/locale";
import {
  AlertCircle,
  Asterisk,
  ChevronLeft,
  Clock,
  Dumbbell,
  ExternalLink,
  Loader2,
  MapPin,
  Users,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { getIconComponent } from "@/components/admin/icon-picker";

interface EmbedClassDetail {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  tag: string | null;
  notes: string | null;
  classType: {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    level: string;
    duration: number;
    tags: string[];
  };
  room: {
    id: string;
    name: string;
    maxCapacity: number;
    studio: {
      id: string;
      name: string;
      address: string | null;
    } | null;
  } | null;
  coach: {
    id: string;
    userId: string;
    name: string | null;
    photoUrl: string | null;
    bio: string | null;
    specialties: string[];
  };
  bookingsCount: number;
  waitlistCount: number;
}

interface Props {
  classId: string;
  /** Absolute origin of the tenant site — used to open the booking
   *  and login flows in a new tab outside the iframe. */
  tenantOrigin: string;
}

export function EmbedClassDetailClient({ classId, tenantOrigin }: Props) {
  const t = useTranslations("schedule");
  const tc = useTranslations("classDetail");
  const te = useTranslations("embed");
  const tf = useTranslations("footer");
  const locale = useLocale();
  const dateFnsLocale = locale === "en" ? enUS : es;

  const containerRef = useRef<HTMLDivElement>(null);

  const {
    data: cls,
    isLoading,
    error,
  } = useQuery<EmbedClassDetail>({
    queryKey: ["embed-class", classId],
    queryFn: async () => {
      const res = await fetch(`/api/embed/classes/${classId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  // Resize the host iframe as the content height changes.
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
  }, [isLoading, cls]);

  const openInParent = useCallback(
    (path: string) => {
      if (typeof window === "undefined") return;
      const url = `${tenantOrigin}${path}`;
      window.open(url, "_blank", "noopener,noreferrer");
    },
    [tenantOrigin],
  );

  if (isLoading) {
    return (
      <div
        ref={containerRef}
        className="flex min-h-[360px] items-center justify-center"
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (error || !cls) {
    return (
      <div
        ref={containerRef}
        className="mx-auto flex w-full max-w-[640px] flex-col items-center px-4 py-16 text-center"
      >
        <AlertCircle className="h-10 w-10 text-muted/40" />
        <h1 className="mt-3 font-display text-lg font-bold text-foreground">
          {tc("classNotFound")}
        </h1>
        <p className="mt-1 text-sm text-muted">{tc("classNotFoundDesc")}</p>
        <Link
          href="/embed/schedule"
          className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-border/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface"
        >
          <ChevronLeft className="h-4 w-4" />
          {tc("viewSchedule")}
        </Link>
      </div>
    );
  }

  const Icon = cls.classType.icon
    ? getIconComponent(cls.classType.icon)
    : null;
  const pillColor = cls.classType.color ?? "#475569";
  const isCancelled = cls.status === "CANCELLED";
  const isPast = new Date(cls.endsAt) < new Date();
  const maxCap = cls.room?.maxCapacity ?? 0;
  const spotsLeft = maxCap - cls.bookingsCount;
  const isFull = spotsLeft <= 0;
  const hasWaitlist = cls.waitlistCount > 0;

  return (
    <div
      ref={containerRef}
      className="mx-auto w-full max-w-[640px] px-4 pb-8 pt-5"
    >
      {/* Back + external link */}
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/embed/schedule"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-surface"
          aria-label={tc("viewSchedule")}
        >
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </Link>
        <button
          type="button"
          onClick={() => openInParent("/login")}
          className="shrink-0 text-[13px] font-medium text-accent transition-opacity hover:opacity-80"
        >
          {te("myAccount")}
        </button>
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mb-4 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              {tc("classCancelledTitle")}
            </p>
            <p className="text-xs text-red-600">{tc("classCancelledDesc")}</p>
          </div>
        </div>
      )}

      {/* Title + coach */}
      <div className="flex items-center gap-3">
        {cls.coach.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cls.coach.photoUrl}
            alt={cls.coach.name ?? "Coach"}
            className="h-11 w-11 flex-shrink-0 rounded-full object-cover ring-2 ring-accent/20"
          />
        )}
        <h1 className="font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
          {cls.classType.name}
          {cls.coach.name && (
            <span className="font-normal text-muted">
              {tc("with")}
              {cls.coach.name}
            </span>
          )}
        </h1>
      </div>

      {/* Date + time strip */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
          style={{
            borderColor: `${pillColor}30`,
            backgroundColor: `${pillColor}12`,
            color: pillColor,
          }}
        >
          {Icon ? (
            <Icon className="h-2.5 w-2.5" />
          ) : (
            <Dumbbell className="h-2.5 w-2.5" />
          )}
          {cls.classType.name}
        </span>
        {cls.tag && (
          <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {cls.tag}
          </span>
        )}
        <span className="ml-auto text-[12px] font-medium uppercase tracking-wide text-muted">
          {format(new Date(cls.startsAt), "EEE d LLL", {
            locale: dateFnsLocale,
          })}{" "}
          · {formatTime(cls.startsAt)}
        </span>
      </div>

      {/* Studio + capacity */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted/80">
        {cls.room?.studio && (
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3" />
            <span>
              {cls.room.studio.name} · {cls.room.name}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          <span>{cls.classType.duration} min</span>
        </div>
        {!isPast && !isCancelled && (
          <div
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
              isFull
                ? "bg-red-50 text-red-600"
                : spotsLeft <= 3
                  ? "bg-orange-50 text-orange-600"
                  : "bg-surface text-muted",
            )}
          >
            <Users className="h-3 w-3" />
            {isFull
              ? hasWaitlist
                ? t("waitlist")
                : t("full")
              : `${cls.bookingsCount}/${maxCap}`}
          </div>
        )}
      </div>

      <div className="my-5 h-px bg-border/50" />

      {/* Description / notes */}
      {cls.classType.description && (
        <div className="mb-5">
          <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground/85">
            {cls.classType.description}
          </p>
        </div>
      )}

      {/* Coach block */}
      {(cls.coach.bio || cls.coach.specialties?.length > 0) && (
        <div className="mb-6 rounded-2xl border border-border/50 bg-card px-4 py-4">
          <div className="flex items-start gap-3">
            {cls.coach.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cls.coach.photoUrl}
                alt={cls.coach.name ?? "Coach"}
                className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-foreground">
                {cls.coach.name}
              </p>
              {cls.coach.specialties.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {cls.coach.specialties.slice(0, 4).map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium text-muted"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {cls.coach.bio && (
                <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted">
                  {cls.coach.bio}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary CTA — pops out to the tenant site for the real booking flow.
          Cookies and payment can't be trusted inside a third-party iframe,
          so the reserve / login step always happens in a top-level tab. */}
      <div className="mb-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => openInParent(`/class/${cls.id}`)}
          disabled={isPast || isCancelled}
          className={cn(
            "inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors",
            isPast || isCancelled
              ? "cursor-not-allowed bg-surface text-muted"
              : isFull
                ? "bg-foreground/80 text-background hover:bg-foreground"
                : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          <ExternalLink className="h-4 w-4" />
          {isPast
            ? tc("classFinished")
            : isCancelled
              ? tc("classCancelledTitle")
              : isFull
                ? hasWaitlist
                  ? t("waitlist")
                  : t("full")
                : te("reserveExternal")}
        </button>
        <p className="text-center text-[11px] text-muted/70">
          {te("reserveExternalHint")}
        </p>
      </div>

      {/* Powered by — consistent with /embed/schedule */}
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
