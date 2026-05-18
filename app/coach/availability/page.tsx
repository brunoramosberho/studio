"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CalendarOff,
  Trash2,
  Info,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  isBefore,
  startOfDay,
  differenceInCalendarDays,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { getZone, type Zone, type ZoneThresholds } from "@/lib/availability";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// ── Types ──

interface AvailabilityBlock {
  id: string;
  type: "recurring" | "one_time";
  dayOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  isAllDay: boolean;
  reasonType: "vacation" | "personal" | "training" | "other";
  reasonNote: string | null;
  status: "active" | "pending_approval" | "rejected";
  createdAt: string;
}

type ViewMode = "month" | "week";

interface DateRange {
  start: Date | null;
  end: Date | null;
}

// Day labels are generated via translations in the component
const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const REASON_LABELS: Record<string, string> = {
  vacation: "Vacaciones",
  personal: "Personal",
  training: "Formación",
  other: "Otro",
};
const HOURS_START = 7;
const HOURS_END = 21;
const SLOT_HEIGHT = 36;

// ── Helpers ──

function timeToSlot(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h - HOURS_START) * 2 + (m >= 30 ? 1 : 0);
}

function getJsDow(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1; // convert Sun=0..Sat=6 → Mon=0..Sun=6
}

function isDayInRange(day: Date, range: DateRange) {
  if (!range.start) return "none" as const;
  const s = startOfDay(range.start);
  const e = range.end ? startOfDay(range.end) : null;
  const d = startOfDay(day);
  if (e && isSameDay(s, e) && isSameDay(d, s)) return "single" as const;
  if (isSameDay(d, s)) return e ? "start" : "single";
  if (e && isSameDay(d, e)) return "end" as const;
  if (e && d > s && d < e) return "middle" as const;
  return "none" as const;
}

// ── Data fetching ──

type AvailabilityResponse = {
  blocks: AvailabilityBlock[];
  zoneRedDays: number;
  zoneYellowDays: number;
};

async function fetchAvailability(): Promise<AvailabilityResponse> {
  const res = await fetch("/api/coaches/availability");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function createBlock(
  data: Record<string, unknown>,
): Promise<AvailabilityBlock> {
  const res = await fetch("/api/coaches/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create");
  }
  return res.json();
}

