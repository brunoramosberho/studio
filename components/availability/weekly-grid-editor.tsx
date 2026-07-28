"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { SLOT_MINUTES } from "@/lib/availability";

export interface GridRange {
  dayOfWeek: number; // 0=Mon..6=Sun
  startMin: number;
  endMin: number;
}

interface WeeklyGridEditorProps {
  minMin: number; // tenant studio open (minutes since midnight, multiple of 15)
  maxMin: number; // tenant studio close
  operatingDays: number[]; // 0=Mon..6=Sun
  initialRanges: GridRange[];
  onChange: (next: GridRange[]) => void;
  disabled?: boolean;
  showHourLabels?: boolean;
}

const DAY_SHORT = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function formatHour(min: number): string {
  const h = Math.floor(min / 60);
  return `${h.toString().padStart(2, "0")}:00`;
}

function formatTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function rangesToSet(ranges: GridRange[], minMin: number, slotsPerDay: number): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (let d = 0; d < 7; d++) out.set(d, new Set());
  for (const r of ranges) {
    const set = out.get(r.dayOfWeek);
    if (!set) continue;
    const fromIdx = Math.max(0, Math.floor((r.startMin - minMin) / SLOT_MINUTES));
    const toIdx = Math.min(slotsPerDay, Math.ceil((r.endMin - minMin) / SLOT_MINUTES));
    for (let i = fromIdx; i < toIdx; i++) set.add(i);
  }
  return out;
}

function setsToRanges(sets: Map<number, Set<number>>, minMin: number): GridRange[] {
  const out: GridRange[] = [];
  for (const [day, set] of sets.entries()) {
    const sorted = Array.from(set).sort((a, b) => a - b);
    if (sorted.length === 0) continue;
    let runStart = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i];
        continue;
      }
      out.push({
        dayOfWeek: day,
        startMin: minMin + runStart * SLOT_MINUTES,
        endMin: minMin + (prev + 1) * SLOT_MINUTES,
      });
      runStart = sorted[i];
      prev = sorted[i];
    }
    out.push({
      dayOfWeek: day,
      startMin: minMin + runStart * SLOT_MINUTES,
      endMin: minMin + (prev + 1) * SLOT_MINUTES,
    });
  }
  return out;
}

/**
 * Click-and-drag weekly editor for the coach's recurring availability.
 *
 * Touch + desktop unified via pointer events:
 *  - `touch-action: none` on the grid prevents the page from scrolling while
 *    you're painting (the #1 mobile bug with this kind of UI).
 *  - `setPointerCapture` keeps the gesture flowing even when the finger
 *    drifts outside the originating cell.
 *  - Cells are detected via `document.elementFromPoint(x, y)` during
 *    pointermove rather than `pointerenter`, because `pointerenter` does
 *    not fire on touch devices while a pointer is captured.
 *
 * Visuals:
 *  - Larger touch targets on mobile (h-6, 24px) shrinking on sm+ (h-4, 16px).
 *  - Solid hour separators every full hour for orientation.
 *  - Live floating tooltip showing the time range being painted.
 */
