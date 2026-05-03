"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, MapPin } from "lucide-react";
import { format, addDays, subDays, isToday, isTomorrow, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { ClassRoster } from "@/components/check-in/ClassRoster";
import { SectionTabs } from "@/components/admin/section-tabs";
import { CHECK_IN_TABS } from "@/components/admin/section-tab-configs";

interface ClassItem {
  id: string;
  className: string;
  classColor: string;
  classIcon: string | null;
  startTime: string;
  endTime: string;
  coachName: string | null;
  coachImage: string | null;
  room: string;
  studioId: string;
  studioName: string;
  capacity: number;
  enrolledCount: number;
  checkedInCount: number;
  waitlistCount: number;
  isLive: boolean;
  isFinished: boolean;
}

function formatDateLabel(date: Date, td: (key: string) => string): string {
  if (isToday(date)) return td("today");
  if (isTomorrow(date)) return td("tomorrow");
  if (isYesterday(date)) return td("yesterday");
  return format(date, "EEE d MMM", { locale: es });
}

function formatHeaderDate(date: Date, td: (key: string) => string): string {
  const label = formatDateLabel(date, td);
  const full = format(date, "EEEE, d 'de' MMMM", { locale: es });
  if (isToday(date) || isTomorrow(date) || isYesterday(date)) {
    return `${label} · ${full.charAt(0).toUpperCase() + full.slice(1)}`;
  }
  return full.charAt(0).toUpperCase() + full.slice(1);
}

export default function CheckInPage() {
  const t = useTranslations("admin");
  const td = useTranslations("dates");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [filterStudioId, setFilterStudioId] = useState<string>("all");
  const [showMobileRoster, setShowMobileRoster] = useState(false);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const isPastDate = !isToday(selectedDate) && selectedDate < new Date();

  const { data: allClasses = [], isLoading } = useQuery<ClassItem[]>({
    queryKey: ["check-in-classes", dateStr],
    queryFn: () => fetch(`/api/check-in/classes?date=${dateStr}`).then((r) => r.json()),
  });

  // Derive unique studios from classes
  const studios = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of allClasses) map.set(c.studioId, c.studioName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [allClasses]);

  const hasMultipleStudios = studios.length > 1;

  // Filter classes by studio
  const classes = useMemo(
    () => filterStudioId === "all" ? allClasses : allClasses.filter((c) => c.studioId === filterStudioId),
    [allClasses, filterStudioId],
  );

  // Split into active (live + upcoming) and finished
  const { activeClasses, finishedClasses } = useMemo(() => {
    const active: ClassItem[] = [];
    const finished: ClassItem[] = [];
    for (const c of classes) {
      if (c.isFinished) finished.push(c);
      else active.push(c);
    }
    return { activeClasses: active, finishedClasses: finished };
  }, [classes]);

  const [showFinished, setShowFinished] = useState(false);

  // Auto-select: live class first, then next upcoming, then first class
  useEffect(() => {
    if (classes.length === 0) {
      setSelectedClassId(null);
      return;
    }
    const live = classes.find((c) => c.isLive);
    if (live) {
      setSelectedClassId(live.id);
      return;
    }
    const upcoming = classes.find((c) => !c.isFinished);
    if (upcoming) {
      setSelectedClassId(upcoming.id);
      return;
    }
    // All finished (past day) — select the most recent one
    setSelectedClassId(classes[classes.length - 1].id);
    setShowFinished(true);
  }, [classes]);

  useEffect(() => {
    setShowMobileRoster(false);
  }, [dateStr]);

  const handleSelectClass = useCallback((classId: string) => {
    setSelectedClassId(classId);
    setShowMobileRoster(true);
  }, []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const occupancyPill = (c: ClassItem) => {
    const pct = c.capacity > 0 ? c.enrolledCount / c.capacity : 0;
    if (c.enrolledCount >= c.capacity) return { label: `${c.enrolledCount}/${c.capacity}`, className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
    if (pct > 0.8) return { label: `${c.enrolledCount}/${c.capacity}`, className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
    return { label: `${c.enrolledCount}/${c.capacity}`, className: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" };
  };

  return (
    <div className="space-y-3 md:space-y-4">
      <SectionTabs tabs={CHECK_IN_TABS} ariaLabel="Check-in sections" />
      {/* Page header — hidden on mobile when viewing roster */}
      <div className={cn(showMobileRoster && "hidden md:block")}>
        <h1 className="text-xl font-semibold text-stone-900 dark:text-foreground">{t("checkIn")}</h1>
        <p className="text-xs text-stone-400 dark:text-muted mt-0.5">
          {t("checkInSubtitle")}
        </p>
      </div>

      {/* Date nav + studio filter — hidden on mobile when viewing roster */}
      <div className={cn(
        "flex items-center justify-between gap-2 flex-wrap",
        showMobileRoster && "hidden md:flex",
      )}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setSelectedDate((d) => subDays(d, 1))}
            className="p-1.5 rounded-lg border border-stone-200 dark:border-border hover:bg-stone-50 dark:hover:bg-surface/60 text-stone-500 dark:text-muted"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-lg border transition-colors",
              isToday(selectedDate)
                ? "bg-admin text-white border-admin"
                : "border-stone-200 dark:border-border text-stone-600 dark:text-muted hover:bg-stone-50 dark:hover:bg-surface/60 dark:border-border dark:text-muted dark:hover:bg-surface",
            )}
          >
            {td("today")}
          </button>
          <span className="text-xs sm:text-sm font-medium text-stone-700 dark:text-foreground truncate max-w-[160px] sm:max-w-none">
            {formatHeaderDate(selectedDate, td)}
          </span>
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="p-1.5 rounded-lg border border-stone-200 dark:border-border hover:bg-stone-50 dark:hover:bg-surface/60 text-stone-500 dark:text-muted dark:border-border dark:hover:bg-surface dark:text-muted"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {hasMultipleStudios && (
          <div className="flex items-center gap-1.5">
            <MapPin size={14} className="text-stone-400 dark:text-muted" />
            <select
              value={filterStudioId}
              onChange={(e) => setFilterStudioId(e.target.value)}
              className="appearance-none bg-card border border-stone-200 dark:border-border rounded-lg px-2.5 py-1 text-xs text-stone-700 dark:text-foreground focus:outline-none focus:ring-1 focus:ring-admin focus:border-admin cursor-pointer"
            >
              <option value="all">{t("allStudios")}</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main layout: stacked on mobile (drill-down), side-by-side on desktop */}
      <div className="flex flex-col md:grid md:grid-cols-[260px_1fr] gap-3 h-[calc(100dvh-160px)] md:h-[calc(100vh-200px)]">
        {/* Left: class list — hidden on mobile when viewing roster */}
        <div className={cn(
          "bg-card border border-stone-200 dark:border-border rounded-2xl overflow-hidden flex-col h-full",
          showMobileRoster ? "hidden md:flex" : "flex",
        )}>
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-stone-100 dark:border-border/60">
            <span className="text-xs font-medium text-stone-900 dark:text-foreground">
              {isPastDate ? t("dayClasses") : t("todayClasses")}
            </span>
            <span className="text-xs text-stone-400 dark:text-muted">
              {format(selectedDate, "EEE d MMM", { locale: es })}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-stone-300 dark:text-muted/70" size={20} />
              </div>
            ) : classes.length === 0 ? (
              <div className="text-center py-12 text-xs text-stone-400 dark:text-muted">
                {t("noClassesScheduled")}
              </div>
            ) : (
              <>
                {finishedClasses.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowFinished((v) => !v)}
                      className="flex w-full items-center gap-2 border-b border-stone-100 dark:border-border/60 bg-stone-50/60 dark:bg-surface/60 px-3.5 py-2 text-left dark:border-border/60 dark:bg-surface/60"
                    >
                      <ChevronDown
                        size={14}
                        className={cn(
                          "text-stone-400 dark:text-muted transition-transform",
                          !showFinished && "-rotate-90",
                        )}
                      />
                      <span className="flex-1 text-[11px] font-medium text-stone-500 dark:text-muted">
                        {t("finishedClasses")} ({finishedClasses.length})
                      </span>
                      {!showFinished && finishedClasses.some((c) => c.enrolledCount > c.checkedInCount) && (
                        <span className="text-[10px] rounded-full bg-amber-50 px-1.5 py-0.5 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                          {t("noCheckInLabel")}
                        </span>
                      )}
                    </button>
                    {showFinished &&
                      finishedClasses.map((c) => (
                        <ClassListItem
                          key={c.id}
                          item={c}
                          isSelected={c.id === selectedClassId}
                          occupancy={occupancyPill(c)}
                          onSelect={() => handleSelectClass(c.id)}
                        />
                      ))}
                  </>
                )}

                {activeClasses.map((c) => (
                  <ClassListItem
                    key={c.id}
                    item={c}
                    isSelected={c.id === selectedClassId}
                    occupancy={occupancyPill(c)}
                    onSelect={() => handleSelectClass(c.id)}
                  />
                ))}
              </>
            )}
          </div>
        </div>

        {/* Right: roster — hidden on mobile when viewing class list */}
        <div className={cn(
          "bg-card border border-stone-200 dark:border-border rounded-2xl overflow-hidden relative flex-col h-full",
          showMobileRoster ? "flex" : "hidden md:flex",
        )}>
          {/* Mobile back button */}
          <button
            onClick={() => setShowMobileRoster(false)}
            className="md:hidden flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-stone-500 dark:text-muted border-b border-stone-100 dark:border-border/60 active:bg-stone-50 shrink-0"
          >
            <ChevronLeft size={14} />
            {selectedClass
              ? `${format(new Date(selectedClass.startTime), "HH:mm")} · ${selectedClass.className}`
              : t("backToClasses")}
          </button>

          {selectedClass ? (
            <div className="flex-1 min-h-0">
              <ClassRoster
                classId={selectedClass.id}
                classInfo={{
                  className: selectedClass.className,
                  startTime: selectedClass.startTime,
                  endTime: selectedClass.endTime,
                  coachName: selectedClass.coachName,
                  room: selectedClass.room,
                  capacity: selectedClass.capacity,
                  enrolledCount: selectedClass.enrolledCount,
                  isFinished: selectedClass.isFinished || isPastDate,
                }}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-stone-400 dark:text-muted">
              {isLoading ? (
                <Loader2 className="animate-spin text-stone-300 dark:text-muted/70" size={20} />
              ) : (
                t("selectClassRoster")
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClassListItem({
  item: c,
  isSelected,
  occupancy: pill,
  onSelect,
}: {
  item: ClassItem;
  isSelected: boolean;
  occupancy: { label: string; className: string };
  onSelect: () => void;
}) {
  const t = useTranslations("admin");
  const unchecked = c.isFinished && c.enrolledCount > c.checkedInCount;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3.5 py-2.5 border-b border-stone-50 dark:border-border/40 transition-colors dark:border-border/40",
        isSelected
          ? "border-l-[3px] border-l-admin bg-admin/10 dark:bg-admin/15"
          : "border-l-[3px] border-l-transparent hover:bg-stone-50 dark:hover:bg-surface/60",
        c.isFinished && !isSelected && "opacity-70",
      )}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[11px] text-stone-500 dark:text-muted">
          {format(new Date(c.startTime), "HH:mm")} – {format(new Date(c.endTime), "HH:mm")}
        </span>
        {c.isLive && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-red-500 dark:text-red-400">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            {t("inProgressLabel")}
          </span>
        )}
        {c.isFinished && (
          <span className="text-[10px] text-stone-400 dark:text-muted">{t("finishedLabel")}</span>
        )}
      </div>
      <p className="text-[13px] font-medium text-stone-900 dark:text-foreground truncate">
        {c.className}
      </p>
      <p className="text-xs text-stone-500 dark:text-muted truncate">{c.coachName}</p>
      <div className="flex gap-1.5 mt-1">
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", pill.className)}>
          {pill.label}
        </span>
        {c.checkedInCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            ✓ {c.checkedInCount}
          </span>
        )}
        {unchecked && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
            {t("withoutCheckIn", { count: c.enrolledCount - c.checkedInCount })}
          </span>
        )}
        {c.waitlistCount > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
            {t("onWaitlistCount", { count: c.waitlistCount })}
          </span>
        )}
      </div>
    </button>
  );
}
