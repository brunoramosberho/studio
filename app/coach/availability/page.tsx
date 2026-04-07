"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X as XIcon,
  Clock,
  CalendarOff,
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
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
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

const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const DAY_LABELS_FULL = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
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

function slotToTime(slot: number): string {
  const h = HOURS_START + Math.floor(slot / 2);
  const m = (slot % 2) * 30;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getJsDow(date: Date): number {
  const d = date.getDay();
  return d === 0 ? 6 : d - 1; // convert Sun=0..Sat=6 → Mon=0..Sun=6
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
  const queryClient = useQueryClient();
  const [view, setView] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDefaults, setModalDefaults] = useState<{
    date?: Date;
    time?: string;
  }>({});

  const { data: availData, isLoading } = useQuery({
    queryKey: ["coach-availability"],
    queryFn: fetchAvailability,
  });

  const blocks = availData?.blocks ?? [];
  const zoneThresholds: ZoneThresholds = {
    zoneRedDays: availData?.zoneRedDays,
    zoneYellowDays: availData?.zoneYellowDays,
  };

  const createMut = useMutation({
    mutationFn: createBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-availability"] });
      setModalOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteBlock,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["coach-availability"] }),
  });

  const recurring = blocks.filter(
    (b) => b.type === "recurring" && b.status === "active",
  );
  const pending = blocks.filter((b) => b.status === "pending_approval");
  const confirmed = blocks.filter(
    (b) => b.type === "one_time" && b.status === "active",
  );

  const openModal = useCallback(
    (defaults?: { date?: Date; time?: string }) => {
      setModalDefaults(defaults ?? {});
      setModalOpen(true);
    },
    [],
  );

  return (
    <div className="min-h-full bg-stone-50">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 lg:flex-row lg:p-6">
        {/* Left: calendar */}
        <div className="flex-1">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
            {/* Tabs + nav */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-stone-100 p-1">
                {(["month", "week"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
                      view === v
                        ? "border border-stone-200 bg-white text-stone-900 shadow-none"
                        : "text-stone-500 hover:text-stone-700",
                    )}
                  >
                    {v === "month" ? "Mes" : "Semana"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setCurrentDate((d) =>
                      view === "month" ? addMonths(d, -1) : addWeeks(d, -1),
                    )
                  }
                  className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <span className="min-w-[140px] text-center text-sm font-semibold capitalize text-stone-800">
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
                  className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex h-64 items-center justify-center text-stone-400">
                Cargando…
              </div>
            ) : view === "month" ? (
              <MonthView
                currentDate={currentDate}
                blocks={blocks}
                onDayClick={(d) => openModal({ date: d })}
              />
            ) : (
              <WeekView
                currentDate={currentDate}
                blocks={blocks}
                onSlotClick={(d, time) => openModal({ date: d, time })}
              />
            )}

            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-4 border-t border-stone-100 pt-4">
              <LegendDot className="bg-blue-100" label="Recurrente" />
              <LegendDot className="bg-stone-200" label="Confirmado" />
              <LegendDot className="bg-amber-100" label="Pendiente" />
            </div>
          </div>
        </div>

        {/* Right: sidebar */}
        <div className="w-full lg:w-80">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-6">
            <h2 className="mb-5 text-lg font-semibold text-stone-900">
              Mi disponibilidad
            </h2>

            <SidebarSection title="Recurrentes" blocks={recurring}>
              {recurring.map((b) => (
                <RecurringCard
                  key={b.id}
                  block={b}
                  onDelete={() => deleteMut.mutate(b.id)}
                />
              ))}
            </SidebarSection>

            <SidebarSection title="Pendientes de aprobación" blocks={pending}>
              {pending.map((b) => (
                <PendingCard key={b.id} block={b} />
              ))}
            </SidebarSection>

            <SidebarSection title="Confirmados" blocks={confirmed}>
              {confirmed.map((b) => (
                <ConfirmedCard
                  key={b.id}
                  block={b}
                  onDelete={() => deleteMut.mutate(b.id)}
                  zoneThresholds={zoneThresholds}
                />
              ))}
            </SidebarSection>

            <button
              onClick={() => openModal()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#1C2340] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1C2340]/90"
            >
              <Plus className="h-4 w-4" />
              Añadir bloqueo
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      <NewBlockModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        defaults={modalDefaults}
        onSubmit={(data) => createMut.mutate(data)}
        isSubmitting={createMut.isPending}
        error={createMut.error?.message}
        zoneThresholds={zoneThresholds}
      />
    </div>
  );
}

// ── Month view ──

