"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Check,
  X as XIcon,
  ExternalLink,
} from "lucide-react";
import {
  format,
  addWeeks,
  addDays,
  startOfWeek,
  isToday as dateIsToday,
  isTomorrow,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import Link from "next/link";

// ── Types ──

interface AffectedClass {
  id: string;
  date: string;
  time: string;
  name: string;
  enrolled: number;
  capacity: number;
  substitute: {
    name: string;
    available: boolean;
    hasDiscipline: boolean;
  } | null;
}

interface PendingBlock {
  id: string;
  type: string;
  startDate: string | null;
  endDate: string | null;
  reasonType: string;
  reasonNote: string | null;
  coach: { id: string; name: string; email: string; image: string | null };
  coachColor: string;
  zone: "green" | "yellow" | "red";
  affectedClasses: AffectedClass[];
  uncoveredCount: number;
}

interface DayCoverage {
  date: string;
  label: string;
  dow: number;
  isToday: boolean;
  status: "available" | "partial" | "blocked" | "pending" | "empty";
  hasClass: boolean;
}

interface CoachCoverage {
  id: string;
  userId: string;
  name: string;
  image: string | null;
  color: string;
  initials: string;
  days: DayCoverage[];
}

interface CoverageData {
  coaches: CoachCoverage[];
  dayHeaders: {
    date: string;
    label: string;
    dayNum: string;
    isToday: boolean;
  }[];
  disciplines: string[];
  weekLabel: string;
}

type HourlySlot = {
  hour: number;
  status: "available" | "blocked" | "class" | "empty";
  className?: string;
};

interface HourlyCoach {
  coachId: string;
  coachProfileId: string;
  coachName: string;
  initials: string;
  color: string;
  disciplines: string[];
  image: string | null;
  slots: HourlySlot[];
}

interface HourlyData {
  coaches: HourlyCoach[];
  disciplines: string[];
  openHour: number;
  closeHour: number;
}

interface AvailabilitySettings {
  zoneRedDays: number;
  zoneYellowDays: number;
  studioOpenTime: string;
  studioCloseTime: string;
  operatingDays: number[];
  notifications: {
    emailOnRequest: boolean;
    pushOnRequest: boolean;
    gapDetected: boolean;
    weeklySummary: boolean;
    autoRejectTimeout: boolean;
  };
}

type TabId = "requests" | "coverage" | "hourly" | "settings";

function useReasonLabels() {
  const t = useTranslations("admin");
  return {
    vacation: t("reasonVacation"),
    personal: t("reasonPersonal"),
    training: t("reasonTraining"),
    other: t("reasonOther"),
  } as Record<string, string>;
}

// ── Data fetching ──

async function fetchPending(): Promise<PendingBlock[]> {
  const res = await fetch("/api/admin/availability/pending");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchCoverage(weekStart: string): Promise<CoverageData> {
  const res = await fetch(
    `/api/admin/availability/coverage?weekStart=${weekStart}`,
  );
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchHourly(date: string): Promise<HourlyData> {
  const res = await fetch(`/api/admin/availability/hourly?date=${date}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function fetchSettings(): Promise<AvailabilitySettings> {
  const res = await fetch("/api/admin/settings/availability");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function saveSettings(
  data: Partial<AvailabilitySettings>,
): Promise<AvailabilitySettings> {
  const res = await fetch("/api/admin/settings/availability", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to save");
  return res.json();
}

async function reviewBlock(
  id: string,
  data: { action: "approve" | "reject"; rejectionNote?: string },
) {
  const res = await fetch(`/api/admin/availability/${id}/review`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to review");
  }
  return res.json();
}

// ── Page ──

export default function AdminAvailabilityPage() {
  const t = useTranslations("admin");
  const [tab, setTab] = useState<TabId>("requests");

  const { data: pending = [] } = useQuery({
    queryKey: ["admin-availability-pending"],
    queryFn: fetchPending,
  });

  const pendingCount = pending.length;

  return (
    <div className="min-h-full bg-stone-50">
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {t("availability")}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {t("availabilitySubtitle")}
          </p>
        </div>

        <div className="inline-flex rounded-lg bg-stone-100 p-1">
          <TabButton
            active={tab === "requests"}
            onClick={() => setTab("requests")}
            badge={pendingCount > 0 ? pendingCount : undefined}
          >
            {t("availRequests")}
          </TabButton>
          <TabButton
            active={tab === "coverage"}
            onClick={() => setTab("coverage")}
          >
            {t("availTeamCoverage")}
          </TabButton>
          <TabButton
            active={tab === "hourly"}
            onClick={() => setTab("hourly")}
          >
            {t("availHourlyView")}
          </TabButton>
          <TabButton
            active={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            {t("settings")}
          </TabButton>
        </div>

        {tab === "requests" && <RequestsTab pending={pending} />}
        {tab === "coverage" && <CoverageTab />}
        {tab === "hourly" && <HourlyTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
        active
          ? "border border-stone-200 bg-card text-stone-900"
          : "text-stone-500 hover:text-stone-700",
      )}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Tab 1: Requests ──

function RequestsTab({ pending }: { pending: PendingBlock[] }) {
  const totalUncovered = pending.reduce((s, b) => s + b.uncoveredCount, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-stone-200 bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
            Solicitudes pendientes
          </p>
          <p className="mt-1 text-2xl font-bold text-stone-900">
            {pending.length}
          </p>
          <p className="text-xs text-stone-500">Requieren tu atención</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-card p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
            Clases sin cobertura
          </p>
          <p
            className={cn(
              "mt-1 text-2xl font-bold",
              totalUncovered > 0 ? "text-red-700" : "text-stone-900",
            )}
          >
            {totalUncovered}
          </p>
          <p className="text-xs text-stone-500">
            {pending.length > 0
              ? `Si se aprueban ${pending.length === 1 ? "la solicitud" : "ambas"}`
              : "Sin solicitudes"}
          </p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-card p-8 text-center">
          <p className="text-sm text-stone-500">
            No hay solicitudes pendientes
          </p>
        </div>
      ) : (
        pending.map((block) => (
          <RequestCard key={block.id} block={block} />
        ))
      )}
    </div>
  );
}

function RequestCard({ block }: { block: PendingBlock }) {
  const queryClient = useQueryClient();
  const REASON_LABELS = useReasonLabels();
  const [status, setStatus] = useState<
    "pending" | "approved" | "rejected" | "rejecting"
  >("pending");
  const [rejectionNote, setRejectionNote] = useState("");

  const mutation = useMutation({
    mutationFn: (data: {
      action: "approve" | "reject";
      rejectionNote?: string;
    }) => reviewBlock(block.id, data),
    onSuccess: (_, variables) => {
      setStatus(variables.action === "approve" ? "approved" : "rejected");
      queryClient.invalidateQueries({
        queryKey: ["admin-availability-pending"],
      });
    },
  });

  const initials = (block.coach.name || "C")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const dateRange =
    block.startDate && block.endDate
      ? `${format(new Date(block.startDate), "d", { locale: es })} – ${format(new Date(block.endDate), "d MMM", { locale: es })}`
      : "";

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-card">
      <div className="flex items-start gap-3 p-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: block.coachColor }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-stone-900">
              {block.coach.name}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                block.zone === "yellow"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-red-50 text-red-800",
              )}
            >
              Zona {block.zone === "yellow" ? "amarilla" : "roja"}
            </span>
          </div>
          <p className="text-sm text-stone-500">
            {dateRange} · {REASON_LABELS[block.reasonType] || block.reasonType}
            {block.reasonNote ? ` · ${block.reasonNote}` : ""}
          </p>
        </div>
      </div>

      {block.affectedClasses.length > 0 && (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-stone-400">
            Impacto si se aprueba
          </p>
          <div className="space-y-1.5">
            {block.affectedClasses.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <div
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    c.substitute ? "bg-emerald-500" : "bg-red-500",
                  )}
                />
                <span className="text-stone-700">
                  {c.date} · {c.time} {c.name} · {c.enrolled}/{c.capacity}{" "}
                  alumnos
                </span>
                <span
                  className={cn(
                    "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium",
                    c.substitute
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-700",
                  )}
                >
                  {c.substitute
                    ? `${c.substitute.name} disponible`
                    : "Sin cobertura"}
                </span>
              </div>
            ))}
          </div>

          {block.affectedClasses.some((c) => c.substitute || !c.substitute) && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-stone-400">
                Sustitutos sugeridos
              </p>
              <div className="space-y-1">
                {block.affectedClasses.map((c) => (
                  <div key={c.id} className="flex gap-2 text-xs">
                    <span className="min-w-[140px] text-stone-500">
                      {c.name} {c.date}
                    </span>
                    <span className="font-medium">→</span>
                    {c.substitute ? (
                      <span className="font-medium text-blue-700">
                        {c.substitute.name}
                        {c.substitute.available && " (disponible"}
                        {c.substitute.hasDiscipline
                          ? `, ${c.name} ✓)`
                          : ")"}
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">
                        Sin coach disponible
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-stone-100 px-4 py-3">
        {status === "approved" && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <Check className="h-4 w-4" />
            Solicitud aprobada — el coach ha sido notificado
          </div>
        )}
        {status === "rejected" && (
          <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            <XIcon className="h-4 w-4" />
            Solicitud rechazada — el coach ha sido notificado
          </div>
        )}
        {status === "rejecting" && (
          <div className="flex gap-2">
            <Input
              value={rejectionNote}
              onChange={(e) => setRejectionNote(e.target.value)}
              placeholder="Motivo del rechazo (opcional)"
              className="flex-1 rounded-xl border-stone-200 text-sm"
            />
            <button
              onClick={() =>
                mutation.mutate({
                  action: "reject",
                  rejectionNote: rejectionNote || undefined,
                })
              }
              disabled={mutation.isPending}
              className="shrink-0 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50"
            >
              Enviar rechazo
            </button>
            <button
              onClick={() => setStatus("pending")}
              className="shrink-0 rounded-xl border border-stone-200 px-3 py-2 text-sm text-stone-500 transition-colors hover:bg-stone-50"
            >
              Cancelar
            </button>
          </div>
        )}
        {status === "pending" && (
          <div className="flex gap-3">
            <button
              onClick={() => setStatus("rejecting")}
              className="flex-1 rounded-xl border border-stone-200 px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-50"
            >
              Rechazar
            </button>
            <button
              onClick={() => mutation.mutate({ action: "approve" })}
              disabled={mutation.isPending}
              className="flex-1 rounded-xl bg-[#1C2340] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1C2340]/90 disabled:opacity-50"
            >
              {mutation.isPending ? "Aprobando…" : "Aprobar solicitud"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab 2: Coverage ──

function CoverageTab() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [disciplineFilter, setDisciplineFilter] = useState<string | null>(null);

  const weekStart = useMemo(() => {
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(base, weekOffset);
  }, [weekOffset]);

  const weekStartStr = format(weekStart, "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["admin-availability-coverage", weekStartStr],
    queryFn: () => fetchCoverage(weekStartStr),
  });

  const { data: pending = [] } = useQuery({
    queryKey: ["admin-availability-pending"],
    queryFn: fetchPending,
  });

  const totalGaps = pending.reduce((s, b) => s + b.uncoveredCount, 0);

  return (
    <div className="space-y-4">
      {totalGaps > 0 && (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="text-sm font-medium text-red-800">
              {totalGaps} gap{totalGaps !== 1 ? "s" : ""} detectado
              {totalGaps !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-red-700">
              Hay clases que quedarían sin coach si se aprueban las solicitudes
              pendientes. Revisa las solicitudes pendientes.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[160px] text-center text-sm font-semibold text-stone-800">
            {data?.weekLabel ?? "…"}
          </span>
          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {data && data.disciplines.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setDisciplineFilter(null)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-all",
                !disciplineFilter
                  ? "bg-[#1C2340] text-white"
                  : "border border-stone-200 text-stone-500 hover:border-stone-400",
              )}
            >
              Todos
            </button>
            {data.disciplines.map((d) => (
              <button
                key={d}
                onClick={() =>
                  setDisciplineFilter(disciplineFilter === d ? null : d)
                }
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-all",
                  disciplineFilter === d
                    ? "bg-[#1C2340] text-white"
                    : "border border-stone-200 text-stone-500 hover:border-stone-400",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {data && (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-card p-4">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: "80px repeat(7, 1fr)" }}
          >
            <div />
            {data.dayHeaders.map((dh) => (
              <div key={dh.date} className="flex flex-col items-center py-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                  {dh.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs font-semibold",
                    dh.isToday
                      ? "bg-[#3730B8] text-white"
                      : "text-stone-700",
                  )}
                >
                  {dh.dayNum}
                </span>
              </div>
            ))}

            {data.coaches.map((coach) => (
              <div key={coach.id} className="contents">
                <div className="flex h-[38px] items-center gap-2 pr-2">
                  <div
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ backgroundColor: coach.color }}
                  >
                    {coach.initials}
                  </div>
                  <span className="truncate text-xs font-medium text-stone-700">
                    {coach.name.split(" ")[0]}
                  </span>
                </div>
                {coach.days.map((day) => (
                  <div
                    key={day.date}
                    className={cn(
                      "h-[38px] rounded-sm transition-colors",
                      statusCellClass(day.status),
                    )}
                    style={
                      day.status === "pending"
                        ? {
                            backgroundImage:
                              "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251,191,36,0.3) 3px, rgba(251,191,36,0.3) 6px)",
                          }
                        : undefined
                    }
                    title={`${coach.name} · ${day.label} · ${statusLabel(day.status)}`}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 border-t border-stone-100 pt-3">
            <LegendItem className="bg-emerald-50" label="Disponible" />
            <LegendItem className="bg-stone-200" label="Bloqueado (recurrente)" />
            <LegendItem
              className="bg-amber-50"
              pattern
              label="Pendiente aprobación"
            />
            <LegendItem className="bg-red-50" label="Sin cobertura" />
            <LegendItem className="bg-stone-50" label="No programado" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Hourly ──

function HourlyTab() {
  const [dayOffset, setDayOffset] = useState(0);
  const [filterDiscipline, setFilterDiscipline] = useState<string | null>(null);
  const [filterHour, setFilterHour] = useState<number | null>(null);

  const selectedDate = useMemo(() => addDays(new Date(), dayOffset), [dayOffset]);
  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["admin-availability-hourly", dateStr],
    queryFn: () => fetchHourly(dateStr),
  });

  const dayLabel = useMemo(() => {
    if (dateIsToday(selectedDate)) return `Hoy · ${format(selectedDate, "EEEE d MMM", { locale: es })}`;
    if (isTomorrow(selectedDate)) return `Mañana · ${format(selectedDate, "EEEE d MMM", { locale: es })}`;
    return format(selectedDate, "EEEE d MMM", { locale: es });
  }, [selectedDate]);

  const hours = useMemo(() => {
    if (!data) return [];
    const arr: number[] = [];
    for (let h = data.openHour; h < data.closeHour; h++) arr.push(h);
    return arr;
  }, [data]);

  const filteredCoaches = useMemo(() => {
    if (!data) return [];
    return data.coaches;
  }, [data]);

  const searchResult = useMemo(() => {
    if (!data || filterDiscipline === null || filterHour === null) return null;
    const matching = data.coaches.filter((c) => {
      const hasDiscipline = c.disciplines.some(
        (s) => s.toLowerCase() === filterDiscipline!.toLowerCase(),
      );
      if (!hasDiscipline) return false;
      const slot = c.slots.find((s) => s.hour === filterHour);
      return slot && slot.status === "available";
    });
    return matching;
  }, [data, filterDiscipline, filterHour]);

  const nowLineRef = useRef<HTMLDivElement>(null);
  const [nowMinutes, setNowMinutes] = useState(new Date().getMinutes());

  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(new Date().getMinutes()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const currentHour = new Date().getHours();
  const isCurrentDay = dateIsToday(selectedDate);

  return (
    <div className="space-y-4">
      {/* Quick search */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-stone-100 p-3">
        <span className="text-sm text-stone-600">¿Quién puede cubrir</span>
        <select
          value={filterDiscipline ?? ""}
          onChange={(e) => setFilterDiscipline(e.target.value || null)}
          className="rounded-lg border border-stone-200 bg-card px-3 py-1.5 text-sm text-stone-800"
        >
          <option value="">Disciplina</option>
          {(data?.disciplines ?? []).map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <span className="text-sm text-stone-600">a las</span>
        <select
          value={filterHour ?? ""}
          onChange={(e) => setFilterHour(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-stone-200 bg-card px-3 py-1.5 text-sm text-stone-800"
        >
          <option value="">Hora</option>
          {hours.map((h) => (
            <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
          ))}
        </select>
        {searchResult !== null && (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium",
              searchResult.length > 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-red-100 text-red-800",
            )}
          >
            {searchResult.length > 0
              ? `${searchResult.map((c) => c.coachName.split(" ")[0]).join(", ")} disponible${searchResult.length > 1 ? "s" : ""}`
              : `Nadie disponible a las ${String(filterHour).padStart(2, "0")}:00`}
          </span>
        )}
      </div>

      {/* Day navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDayOffset((v) => v - 1)}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[200px] text-center text-sm font-semibold capitalize text-stone-800">
            {dayLabel}
          </span>
          <button
            onClick={() => setDayOffset((v) => v + 1)}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        {dayOffset !== 0 && (
          <button
            onClick={() => setDayOffset(0)}
            className="rounded-lg border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
          >
            Hoy
          </button>
        )}
      </div>

      {/* Grid */}
      {data && (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-card p-4">
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `44px repeat(${filteredCoaches.length}, 1fr)`,
            }}
          >
            {/* Coach header */}
            <div />
            {filteredCoaches.map((c) => {
              const dimmed =
                filterDiscipline &&
                !c.disciplines.some(
                  (s) => s.toLowerCase() === filterDiscipline.toLowerCase(),
                );
              return (
                <div
                  key={c.coachId}
                  className={cn(
                    "flex flex-col items-center gap-1 pb-2",
                    dimmed && "opacity-30",
                  )}
                >
                  <div
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ backgroundColor: c.color }}
                  >
                    {c.initials}
                  </div>
                  <span className="text-[10px] font-medium text-stone-600 truncate max-w-[60px]">
                    {c.coachName.split(" ")[0]}
                  </span>
                </div>
              );
            })}

            {/* Hour rows */}
            {hours.map((hour) => (
              <div key={hour} className="contents">
                <div className="relative flex h-10 items-center justify-end border-b border-stone-100 pr-2">
                  <span className="text-[10px] text-stone-400">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>
                {filteredCoaches.map((c) => {
                  const slot = c.slots.find((s) => s.hour === hour);
                  const st = slot?.status ?? "empty";
                  return (
                    <div
                      key={c.coachId}
                      className={cn(
                        "relative h-10 border-b border-stone-100",
                        st === "available" && "bg-emerald-50",
                        st === "blocked" && "bg-stone-100",
                        st === "class" && "bg-blue-50",
                        st === "empty" && "bg-stone-50",
                      )}
                    >
                      {st === "class" && slot?.className && (
                        <div className="absolute inset-[2px] flex items-center justify-center rounded bg-blue-100">
                          <span className="truncate px-1 text-[9px] font-medium text-blue-900">
                            {slot.className}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Now line */}
                {isCurrentDay && hour === currentHour && (
                  <div
                    ref={nowLineRef}
                    className="pointer-events-none absolute left-0 right-0"
                    style={{
                      top: `calc(${(hours.indexOf(hour)) * 40 + 40}px + ${(nowMinutes / 60) * 40}px)`,
                    }}
                  >
                    <div className="relative flex items-center">
                      <div className="h-[6px] w-[6px] rounded-full bg-red-500" />
                      <div className="h-[1.5px] flex-1 bg-red-500" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap gap-4 border-t border-stone-100 pt-3">
            <LegendItem className="bg-emerald-50" label="Disponible" />
            <LegendItem className="bg-blue-50" label="Clase programada" />
            <LegendItem className="bg-stone-100" label="Bloqueado" />
            <LegendItem className="bg-stone-50" label="Sin programar" />
            <div className="flex items-center gap-1.5">
              <div className="h-[1.5px] w-3 bg-red-500" />
              <span className="text-xs text-stone-500">Ahora</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 4: Settings ──

function SettingsTab() {
  const [section, setSection] = useState<"zones" | "notifications" | "hours">("zones");

  return (
    <div className="flex gap-0 overflow-hidden rounded-2xl border border-stone-200 bg-card">
      {/* Sidebar */}
      <div className="w-[200px] shrink-0 border-r border-stone-200 bg-stone-50 p-2">
        <p className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-stone-400">
          Sistema
        </p>
        <SettingsNavItem
          active={section === "zones"}
          onClick={() => setSection("zones")}
        >
          Zonas de tiempo
        </SettingsNavItem>
        <SettingsNavItem
          active={section === "notifications"}
          onClick={() => setSection("notifications")}
        >
          Notificaciones
        </SettingsNavItem>
        <p className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-wider text-stone-400">
          Estudio
        </p>
        <SettingsNavItem
          active={section === "hours"}
          onClick={() => setSection("hours")}
        >
          Horario
        </SettingsNavItem>
        <Link
          href="/admin/coaches"
          className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-stone-500 hover:bg-card"
        >
          Coaches
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 p-6">
        {section === "zones" && <ZonesSection />}
        {section === "notifications" && <NotificationsSection />}
        {section === "hours" && <HoursSection />}
      </div>
    </div>
  );
}

function SettingsNavItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-xl px-3 py-2 text-left text-sm",
        active
          ? "border border-stone-200 bg-card font-medium text-stone-900"
          : "text-stone-500 hover:bg-card",
      )}
    >
      {children}
    </button>
  );
}

function ZonesSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin-availability-settings"],
    queryFn: fetchSettings,
  });

  const [redDays, setRedDays] = useState<number | null>(null);
  const [yellowDays, setYellowDays] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const currentRed = redDays ?? settings?.zoneRedDays ?? 14;
  const currentYellow = yellowDays ?? settings?.zoneYellowDays ?? 30;

  const mutation = useMutation({
    mutationFn: () =>
      saveSettings({ zoneRedDays: currentRed, zoneYellowDays: currentYellow }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-availability-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const dirty =
    settings &&
    (currentRed !== settings.zoneRedDays || currentYellow !== settings.zoneYellowDays);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">
          Zona roja — cambio bloqueado
        </h3>
        <p className="mt-0.5 text-xs text-stone-500">
          Menos de X días → solo el admin puede modificar
        </p>
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={currentYellow - 1}
            value={currentRed}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRedDays(v);
            }}
            className="w-16 rounded-xl border border-stone-200 p-2 text-center text-sm font-medium"
          />
          <span className="text-sm text-stone-500">días antes de la clase</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-stone-900">
          Zona amarilla — requiere aprobación
        </h3>
        <p className="mt-0.5 text-xs text-stone-500">
          Entre {currentRed} y Y días → el coach solicita y el admin aprueba
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-16 rounded-xl border border-stone-100 bg-stone-50 p-2 text-center text-sm font-medium text-stone-400">
            {currentRed}
          </span>
          <span className="text-sm text-stone-500">a</span>
          <input
            type="number"
            min={currentRed + 1}
            max={180}
            value={currentYellow}
            onChange={(e) => setYellowDays(Number(e.target.value))}
            className="w-16 rounded-xl border border-stone-200 p-2 text-center text-sm font-medium"
          />
          <span className="text-sm text-stone-500">días antes</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-stone-900">
          Zona verde — modificación libre
        </h3>
        <p className="mt-0.5 text-xs text-stone-500">
          Más de {currentYellow} días → el coach edita sin restricciones
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-stone-500">Más de</span>
          <span className="w-16 rounded-xl border border-stone-100 bg-stone-50 p-2 text-center text-sm font-medium text-stone-400">
            {currentYellow}
          </span>
          <span className="text-sm text-stone-500">días antes</span>
        </div>
      </div>

      {/* Preview bar */}
      <div>
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className="bg-red-400" style={{ flex: currentRed }} />
          <div className="bg-amber-400" style={{ flex: currentYellow - currentRed }} />
          <div className="bg-emerald-400" style={{ flex: 90 - currentYellow }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-stone-400">
          <span>0 días</span>
          <span>{currentRed}d</span>
          <span>{currentYellow}d</span>
          <span>90+ días</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!dirty || mutation.isPending}
          className="rounded-xl bg-[#1C2340] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {mutation.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved && (
          <span className="text-xs text-emerald-700">Cambios guardados</span>
        )}
      </div>
    </div>
  );
}

function NotificationsSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin-availability-settings"],
    queryFn: fetchSettings,
  });

  const [overrides, setOverrides] = useState<
    Partial<AvailabilitySettings["notifications"]>
  >({});
  const [saved, setSaved] = useState(false);

  const current = {
    emailOnRequest: overrides.emailOnRequest ?? settings?.notifications.emailOnRequest ?? true,
    pushOnRequest: overrides.pushOnRequest ?? settings?.notifications.pushOnRequest ?? true,
    gapDetected: overrides.gapDetected ?? settings?.notifications.gapDetected ?? true,
    weeklySummary: overrides.weeklySummary ?? settings?.notifications.weeklySummary ?? false,
    autoRejectTimeout: overrides.autoRejectTimeout ?? settings?.notifications.autoRejectTimeout ?? false,
  };

  const toggle = useCallback(
    (key: keyof typeof current) => {
      setOverrides((prev) => ({ ...prev, [key]: !current[key] }));
    },
    [current],
  );

  const mutation = useMutation({
    mutationFn: () => saveSettings({ notifications: current }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-availability-settings"] });
      setOverrides({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const dirty = settings && Object.keys(overrides).length > 0;

  const ITEMS: {
    key: keyof typeof current;
    label: string;
    description: string;
  }[] = [
    {
      key: "emailOnRequest",
      label: "Email al recibir solicitud",
      description: "Te avisamos cuando un coach envía una solicitud zona amarilla",
    },
    {
      key: "pushOnRequest",
      label: "Push al recibir solicitud",
      description: "Notificación push en el navegador",
    },
    {
      key: "gapDetected",
      label: "Alerta de gap detectado",
      description: "Aviso cuando una semana tiene clases sin cobertura confirmada",
    },
    {
      key: "weeklySummary",
      label: "Resumen semanal de cobertura",
      description: "Email cada lunes con el estado del equipo para esa semana",
    },
    {
      key: "autoRejectTimeout",
      label: "Timeout de aprobación",
      description: "Auto-rechazar solicitudes sin respuesta después de 48h",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {ITEMS.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between gap-4"
          >
            <div>
              <p className="text-sm font-medium text-stone-900">{item.label}</p>
              <p className="text-xs text-stone-500">{item.description}</p>
            </div>
            <button
              onClick={() => toggle(item.key)}
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                current[item.key] ? "bg-[#3730B8]" : "bg-stone-300",
              )}
            >
              <div
                className={cn(
                  "absolute top-[3px] h-3.5 w-3.5 rounded-full bg-card transition-transform",
                  current[item.key] ? "left-[18px]" : "left-[3px]",
                )}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!dirty || mutation.isPending}
          className="rounded-xl bg-[#1C2340] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {mutation.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved && (
          <span className="text-xs text-emerald-700">Cambios guardados</span>
        )}
      </div>
    </div>
  );
}

function HoursSection() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["admin-availability-settings"],
    queryFn: fetchSettings,
  });

  const [openTime, setOpenTime] = useState<string | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);
  const [days, setDays] = useState<number[] | null>(null);
  const [saved, setSaved] = useState(false);

  const currentOpen = openTime ?? settings?.studioOpenTime ?? "07:00";
  const currentClose = closeTime ?? settings?.studioCloseTime ?? "21:00";
  const currentDays = days ?? settings?.operatingDays ?? [0, 1, 2, 3, 4];

  const toggleDay = (d: number) => {
    const cur = [...currentDays];
    if (cur.includes(d)) {
      setDays(cur.filter((x) => x !== d));
    } else {
      setDays([...cur, d].sort());
    }
  };

  const mutation = useMutation({
    mutationFn: () =>
      saveSettings({
        studioOpenTime: currentOpen,
        studioCloseTime: currentClose,
        operatingDays: currentDays,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-availability-settings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const dirty =
    settings &&
    (currentOpen !== settings.studioOpenTime ||
      currentClose !== settings.studioCloseTime ||
      JSON.stringify(currentDays) !== JSON.stringify(settings.operatingDays));

  const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">
          Horario de apertura
        </h3>
        <div className="mt-2 flex items-center gap-3">
          <div>
            <label className="text-xs text-stone-500">Desde</label>
            <input
              type="time"
              value={currentOpen}
              onChange={(e) => setOpenTime(e.target.value)}
              className="mt-1 block rounded-xl border border-stone-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-stone-500">Hasta</label>
            <input
              type="time"
              value={currentClose}
              onChange={(e) => setCloseTime(e.target.value)}
              className="mt-1 block rounded-xl border border-stone-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-stone-900">
          Días de operación
        </h3>
        <div className="mt-2 flex gap-2">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => toggleDay(i)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                currentDays.includes(i)
                  ? "border-[#3730B8] bg-[#3730B8] text-white"
                  : "border-stone-200 text-stone-500",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Coach redirect */}
      <div className="flex items-center justify-between rounded-2xl border border-stone-200 p-4">
        <div>
          <p className="text-sm font-medium text-stone-900">
            Disciplinas por coach
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            Configura qué puede impartir cada coach desde la sección de Coaches
          </p>
        </div>
        <Link
          href="/admin/coaches"
          className="flex items-center gap-1 text-xs font-medium text-[#3730B8]"
        >
          Ir a Coaches
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!dirty || mutation.isPending}
          className="rounded-xl bg-[#1C2340] px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {mutation.isPending ? "Guardando…" : "Guardar cambios"}
        </button>
        {saved && (
          <span className="text-xs text-emerald-700">Cambios guardados</span>
        )}
      </div>
    </div>
  );
}

// ── Shared helpers ──

function statusCellClass(
  status: "available" | "partial" | "blocked" | "pending" | "empty",
): string {
  switch (status) {
    case "available":
      return "bg-emerald-50";
    case "partial":
      return "bg-amber-50";
    case "blocked":
      return "bg-stone-200";
    case "pending":
      return "bg-amber-50";
    case "empty":
      return "bg-stone-50";
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    available: "Disponible",
    partial: "Parcialmente bloqueado",
    blocked: "Bloqueado",
    pending: "Pendiente de aprobación",
    empty: "No programado",
  };
  return labels[status] || status;
}

function LegendItem({
  className,
  label,
  pattern,
}: {
  className: string;
  label: string;
  pattern?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn("h-3 w-3 rounded-sm", className)}
        style={
          pattern
            ? {
                backgroundImage:
                  "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(251,191,36,0.3) 2px, rgba(251,191,36,0.3) 4px)",
              }
            : undefined
        }
      />
      <span className="text-xs text-stone-500">{label}</span>
    </div>
  );
}