async function deleteBlock(id: string): Promise<void> {
  const res = await fetch(`/api/coaches/availability/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to delete");
  }
}

// ── Main page ──

export default function CoachAvailabilityPage() {
  const t = useTranslations("coach");
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaults, setModalDefaults] = useState<{
    date?: Date;
    endDate?: Date;
    time?: string;
  }>({});
  const [range, setRange] = useState<DateRange>({ start: null, end: null });

  const { data: availData, isLoading } = useQuery({
    queryKey: ["coach-availability"],
    queryFn: fetchAvailability,
  });

  const blocks = availData?.blocks ?? [];
  const zoneThresholds: ZoneThresholds = {
    zoneRedDays: availData?.zoneRedDays,
    zoneYellowDays: availData?.zoneYellowDays,
  };

  const clearRange = useCallback(() => {
    setRange({ start: null, end: null });
  }, []);

  const createMut = useMutation({
    mutationFn: createBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-availability"] });
      setModalOpen(false);
      clearRange();
      toast.success(t("blockCreated"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-availability"] });
      toast.success(t("blockDeleted"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const recurring = blocks.filter(
    (b) => b.type === "recurring" && b.status === "active",
  );
  const pending = blocks.filter((b) => b.status === "pending_approval");
  const confirmed = blocks.filter(
    (b) => b.type === "one_time" && b.status === "active",
  );

  const openModal = useCallback(
    (defaults?: { date?: Date; endDate?: Date; time?: string }) => {
      setModalDefaults(defaults ?? {});
      setModalOpen(true);
    },
    [],
  );

  // Modal close handler: clear range if user cancels
  const handleModalOpenChange = useCallback(
    (open: boolean) => {
      setModalOpen(open);
      if (!open) clearRange();
    },
    [clearRange],
  );

  // Range selection logic: Airbnb-style
  const handleDayClick = useCallback(
    (day: Date) => {
      // First tap (or starting fresh after completed range): set start
      if (!range.start || range.end) {
        setRange({ start: day, end: null });
        return;
      }
      // Second tap: set end (swap if needed), open modal pre-filled
      const start = day < range.start ? day : range.start;
      const end = day < range.start ? range.start : day;
      setRange({ start, end });
      openModal({ date: start, endDate: end });
    },
    [range, openModal],
  );

  const handleConfirmDelete = useCallback(
    (b: AvailabilityBlock) => {
      const label =
        b.type === "recurring"
          ? `${b.dayOfWeek.map((d) => DAY_LABELS[d]).join(", ")} · ${b.startTime}–${b.endTime}`
          : b.startDate
            ? `${format(new Date(b.startDate), "d MMM", { locale: es })}${b.endDate && b.endDate !== b.startDate ? ` – ${format(new Date(b.endDate), "d MMM", { locale: es })}` : ""}`
            : "";
      if (window.confirm(`${t("confirmDelete")}\n\n${label}`)) {
        deleteMut.mutate(b.id);
      }
    },
    [deleteMut, t],
  );

  return (
    <div className="min-h-full bg-stone-50 pb-24 lg:pb-0">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 p-3 sm:gap-6 sm:p-4 lg:flex-row lg:p-6">
        {/* Left: calendar */}
        <div className="flex-1">
          <div className="rounded-2xl border border-stone-200 bg-card p-3 sm:p-6">
            {/* Tabs + nav */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
              <div className="inline-flex rounded-lg bg-stone-100 p-1">
                {(["month", "week"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-all sm:px-4",
                      view === v
                        ? "border border-stone-200 bg-card text-stone-900 shadow-none"
                        : "text-stone-500 hover:text-stone-700",
                    )}
                  >
                    {v === "month" ? t("periodMonth") : t("periodWeek")}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() =>
                    setCurrentDate((d) =>
                      view === "month" ? addMonths(d, -1) : addWeeks(d, -1),
                    )
                  }
                  className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-100"
                  aria-label={t("previous")}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="min-w-[120px] text-center text-sm font-semibold capitalize text-stone-800 sm:min-w-[140px]">
                  {view === "month"
                    ? format(currentDate, "MMMM yyyy", { locale: es })
                    : `${format(
                        startOfWeek(currentDate, { weekStartsOn: 1 }),
                        "d MMM",
                        { locale: es },
                      )} – ${format(
                        endOfWeek(currentDate, { weekStartsOn: 1 }),
                        "d MMM yyyy",
                        { locale: es },
                      )}`}
                </span>
                <button
                  onClick={() =>
                    setCurrentDate((d) =>
                      view === "month" ? addMonths(d, 1) : addWeeks(d, 1),
                    )
                  }
                  className="rounded-lg p-2 text-stone-500 transition-colors hover:bg-stone-100"
                  aria-label={t("next")}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Range selection hint */}
            {view === "month" && (
              <RangeHint range={range} onClear={clearRange} t={t} />
            )}

            {isLoading ? (
              <div className="flex h-64 items-center justify-center text-stone-400">
                {t("loading")}
              </div>
            ) : view === "month" ? (
              <MonthView
                currentDate={currentDate}
                blocks={blocks}
                range={range}
                onDayClick={handleDayClick}
              />
            ) : (
              <WeekView
                currentDate={currentDate}
                blocks={blocks}
                onSlotClick={(d, time) => openModal({ date: d, time })}
              />
            )}

            {/* Helper text */}
            {view === "month" && !range.start && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-stone-500">
                <Info className="h-3.5 w-3.5" />
                {t("tapToSelectRange")}
              </p>
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-stone-100 pt-4 sm:gap-4">
              <LegendDot className="bg-blue-100" label={t("recurring")} />
              <LegendDot className="bg-stone-200" label={t("confirmed")} />
              <LegendDot className="bg-amber-100" label={t("pending")} />
            </div>
          </div>
        </div>

        {/* Right: sidebar */}
        <div className="w-full lg:w-80">
          <div className="rounded-2xl border border-stone-200 bg-card p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-stone-900">
                {t("myAvailability")}
              </h2>
              <button
                onClick={() => openModal()}
                className="hidden items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-200 sm:inline-flex lg:hidden"
                aria-label={t("addBlock")}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("addBlock")}
              </button>
            </div>

            {recurring.length === 0 &&
              pending.length === 0 &&
              confirmed.length === 0 && (
                <div className="rounded-xl border border-dashed border-stone-200 p-6 text-center">
                  <CalendarOff className="mx-auto mb-2 h-6 w-6 text-stone-300" />
                  <p className="text-sm text-stone-500">{t("noBlocksYet")}</p>
                  <p className="mt-1 text-xs text-stone-400">
                    {t("tapToSelectRange")}
                  </p>
                </div>
              )}

            <SidebarSection title={t("recurringBlocks")} blocks={recurring}>
              {recurring.map((b) => (
                <RecurringCard
                  key={b.id}
                  block={b}
                  onDelete={() => handleConfirmDelete(b)}
                  isDeleting={deleteMut.isPending && deleteMut.variables === b.id}
                />
              ))}
            </SidebarSection>

            <SidebarSection title={t("pendingApproval")} blocks={pending}>
              {pending.map((b) => (
                <PendingCard
                  key={b.id}
                  block={b}
                  onCancel={() => handleConfirmDelete(b)}
                  isDeleting={deleteMut.isPending && deleteMut.variables === b.id}
                />
              ))}
            </SidebarSection>

            <SidebarSection title={t("confirmedBlocks")} blocks={confirmed}>
              {confirmed.map((b) => (
                <ConfirmedCard
                  key={b.id}
                  block={b}
                  onDelete={() => handleConfirmDelete(b)}
                  zoneThresholds={zoneThresholds}
                  isDeleting={deleteMut.isPending && deleteMut.variables === b.id}
                />
              ))}
            </SidebarSection>

            <button
              onClick={() => openModal()}
              className="mt-4 hidden w-full items-center justify-center gap-2 rounded-xl bg-[#1C2340] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1C2340]/90 lg:flex"
            >
              <Plus className="h-4 w-4" />
              {t("addBlock")}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile sticky "Add" CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto max-w-xl">
          <button
            onClick={() => openModal()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1C2340] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-[#1C2340]/90 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" />
            {t("addBlock")}
          </button>
        </div>
      </div>

      {/* Modal */}
      <NewBlockModal
        open={modalOpen}
        onOpenChange={handleModalOpenChange}
        defaults={modalDefaults}
        onSubmit={(data) => createMut.mutate(data)}
        isSubmitting={createMut.isPending}
        error={createMut.error?.message}
        zoneThresholds={zoneThresholds}
      />
    </div>
  );
}

// ── Range hint banner ──

function RangeHint({
  range,
  onClear,
  t,
}: {
  range: DateRange;
  onClear: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!range.start || range.end) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#3730B8] text-[10px] font-bold text-white">
          1
        </span>
        <span className="truncate">
          {t("tapEndDate")} ·{" "}
          <strong>
            {format(range.start, "EEE d MMM", { locale: es })}
          </strong>
        </span>
      </div>
      <button
        onClick={onClear}
        className="shrink-0 rounded-md px-2 py-0.5 text-indigo-700 transition-colors hover:bg-indigo-100"
      >
        {t("cancelAction")}
      </button>
    </div>
  );
}

// ── Month view ──

function MonthView({
  currentDate,
  blocks,
  range,
  onDayClick,
}: {
  currentDate: Date;
  blocks: AvailabilityBlock[];
  range: DateRange;
  onDayClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = startOfDay(new Date());

  function getBlockBg(day: Date): string | null {
    const dow = getJsDow(day);

    for (const b of blocks) {
      if (b.type === "one_time" && b.startDate && b.endDate) {
        const s = startOfDay(new Date(b.startDate));
        const e = startOfDay(new Date(b.endDate));
        if (day >= s && day <= e) {
          return b.status === "pending_approval"
            ? "bg-amber-50"
            : "bg-stone-100";
        }
      }
      if (b.type === "recurring" && b.status === "active") {
        if (b.dayOfWeek.includes(dow)) return "bg-blue-50";
      }
    }
    return null;
  }

  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="py-1 text-center text-xs font-medium text-stone-400"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const inMonth = isSameMonth(day, currentDate);
          const isPast = isBefore(day, today);
          const blockBg = getBlockBg(day);
          const rangePos = isDayInRange(day, range);
          const isInRange = rangePos !== "none";

          return (
            <button
              key={day.toISOString()}
              disabled={isPast}
              onClick={() => !isPast && onDayClick(day)}
              className={cn(
                "relative flex h-14 items-center justify-center text-sm transition-all sm:h-14",
                // Range background (overrides block bg visually)
                !isInRange && "rounded-lg",
                isInRange &&
                  rangePos === "middle" &&
                  "bg-indigo-100 text-indigo-900",
                isInRange &&
                  rangePos === "start" &&
                  "rounded-l-lg bg-indigo-100",
                isInRange &&
                  rangePos === "end" &&
                  "rounded-r-lg bg-indigo-100",
                isInRange && rangePos === "single" && "rounded-lg",
                // Block background only if not range-selected
                !isInRange && blockBg,
                // Text colors / disabled
                !inMonth && !isInRange && "text-stone-300",
                inMonth && !isPast && !isInRange && "text-stone-700",
                inMonth && !isPast && "active:scale-95 hover:bg-stone-50",
                isPast && "cursor-not-allowed text-stone-300 opacity-60",
                isToday(day) && !isInRange && "font-bold",
              )}
              aria-label={format(day, "d MMM yyyy", { locale: es })}
            >
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm",
                  isToday(day) && !isInRange && "bg-[#3730B8] text-white",
                  (rangePos === "start" ||
                    rangePos === "end" ||
                    rangePos === "single") &&
                    "bg-[#3730B8] font-semibold text-white shadow-sm",
                )}
              >
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view ──

function WeekView({
  currentDate,
  blocks,
  onSlotClick,
}: {
  currentDate: Date;
  blocks: AvailabilityBlock[];
  onSlotClick: (day: Date, time: string) => void;
}) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(currentDate, { weekStartsOn: 1 }),
  });

  const totalSlots = (HOURS_END - HOURS_START) * 2;
  const hours: string[] = [];
  for (let h = HOURS_START; h < HOURS_END; h++) {
    hours.push(`${String(h).padStart(2, "0")}:00`);
    hours.push(`${String(h).padStart(2, "0")}:30`);
  }

  const dayBlocks = useMemo(() => {
    const map: Record<number, { block: AvailabilityBlock; startSlot: number; endSlot: number }[]> = {};
    for (let di = 0; di < 7; di++) map[di] = [];

    for (const b of blocks) {
      if (b.type === "recurring" && b.status === "active" && b.startTime && b.endTime) {
        for (const dow of b.dayOfWeek) {
          const ss = timeToSlot(b.startTime);
          const es = timeToSlot(b.endTime);
          if (es > ss) map[dow]?.push({ block: b, startSlot: ss, endSlot: es });
        }
      }
      if (b.type === "one_time" && b.startDate && b.endDate) {
        const sd = startOfDay(new Date(b.startDate));
        const ed = startOfDay(new Date(b.endDate));
        for (let di = 0; di < 7; di++) {
          const day = weekDays[di];
          if (day >= sd && day <= ed) {
            if (b.isAllDay || !b.startTime || !b.endTime) {
              map[di].push({ block: b, startSlot: 0, endSlot: totalSlots });
            } else {
              const ss = timeToSlot(b.startTime);
              const es2 = timeToSlot(b.endTime);
              if (es2 > ss) map[di].push({ block: b, startSlot: ss, endSlot: es2 });
            }
          }
        }
      }
    }
    return map;
  }, [blocks, weekDays, totalSlots]);

  function blockStyle(b: AvailabilityBlock) {
    if (b.type === "recurring") return "bg-blue-100 text-blue-900";
    if (b.status === "pending_approval") return "bg-amber-100 text-amber-900";
    return "bg-stone-200 text-stone-800";
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Header */}
        <div className="mb-1 grid grid-cols-[56px_repeat(7,1fr)] gap-px">
          <div />
          {weekDays.map((day, i) => (
            <div key={i} className="flex flex-col items-center py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                {DAY_LABELS[i]}
              </span>
              <span
                className={cn(
                  "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold",
                  isToday(day)
                    ? "bg-[#3730B8] text-white"
                    : "text-stone-700",
                )}
              >
                {format(day, "d")}
              </span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-px rounded-lg border border-stone-200">
          {hours.map((hour, si) => (
            <div key={si} className="contents">
              <div className="flex h-9 items-start justify-end border-b border-stone-100 pr-2 pt-0.5 text-[10px] text-stone-400">
                {si % 2 === 0 ? hour : ""}
              </div>
              {weekDays.map((day, di) => (
                <div
                  key={di}
                  className="relative h-9 cursor-pointer border-b border-l border-stone-100 hover:bg-stone-50/50"
                  onClick={() => {
                    if (!isBefore(day, startOfDay(new Date()))) {
                      onSlotClick(day, hour);
                    }
                  }}
                >
                  {si === 0 &&
                    dayBlocks[di]?.map((item, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight",
                          blockStyle(item.block),
                        )}
                        style={{
                          top: `${item.startSlot * SLOT_HEIGHT}px`,
                          height: `${(item.endSlot - item.startSlot) * SLOT_HEIGHT}px`,
                        }}
                      >
                        <div className="font-medium">
                          {item.block.startTime}–{item.block.endTime}
                        </div>
                        {item.block.reasonNote && (
                          <div className="truncate opacity-75">
                            {item.block.reasonNote}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Modal ──

function NewBlockModal({
  open,
  onOpenChange,
  defaults,
  onSubmit,
  isSubmitting,
  error,
  zoneThresholds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: { date?: Date; endDate?: Date; time?: string };
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
  error?: string;
  zoneThresholds?: ZoneThresholds;
}) {
  const t = useTranslations("coach");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-stone-100 px-5 pb-3 pt-5">
          <DialogTitle className="text-lg">{t("newBlock")}</DialogTitle>
          <DialogDescription className="text-sm">
            {t("newBlockDesc")}
          </DialogDescription>
        </DialogHeader>
        {/* Mount the form only when open so it fully re-initialises from defaults each time */}
        {open && (
          <NewBlockForm
            defaults={defaults}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
            isSubmitting={isSubmitting}
            error={error}
            zoneThresholds={zoneThresholds}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewBlockForm({
  defaults,
  onCancel,
  onSubmit,
  isSubmitting,
  error,
  zoneThresholds,
}: {
  defaults: { date?: Date; endDate?: Date; time?: string };
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
  error?: string;
  zoneThresholds?: ZoneThresholds;
}) {
  const t = useTranslations("coach");
  const initialStartDate = defaults.date
    ? format(defaults.date, "yyyy-MM-dd")
    : "";
  const initialEndDate = defaults.date
    ? format(defaults.endDate ?? defaults.date, "yyyy-MM-dd")
    : "";
  const initialStartTime = defaults.time ?? "";
  let initialEndTime = "";
  if (defaults.time) {
    const [h, m] = defaults.time.split(":").map(Number);
    initialEndTime = `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  const [type, setType] = useState<"one_time" | "recurring">("one_time");
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [reasonType, setReasonType] = useState<string>("vacation");
  const [reasonNote, setReasonNote] = useState("");

  const zone: Zone | null = useMemo(() => {
    if (type !== "one_time" || !startDate) return null;
    return getZone(new Date(startDate), zoneThresholds);
  }, [type, startDate, zoneThresholds]);

  const rangeDays = useMemo(() => {
    if (type !== "one_time" || !startDate || !endDate) return 0;
    return differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1;
  }, [type, startDate, endDate]);

  const canSubmit =
    !isSubmitting &&
    zone !== "red" &&
    (type === "one_time"
      ? startDate && endDate
      : selectedDays.length > 0 && startTime && endTime);

  function handleSubmit() {
    if (!canSubmit) return;
    const payload: Record<string, unknown> = {
      type,
      reasonType,
      reasonNote: reasonNote || null,
    };
    if (type === "one_time") {
      payload.startDate = startDate;
      payload.endDate = endDate;
      payload.isAllDay = !startTime && !endTime;
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
      payload.dayOfWeek = [];
    } else {
      payload.dayOfWeek = selectedDays;
      payload.startTime = startTime;
      payload.endTime = endTime;
      payload.isAllDay = false;
    }
    onSubmit(payload);
  }

  function toggleDay(d: number) {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-4">
          {/* Type — pill toggle (more mobile-friendly than dropdown) */}
            <div>
              <label className="mb-2 block text-sm font-medium text-stone-700">
                {t("blockType")}
              </label>
              <div className="inline-flex w-full rounded-lg bg-stone-100 p-1">
                <button
                  type="button"
                  onClick={() => setType("one_time")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                    type === "one_time"
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500",
                  )}
                >
                  {t("specificDates")}
                </button>
                <button
                  type="button"
                  onClick={() => setType("recurring")}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-all",
                    type === "recurring"
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500",
                  )}
                >
                  {t("recurringSchedule")}
                </button>
              </div>
            </div>

            {type === "one_time" ? (
              <>
                {startDate && endDate && (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2.5">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-700">
                      {t("selectedRange")}
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-indigo-900">
                      {format(new Date(startDate), "EEE d MMM", { locale: es })}
                      {startDate !== endDate &&
                        ` – ${format(new Date(endDate), "EEE d MMM", { locale: es })}`}
                    </div>
                    {rangeDays > 0 && (
                      <div className="mt-0.5 text-xs text-indigo-700">
                        {rangeDays === 1
                          ? t("oneDay")
                          : t("nDays", { n: rangeDays })}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700">
                      {t("from")}
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-stone-700">
                      {t("until")}
                    </label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-500">
                    {t("timeOptional")}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      placeholder="Desde"
                    />
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      placeholder="Hasta"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="mb-2 block text-sm font-medium text-stone-700">
                    {t("days")}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {DAY_LABELS.map((label, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleDay(i)}
                        className={cn(
                          "flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all",
                          selectedDays.includes(i)
                            ? "bg-[#3730B8] text-white"
                            : "border border-stone-200 text-stone-600 hover:border-stone-400 active:scale-95",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    {t("unavailableFrom")}
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Reason */}
            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                {t("reason")}
              </label>
              <Select value={reasonType} onValueChange={setReasonType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">{t("reasonVacation")}</SelectItem>
                  <SelectItem value="personal">{t("reasonPersonal")}</SelectItem>
                  <SelectItem value="training">{t("reasonTraining")}</SelectItem>
                  <SelectItem value="other">{t("reasonOther")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-stone-700">
                {t("note")}
              </label>
              <Input
                value={reasonNote}
                onChange={(e) => setReasonNote(e.target.value)}
                placeholder={t("optional")}
              />
            </div>

            {/* Zone warnings */}
            {zone === "yellow" && (
              <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
                {t("blockNeedsApproval")}
              </div>
            )}
            {zone === "red" && (
              <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-800">
                {t("contactAdminForChanges")}
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>
        </div>

      {/* Actions — sticky footer */}
      <div className="flex gap-3 border-t border-stone-100 bg-stone-50/50 px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
        >
          {t("cancelAction")}
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="flex-1 rounded-xl bg-[#1C2340] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1C2340]/90 disabled:opacity-50"
        >
          {isSubmitting ? t("saving") : t("saveBlock")}
        </button>
      </div>
    </>
  );
}

// ── Sidebar components ──

function SidebarSection({
  title,
  blocks,
  children,
}: {
  title: string;
  blocks: AvailabilityBlock[];
  children: React.ReactNode;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-stone-400">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DeleteButton({
  onClick,
  isDeleting,
  label,
}: {
  onClick: () => void;
  isDeleting: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={isDeleting}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 active:bg-red-100 disabled:opacity-50"
      aria-label={label}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function RecurringCard({
  block,
  onDelete,
  isDeleting,
}: {
  block: AvailabilityBlock;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const t = useTranslations("coach");
  const days = block.dayOfWeek.map((d) => DAY_LABELS[d]).join(", ");
  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-800">
              {t("recurring")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-stone-700">
            <Clock className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <span className="truncate">
              {days} · {block.startTime}–{block.endTime}
            </span>
          </div>
          {block.reasonNote && (
            <div className="mt-1 truncate text-xs text-stone-500">
              {block.reasonNote}
            </div>
          )}
        </div>
        <DeleteButton
          onClick={onDelete}
          isDeleting={isDeleting}
          label={t("deleteBlock")}
        />
      </div>
    </div>
  );
}

function PendingCard({
  block,
  onCancel,
  isDeleting,
}: {
  block: AvailabilityBlock;
  onCancel: () => void;
  isDeleting: boolean;
}) {
  const t = useTranslations("coach");
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {t("pending")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-stone-700">
            <CalendarOff className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <span className="truncate">
              {block.startDate &&
                format(new Date(block.startDate), "d MMM", { locale: es })}
              {block.endDate &&
                block.endDate !== block.startDate &&
                ` – ${format(new Date(block.endDate), "d MMM", { locale: es })}`}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-stone-500">
            {REASON_LABELS[block.reasonType]}
            {block.reasonNote ? ` · ${block.reasonNote}` : ""}
          </div>
          <div className="mt-2 text-[10px] text-amber-700">
            {t("pendingApproval48h")}
          </div>
        </div>
        <DeleteButton
          onClick={onCancel}
          isDeleting={isDeleting}
          label={t("cancelRequest")}
        />
      </div>
    </div>
  );
}

function ConfirmedCard({
  block,
  onDelete,
  zoneThresholds,
  isDeleting,
}: {
  block: AvailabilityBlock;
  onDelete: () => void;
  zoneThresholds?: ZoneThresholds;
  isDeleting: boolean;
}) {
  const t = useTranslations("coach");
  const zone: Zone | null =
    block.startDate ? getZone(new Date(block.startDate), zoneThresholds) : null;
  const canDelete = zone === "green" || zone === null;

  return (
    <div className="rounded-xl border border-stone-100 bg-stone-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
              {t("confirmed")}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-stone-700">
            <CalendarOff className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <span className="truncate">
              {block.startDate &&
                format(new Date(block.startDate), "d MMM", { locale: es })}
              {block.endDate &&
                block.endDate !== block.startDate &&
                ` – ${format(new Date(block.endDate), "d MMM", { locale: es })}`}
              {!block.isAllDay &&
                block.startTime &&
                ` · ${block.startTime}–${block.endTime}`}
            </span>
          </div>
          {block.reasonNote && (
            <div className="mt-1 truncate text-xs text-stone-500">
              {block.reasonNote}
            </div>
          )}
          {!canDelete && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
              <Info className="h-3 w-3" />
              {t("contactAdminToDelete")}
            </div>
          )}
        </div>
        {canDelete && (
          <DeleteButton
            onClick={onDelete}
            isDeleting={isDeleting}
            label={t("deleteBlock")}
          />
        )}
      </div>
    </div>
  );
}

function LegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-3 w-3 rounded-full", className)} />
      <span className="text-xs text-stone-500">{label}</span>
    </div>
  );
}