function MonthView({
  currentDate,
  blocks,
  onDayClick,
}: {
  currentDate: Date;
  blocks: AvailabilityBlock[];
  onDayClick: (d: Date) => void;
}) {
  const monthStart = startOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const today = startOfDay(new Date());

  function getDayClasses(day: Date): string | null {
    const dow = getJsDow(day);

    for (const b of blocks) {
      if (b.type === "one_time" && b.startDate && b.endDate) {
        const s = startOfDay(new Date(b.startDate));
        const e = startOfDay(new Date(b.endDate));
        if (day >= s && day <= e) {
          return b.status === "pending_approval"
            ? "bg-amber-50 border-amber-200"
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
          const dayClass = getDayClasses(day);
          return (
            <button
              key={day.toISOString()}
              disabled={isPast}
              onClick={() => !isPast && onDayClick(day)}
              className={cn(
                "relative flex h-12 items-center justify-center rounded-lg text-sm transition-all sm:h-14",
                !inMonth && "text-stone-300",
                inMonth && !isPast && "text-stone-700 hover:bg-stone-50",
                isPast && "cursor-not-allowed text-stone-300",
                dayClass,
                isToday(day) && "font-bold",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full",
                  isToday(day) && "bg-[#3730B8] text-white",
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
  defaults: { date?: Date; time?: string };
  onSubmit: (data: Record<string, unknown>) => void;
  isSubmitting: boolean;
  error?: string;
  zoneThresholds?: ZoneThresholds;
}) {
  const [type, setType] = useState<"one_time" | "recurring">("one_time");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [reasonType, setReasonType] = useState<string>("vacation");
  const [reasonNote, setReasonNote] = useState("");

  const resetForm = useCallback(() => {
    setType("one_time");
    setStartDate("");
    setEndDate("");
    setStartTime("");
    setEndTime("");
    setSelectedDays([]);
    setReasonType("vacation");
    setReasonNote("");
  }, []);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (v) {
        resetForm();
        if (defaults.date) {
          setStartDate(format(defaults.date, "yyyy-MM-dd"));
          setEndDate(format(defaults.date, "yyyy-MM-dd"));
        }
        if (defaults.time) {
          setStartTime(defaults.time);
          const [h, m] = defaults.time.split(":").map(Number);
          setEndTime(
            `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
          );
        }
      }
      onOpenChange(v);
    },
    [defaults, onOpenChange, resetForm],
  );

  const zone: Zone | null = useMemo(() => {
    if (type !== "one_time" || !startDate) return null;
    return getZone(new Date(startDate), zoneThresholds);
  }, [type, startDate, zoneThresholds]);

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
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo bloqueo</DialogTitle>
          <DialogDescription>
            Marca los horarios o fechas en los que no estás disponible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Tipo
            </label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "one_time" | "recurring")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="one_time">Fechas específicas</SelectItem>
                <SelectItem value="recurring">Horario recurrente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "one_time" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Desde
                  </label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-stone-700">
                    Hasta
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
                  Horario (opcional, dejar vacío = todo el día)
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
                  Días
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all",
                        selectedDays.includes(i)
                          ? "bg-[#3730B8] text-white"
                          : "border border-stone-200 text-stone-600 hover:border-stone-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  No disponible de
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
              Motivo
            </label>
            <Select value={reasonType} onValueChange={setReasonType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">Vacaciones</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="training">Formación</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Nota
            </label>
            <Input
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {/* Zone warnings */}
          {zone === "yellow" && (
            <div className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Este bloqueo requiere aprobación del administrador
            </div>
          )}
          {zone === "red" && (
            <div className="rounded-lg bg-red-50 p-2 text-xs text-red-800">
              Para cambios en las próximas 2 semanas, contacta al administrador
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 rounded-xl border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleSubmit}
              className="flex-1 rounded-xl bg-[#1C2340] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1C2340]/90 disabled:opacity-50"
            >
              {isSubmitting ? "Guardando…" : "Guardar bloqueo"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

function RecurringCard({
  block,
  onDelete,
}: {
  block: AvailabilityBlock;
  onDelete: () => void;
}) {
  const days = block.dayOfWeek.map((d) => DAY_LABELS[d]).join(", ");
  return (
    <div className="group relative rounded-xl border border-stone-100 bg-stone-50 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-800">
          Recurrente
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-stone-700">
        <Clock className="h-3.5 w-3.5 text-stone-400" />
        {days} · {block.startTime}–{block.endTime}
      </div>
      {block.reasonNote && (
        <div className="mt-1 text-xs text-stone-500">{block.reasonNote}</div>
      )}
      <button
        onClick={onDelete}
        className="absolute right-2 top-2 rounded-full p-1 text-stone-400 opacity-0 transition-opacity hover:bg-stone-200 hover:text-stone-700 group-hover:opacity-100"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function PendingCard({ block }: { block: AvailabilityBlock }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
          Pendiente
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-stone-700">
        <CalendarOff className="h-3.5 w-3.5 text-stone-400" />
        {block.startDate &&
          format(new Date(block.startDate), "d MMM", { locale: es })}
        {block.endDate &&
          ` – ${format(new Date(block.endDate), "d MMM", { locale: es })}`}
      </div>
      <div className="mt-1 text-xs text-stone-500">
        {REASON_LABELS[block.reasonType]}
        {block.reasonNote ? ` · ${block.reasonNote}` : ""}
      </div>
      <div className="mt-2 text-[10px] text-amber-700">
        Pendiente de aprobación (hasta 48h)
      </div>
    </div>
  );
}

function ConfirmedCard({
  block,
  onDelete,
  zoneThresholds,
}: {
  block: AvailabilityBlock;
  onDelete: () => void;
  zoneThresholds?: ZoneThresholds;
}) {
  const zone: Zone | null =
    block.startDate ? getZone(new Date(block.startDate), zoneThresholds) : null;

  return (
    <div className="group relative rounded-xl border border-stone-100 bg-stone-50 p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
          Confirmado
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-stone-700">
        <CalendarOff className="h-3.5 w-3.5 text-stone-400" />
        {block.startDate &&
          format(new Date(block.startDate), "d MMM", { locale: es })}
        {block.endDate &&
          ` – ${format(new Date(block.endDate), "d MMM", { locale: es })}`}
        {!block.isAllDay &&
          block.startTime &&
          ` · ${block.startTime}–${block.endTime}`}
      </div>
      {block.reasonNote && (
        <div className="mt-1 text-xs text-stone-500">{block.reasonNote}</div>
      )}
      {zone === "green" && (
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 rounded-full p-1 text-stone-400 opacity-0 transition-opacity hover:bg-stone-200 hover:text-stone-700 group-hover:opacity-100"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
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
