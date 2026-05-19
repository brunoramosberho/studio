"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import type { Locale } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SLOT_MINUTES } from "@/lib/availability";
import { getDateFnsLocale } from "@/lib/date-locale";

const DAY_LABELS_SHORT = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

const REASON_COLOR: Record<string, string> = {
  vacation: "bg-violet-500",
  personal: "bg-sky-500",
  training: "bg-amber-500",
  other: "bg-stone-400",
};

const REASON_BG: Record<string, string> = {
  vacation: "bg-violet-500/80",
  personal: "bg-sky-500/80",
  training: "bg-amber-500/80",
  other: "bg-stone-400/80",
};

export interface CalendarBlock {
  id: string;
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reasonType: "vacation" | "personal" | "training" | "other" | null;
  reasonNote: string | null;
  status: "active" | "pending_approval" | "rejected";
}

interface TimeOffCalendarProps {
  blocks: CalendarBlock[];
  /**
   * Called when the coach wants to create new time-off.
   * - Month view, single day: `endDate` omitted → modal opens as all-day for that date.
   * - Month view, range: `endDate` set → modal opens spanning [startDate, endDate], all-day.
   * - Month view, same-day re-tap: `withHours=true` → modal opens with isAllDay=false.
   * - Week view: `startMin`/`endMin` set → modal opens with that specific time range.
   */
  onAddForDate: (args: {
    startDate: Date;
    endDate?: Date;
    startMin?: number;
    endMin?: number;
    withHours?: boolean;
  }) => void;
  onEditBlock: (block: CalendarBlock) => void;
  /** Tenant window — used to clamp the week-view grid to operating hours. */
  studioOpenMin: number;
  studioCloseMin: number;
}

type ViewMode = "month" | "week";