export function WeeklyGridEditor({
  minMin,
  maxMin,
  operatingDays,
  initialRanges,
  onChange,
  disabled,
  showHourLabels = true,
}: WeeklyGridEditorProps) {
  const t = useTranslations("coach.calendar");
  const slotsPerDay = Math.max(0, Math.floor((maxMin - minMin) / SLOT_MINUTES));
  const operatingSet = useMemo(() => new Set(operatingDays), [operatingDays]);

  const [cells, setCells] = useState<Map<number, Set<number>>>(() =>
    rangesToSet(initialRanges, minMin, slotsPerDay),
  );

  // Drag state: tracked in both a ref (for pointermove handlers) and state
  // (to render the floating range tooltip). The ref is the source of truth
  // during the gesture; we set state at the same time for the visual layer.
  const dragRef = useRef<{
    active: boolean;
    targetState: boolean;
    day: number | null;
    startSlot: number | null;
    lastSlot: number | null;
  }>({ active: false, targetState: false, day: null, startSlot: null, lastSlot: null });
  const [dragVisual, setDragVisual] = useState<{
    day: number;
    fromSlot: number;
    toSlot: number;
    tipX: number;
    tipY: number;
  } | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  const applyCell = useCallback(
    (day: number, slot: number, value: boolean) => {
      if (!operatingSet.has(day)) return;
      if (slot < 0 || slot >= slotsPerDay) return;
      setCells((prev) => {
        const existing = prev.get(day);
        if (!existing) return prev;
        if (value && existing.has(slot)) return prev;
        if (!value && !existing.has(slot)) return prev;
        const next = new Map(prev);
        const set = new Set(existing);
        if (value) set.add(slot);
        else set.delete(slot);
        next.set(day, set);
        const derived = setsToRanges(next, minMin);
        onChange(derived);
        return next;
      });
    },
    [operatingSet, slotsPerDay, minMin, onChange],
  );

  // Find the (day, slot) under the given client coordinates by reading
  // data-* attributes on the cell. Returns null if the point isn't on a cell.
  function cellAtPoint(x: number, y: number): { day: number; slot: number } | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const cellEl = el.closest("[data-grid-cell='1']") as HTMLElement | null;
    if (!cellEl) return null;
    const day = parseInt(cellEl.dataset.day ?? "", 10);
    const slot = parseInt(cellEl.dataset.slot ?? "", 10);
    if (Number.isNaN(day) || Number.isNaN(slot)) return null;
    return { day, slot };
  }

  function startDrag(day: number, slot: number, clientX: number, clientY: number) {
    if (disabled) return;
    if (!operatingSet.has(day)) return;
    const currentlySet = cells.get(day)?.has(slot) ?? false;
    const target = !currentlySet;
    dragRef.current = {
      active: true,
      targetState: target,
      day,
      startSlot: slot,
      lastSlot: slot,
    };
    applyCell(day, slot, target);
    setDragVisual({ day, fromSlot: slot, toSlot: slot, tipX: clientX, tipY: clientY });
  }

  function extendDrag(clientX: number, clientY: number) {
    const d = dragRef.current;
    if (!d.active || d.day == null || d.startSlot == null) return;
    const hit = cellAtPoint(clientX, clientY);
    if (!hit) return;
    if (hit.day !== d.day) return; // restrict to one day for now (simpler UX)
    if (hit.slot === d.lastSlot) {
      // Same slot, just update tooltip position
      setDragVisual({
        day: d.day,
        fromSlot: Math.min(d.startSlot, hit.slot),
        toSlot: Math.max(d.startSlot, hit.slot),
        tipX: clientX,
        tipY: clientY,
      });
      return;
    }
    // Fill every slot between lastSlot and hit.slot to make drag robust
    // (a fast finger might skip cells between two pointermove events).
    const from = Math.min(d.lastSlot ?? d.startSlot, hit.slot);
    const to = Math.max(d.lastSlot ?? d.startSlot, hit.slot);
    for (let s = from; s <= to; s++) {
      applyCell(d.day, s, d.targetState);
    }
    d.lastSlot = hit.slot;
    setDragVisual({
      day: d.day,
      fromSlot: Math.min(d.startSlot, hit.slot),
      toSlot: Math.max(d.startSlot, hit.slot),
      tipX: clientX,
      tipY: clientY,
    });
  }

  function endDrag() {
    dragRef.current = {
      active: false,
      targetState: false,
      day: null,
      startSlot: null,
      lastSlot: null,
    };
    setDragVisual(null);
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!dragRef.current.active) return;
      e.preventDefault();
      extendDrag(e.clientX, e.clientY);
    }
    function onUp() {
      if (dragRef.current.active) endDrag();
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
  }, []);

  return (
    <div className="relative select-none">
      <div
        className="grid gap-px"
        style={{
          gridTemplateColumns: showHourLabels ? "44px repeat(7, 1fr)" : "repeat(7, 1fr)",
        }}
      >
        {showHourLabels && <div />}
        {DAY_SHORT.map((d, i) => (
          <div
            key={i}
            className={cn(
              "text-center text-xs font-medium",
              operatingSet.has(i) ? "text-foreground" : "text-muted-foreground/60",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      <div
        ref={gridRef}
        className="mt-1 grid gap-px overflow-hidden rounded-lg border bg-border"
        // Critical for mobile: stops the page from scrolling while the user
        // drags across cells. Without this, vertical drags scroll the page.
        style={{
          gridTemplateColumns: showHourLabels ? "44px repeat(7, 1fr)" : "repeat(7, 1fr)",
          touchAction: "none",
        }}
      >
        {Array.from({ length: slotsPerDay }).map((_, slotIdx) => {
          const minutesAtSlot = minMin + slotIdx * SLOT_MINUTES;
          const isHourMark = minutesAtSlot % 60 === 0;

          return (
            <div className="contents" key={slotIdx}>
              {showHourLabels && (
                <div
                  className={cn(
                    "bg-background flex h-6 items-center justify-end pr-1.5 text-[10px] tabular-nums sm:h-4",
                    isHourMark ? "text-muted-foreground/90" : "text-transparent",
                  )}
                >
                  {isHourMark ? formatHour(minutesAtSlot) : "."}
                </div>
              )}
              {Array.from({ length: 7 }).map((_, dayIdx) => {
                const isOperating = operatingSet.has(dayIdx);
                const isOn = cells.get(dayIdx)?.has(slotIdx) ?? false;
                return (
                  <button
                    key={dayIdx}
                    type="button"
                    aria-pressed={isOn}
                    disabled={!isOperating || disabled}
                    data-grid-cell="1"
                    data-day={dayIdx}
                    data-slot={slotIdx}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      // Capture the pointer so the gesture survives even when
                      // the finger drifts off the cell (or off the page).
                      (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
                      startDrag(dayIdx, slotIdx, e.clientX, e.clientY);
                    }}
                    className={cn(
                      "h-6 transition-colors sm:h-4",
                      !isOperating
                        ? "bg-muted/30 cursor-not-allowed"
                        : isOn
                        ? "bg-emerald-500 active:bg-emerald-600 sm:hover:bg-emerald-500/90"
                        : "bg-background active:bg-muted sm:hover:bg-muted",
                      isHourMark && "border-t-2 border-border",
                      disabled && "cursor-not-allowed opacity-60",
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
          style={{
            left: dragVisual.tipX,
            top: dragVisual.tipY - 10,
          }}
        >
          {formatTime(minMin + dragVisual.fromSlot * SLOT_MINUTES)}
          {" – "}
          {formatTime(minMin + (dragVisual.toSlot + 1) * SLOT_MINUTES)}
        </div>
      )}

      <p className="text-muted-foreground mt-2 text-xs">
        {t("weekHint")}
      </p>
    </div>
  );
}

export { setsToRanges, rangesToSet };