export function TimeOffCalendar({
  blocks,
  onAddForDate,
  onEditBlock,
  studioOpenMin,
  studioCloseMin,
}: TimeOffCalendarProps) {
  const t = useTranslations("coach.calendar");
  const dfLocale = getDateFnsLocale(useLocale());
  const today = startOfDay(new Date());
  const [mode, setMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState<Date>(today);

  function goPrev() {
    setCursor((c) => (mode === "month" ? subMonths(c, 1) : subWeeks(c, 1)));
  }
  function goNext() {
    setCursor((c) => (mode === "month" ? addMonths(c, 1) : addWeeks(c, 1)));
  }
  function goToday() {
    setCursor(today);
  }

  const label =
    mode === "month"
      ? format(cursor, "MMMM yyyy", { locale: dfLocale })
      : (() => {
          const ws = startOfWeek(cursor, { weekStartsOn: 1 });
          const we = endOfWeek(cursor, { weekStartsOn: 1 });
          return `${format(ws, "d MMM", { locale: dfLocale })} – ${format(we, "d MMM yyyy", { locale: dfLocale })}`;
        })();

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev} aria-label={t("calendarPrev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext} aria-label={t("calendarNext")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <h3 className="text-sm font-semibold capitalize">{label}</h3>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={goToday}>
            {t("calendarToday")}
          </Button>
          <div className="inline-flex overflow-hidden rounded-md border text-xs">
            <button
              type="button"
              onClick={() => setMode("month")}
              className={cn(
                "px-2.5 py-1 transition",
                mode === "month" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t("calendarMonthView")}
            </button>
            <button
              type="button"
              onClick={() => setMode("week")}
              className={cn(
                "px-2.5 py-1 transition",
                mode === "week" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {t("calendarWeekView")}
            </button>
          </div>
        </div>
      </div>

      {mode === "month" ? (
        <MonthGrid
          cursor={cursor}
          today={today}
          blocks={blocks}
          dfLocale={dfLocale}
          onAddForDate={onAddForDate}
          onEditBlock={onEditBlock}
        />
      ) : (
        <WeekGrid
          cursor={cursor}
          today={today}
          blocks={blocks}
          studioOpenMin={studioOpenMin}
          studioCloseMin={studioCloseMin}
          onAddForDate={(d, startMin, endMin) =>
            onAddForDate({ startDate: d, startMin, endMin })
          }
          onEditBlock={onEditBlock}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-muted-foreground">{t("calendarLegend")}</span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> {t("reasonVacation")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> {t("reasonPersonal")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-stone-400" /> {t("reasonOther")}
        </span>
      </div>
    </div>
  );
}

// ── Month grid ──────────────────────────────────────────────────────

function MonthGrid({
  cursor,
  today,
  blocks,
  dfLocale,
  onAddForDate,
  onEditBlock,
}: {
  cursor: Date;
  today: Date;
  blocks: CalendarBlock[];
  dfLocale: Locale;
  onAddForDate: (args: { startDate: Date; endDate?: Date; withHours?: boolean }) => void;
  onEditBlock: (block: CalendarBlock) => void;
}) {
  const t = useTranslations("coach.calendar");
  // Airbnb-style two-tap range selection. First tap on an empty day stores
  // it as rangeStart; second tap on a different day fires onAddForDate with
  // a range; second tap on the same day fires onAddForDate with withHours
  // so the modal jumps straight into hour-picking mode.
  const [rangeStart, setRangeStart] = useState<Date | null>(null);

  const days = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    const range = eachDayOfInterval({ start: gridStart, end: gridEnd });
    return range.map((d) => ({
      date: d,
      inMonth: isSameMonth(d, cursor),
      blocks: blocks.filter((b) => {
        const s = startOfDay(new Date(b.startDate));
        const e = startOfDay(new Date(b.endDate));
        return d >= s && d <= e;
      }),
    }));
  }, [cursor, blocks]);

  function handleDayClick(date: Date, hasBlocks: boolean, firstBlock: CalendarBlock | undefined) {
    // Tapping a day with existing blocks always opens the view modal and
    // exits range selection — viewing/editing existing data takes priority.
    if (hasBlocks && firstBlock) {
      setRangeStart(null);
      onEditBlock(firstBlock);
      return;
    }
    if (!rangeStart) {
      setRangeStart(date);
      return;
    }
    const sameDay = isSameDay(date, rangeStart);
    if (sameDay) {
      // Same-day re-tap → user wants to pick specific hours, not a range
      setRangeStart(null);
      onAddForDate({ startDate: date, withHours: true });
      return;
    }
    // Different day → range. Normalize so startDate ≤ endDate.
    const [startDate, endDate] = rangeStart <= date ? [rangeStart, date] : [date, rangeStart];
    setRangeStart(null);
    onAddForDate({ startDate, endDate });
  }

  function isInProvisionalRange(d: Date): boolean {
    if (!rangeStart) return false;
    return isSameDay(d, rangeStart);
  }

  return (
    <>
      {rangeStart && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-xs">
          <p className="text-foreground">
            {t.rich("rangeStartHint", {
              date: format(rangeStart, "EEE d MMM", { locale: dfLocale }),
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
          <button
            type="button"
            onClick={() => setRangeStart(null)}
            className="text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            {t("rangeCancel")}
          </button>
        </div>
      )}

      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {DAY_LABELS_SHORT.map((d) => (
          <div key={d} className="text-muted-foreground text-center text-[11px] font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isPast = day.date < today;
          const dayIsToday = isToday(day.date);
          const hasBlocks = day.blocks.length > 0;
          const isRangeStart = isInProvisionalRange(day.date);
          return (
            <button
              key={day.date.toISOString()}
              type="button"
              onClick={() => handleDayClick(day.date, hasBlocks, day.blocks[0])}
              className={cn(
                "group relative flex aspect-square flex-col items-center justify-start rounded-md border p-1.5 transition",
                "hover:border-primary/40 hover:bg-muted/50",
                !day.inMonth && "opacity-40",
                isPast && !isRangeStart && "opacity-60",
                dayIsToday && !isRangeStart && "border-primary/60 bg-primary/5",
                hasBlocks && !isRangeStart && "bg-muted/40",
                isRangeStart && "border-primary bg-primary text-primary-foreground ring-2 ring-primary/30",
              )}
            >
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  dayIsToday && !isRangeStart && "text-primary",
                  isRangeStart && "text-primary-foreground",
                )}
              >
                {format(day.date, "d")}
              </span>
              {hasBlocks && (
                <div className="mt-auto flex max-w-full flex-wrap items-center justify-center gap-0.5">
                  {day.blocks.slice(0, 3).map((b) => (
                    <span
                      key={b.id}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        REASON_COLOR[b.reasonType ?? "other"] ?? "bg-stone-400",
                        b.status === "pending_approval" && "ring-1 ring-amber-500 ring-offset-1",
                      )}
                      title={b.reasonNote ?? b.reasonType ?? "Tiempo libre"}
                    />
                  ))}
                  {day.blocks.length > 3 && (
                    <span className="text-muted-foreground text-[9px]">+{day.blocks.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Week grid ───────────────────────────────────────────────────────

interface WeekGridProps {
  cursor: Date;
  today: Date;
  blocks: CalendarBlock[];
  studioOpenMin: number;
  studioCloseMin: number;
  onAddForDate: (date: Date, startMin: number, endMin: number) => void;
  onEditBlock: (block: CalendarBlock) => void;
}

function WeekGrid({
  cursor,
  today,
  blocks,
  studioOpenMin,
  studioCloseMin,
  onAddForDate,
  onEditBlock,
}: WeekGridProps) {
  const t = useTranslations("coach.calendar");
  const weekStart = useMemo(() => startOfWeek(cursor, { weekStartsOn: 1 }), [cursor]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Pre-compute, per day, the per-slot block coverage so each cell can
  // colour itself in O(1). A slot is the 30-min window starting at
  // (studioOpenMin + slotIdx * SLOT_MINUTES).
  const slotsPerDay = Math.max(0, Math.floor((studioCloseMin - studioOpenMin) / SLOT_MINUTES));
  const coverage = useMemo(() => {
    const out = new Map<string, Map<number, CalendarBlock>>();
    for (const day of days) {
      const dayStart = startOfDay(day);
      const key = format(day, "yyyy-MM-dd");
      const slotMap = new Map<number, CalendarBlock>();
      for (const b of blocks) {
        const s = startOfDay(new Date(b.startDate));
        const e = startOfDay(new Date(b.endDate));
        if (dayStart < s || dayStart > e) continue;
        let bStart = b.isAllDay ? 0 : parseTimeToMinutes(b.startTime) ?? 0;
        let bEnd = b.isAllDay ? 24 * 60 : parseTimeToMinutes(b.endTime) ?? 24 * 60;
        // Clamp to operating window for rendering
        bStart = Math.max(bStart, studioOpenMin);
        bEnd = Math.min(bEnd, studioCloseMin);
        for (let m = bStart; m < bEnd; m += SLOT_MINUTES) {
          const slotIdx = Math.floor((m - studioOpenMin) / SLOT_MINUTES);
          if (slotIdx >= 0 && slotIdx < slotsPerDay && !slotMap.has(slotIdx)) {
            slotMap.set(slotIdx, b);
          }
        }
      }
      out.set(key, slotMap);
    }
    return out;
  }, [days, blocks, studioOpenMin, studioCloseMin, slotsPerDay]);

  // Drag-to-select state for painting a new range. We use the same touch-
  // friendly pattern as the recurring grid: pointer capture + global
  // pointermove + elementFromPoint hit-testing, so dragging works on
  // mobile (where pointerenter doesn't fire while a pointer is captured).
  const dragRef = useRef<{
    active: boolean;
    dayIdx: number | null;
    startSlot: number | null;
    endSlot: number | null;
  }>({ active: false, dayIdx: null, startSlot: null, endSlot: null });
  const [dragVisual, setDragVisual] = useState<{
    dayIdx: number;
    from: number;
    to: number;
    tipX: number;
    tipY: number;
  } | null>(null);

  function cellAtPoint(x: number, y: number): { day: number; slot: number } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const cellEl = el.closest("[data-week-cell='1']") as HTMLElement | null;
    if (!cellEl) return null;
    const day = parseInt(cellEl.dataset.day ?? "", 10);
    const slot = parseInt(cellEl.dataset.slot ?? "", 10);
    if (Number.isNaN(day) || Number.isNaN(slot)) return null;
    return { day, slot };
  }

  function commitDrag() {
    const d = dragRef.current;
    if (!d.active || d.dayIdx == null || d.startSlot == null || d.endSlot == null) {
      dragRef.current = { active: false, dayIdx: null, startSlot: null, endSlot: null };
      setDragVisual(null);
      return;
    }
    const from = Math.min(d.startSlot, d.endSlot);
    const to = Math.max(d.startSlot, d.endSlot);
    const startMin = studioOpenMin + from * SLOT_MINUTES;
    const endMin = studioOpenMin + (to + 1) * SLOT_MINUTES;
    const date = days[d.dayIdx];
    dragRef.current = { active: false, dayIdx: null, startSlot: null, endSlot: null };
    setDragVisual(null);
    onAddForDate(date, startMin, endMin);
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current.active) return;
      e.preventDefault();
      const hit = cellAtPoint(e.clientX, e.clientY);
      if (!hit) return;
      if (hit.day !== dragRef.current.dayIdx) return;
      dragRef.current.endSlot = hit.slot;
      const start = dragRef.current.startSlot ?? hit.slot;
      setDragVisual({
        dayIdx: hit.day,
        from: Math.min(start, hit.slot),
        to: Math.max(start, hit.slot),
        tipX: e.clientX,
        tipY: e.clientY,
      });
    }
    function onUp() {
      if (dragRef.current.active) commitDrag();
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, studioOpenMin]);

  function handleDown(
    dayIdx: number,
    slotIdx: number,
    hasBlock: CalendarBlock | undefined,
    clientX: number,
    clientY: number,
    target: HTMLButtonElement,
    pointerId: number,
  ) {
    if (hasBlock) {
      onEditBlock(hasBlock);
      return;
    }
    target.setPointerCapture?.(pointerId);
    dragRef.current = { active: true, dayIdx, startSlot: slotIdx, endSlot: slotIdx };
    setDragVisual({ dayIdx, from: slotIdx, to: slotIdx, tipX: clientX, tipY: clientY });
  }

  // Render hour labels every full hour.
  const firstHour = Math.ceil(studioOpenMin / 60);
  const lastHour = Math.floor(studioCloseMin / 60);
  const hourLabels: number[] = [];
  for (let h = firstHour; h <= lastHour; h++) hourLabels.push(h);

  return (
    <div className="select-none">
      <div
        className="mb-1.5 grid gap-px"
        style={{ gridTemplateColumns: "44px repeat(7, 1fr)" }}
      >
        <div />
        {days.map((d, i) => {
          const dayIsToday = isToday(d);
          return (
            <div
              key={i}
              className={cn(
                "text-center text-xs",
                dayIsToday ? "text-primary font-semibold" : "text-muted-foreground font-medium",
              )}
            >
              <div className="text-[10px] uppercase tracking-wide">{DAY_LABELS_SHORT[i]}</div>
              <div className="tabular-nums">{format(d, "d")}</div>
            </div>
          );
        })}
      </div>

      <div
        className="relative grid gap-px overflow-hidden rounded-lg border bg-border"
        // touch-action: none stops the page scrolling while the user drags
        // to paint a range on mobile.
        style={{ gridTemplateColumns: "44px repeat(7, 1fr)", touchAction: "none" }}
      >
        {Array.from({ length: slotsPerDay }).map((_, slotIdx) => {
          const minutesAtSlot = studioOpenMin + slotIdx * SLOT_MINUTES;
          const isHourMark = minutesAtSlot % 60 === 0;
          return (
            <div className="contents" key={slotIdx}>
              <div
                className={cn(
                  "bg-background flex h-6 items-center justify-end pr-1.5 text-[10px] tabular-nums sm:h-4",
                  isHourMark ? "text-muted-foreground/90" : "text-transparent",
                )}
              >
                {isHourMark ? `${Math.floor(minutesAtSlot / 60).toString().padStart(2, "0")}:00` : "."}
              </div>
              {days.map((day, dayIdx) => {
                const key = format(day, "yyyy-MM-dd");
                const block = coverage.get(key)?.get(slotIdx);
                const inDragVisual =
                  dragVisual?.dayIdx === dayIdx &&
                  slotIdx >= dragVisual.from &&
                  slotIdx <= dragVisual.to;
                const isPast = day < today;
                return (
                  <button
                    key={dayIdx}
                    type="button"
                    data-week-cell="1"
                    data-day={dayIdx}
                    data-slot={slotIdx}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      handleDown(
                        dayIdx,
                        slotIdx,
                        block,
                        e.clientX,
                        e.clientY,
                        e.currentTarget as HTMLButtonElement,
                        e.pointerId,
                      );
                    }}
                    title={block?.reasonNote ?? block?.reasonType ?? "Disponible"}
                    className={cn(
                      "h-6 transition-colors sm:h-4",
                      block
                        ? cn(
                            REASON_BG[block.reasonType ?? "other"] ?? "bg-stone-400/80",
                            "active:opacity-80 sm:hover:opacity-90",
                          )
                        : inDragVisual
                        ? "bg-rose-300 dark:bg-rose-500/60"
                        : "bg-background active:bg-muted sm:hover:bg-muted",
                      isHourMark && !block && "border-t-2 border-border",
                      isPast && !block && "bg-muted/30",
                    )}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {dragVisual && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg tabular-nums"
          style={{ left: dragVisual.tipX, top: dragVisual.tipY - 10 }}
        >
          {formatRangeMinutes(studioOpenMin + dragVisual.from * SLOT_MINUTES)}
          {" – "}
          {formatRangeMinutes(studioOpenMin + (dragVisual.to + 1) * SLOT_MINUTES)}
        </div>
      )}

      <p className="text-muted-foreground mt-2 text-xs">
        {t("weekGridHint")}
      </p>
    </div>
  );
}

function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function formatRangeMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
