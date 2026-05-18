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
  Plus,
} from "lucide-react";
import {
  format,
  addWeeks,
  addMonths,
  addDays,
  startOfWeek,
  startOfMonth,
  isSameMonth,
  isToday as dateIsToday,
  isTomorrow,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { SectionTabs } from "@/components/admin/section-tabs";
import { TEAM_TABS } from "@/components/admin/section-tab-configs";

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
  view: "week" | "month";
  coaches: CoachCoverage[];
  dayHeaders: {
    date: string;
    label: string;
    dayNum: string;
    isToday: boolean;
  }[];
  disciplines: string[];
  weekLabel: string;
  rangeStart: string;
  rangeEnd: string;
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

async function fetchCoverage(
  weekStart: string,
  view: "week" | "month" = "week",
): Promise<CoverageData> {
  const res = await fetch(
    `/api/admin/availability/coverage?weekStart=${weekStart}&view=${view}`,
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
        <SectionTabs tabs={TEAM_TABS} ariaLabel="Team sections" />
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {t("availability")}
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {t("availabilitySubtitle")}
          </p>
        </div>

        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex w-max max-w-none rounded-lg bg-stone-100 p-1 whitespace-nowrap">
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
        </div>

        {tab === "requests" && <RequestsTab pending={pending} />}
        {tab === "coverage" && (
          <CoverageTab onGoToRequests={() => setTab("requests")} />
        )}
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

interface SelectedCell {
  coachUserId: string;
  coachName: string;
  coachColor: string;
  coachInitials: string;
  date: string;
  dateLabel: string;
  status: "available" | "partial" | "blocked" | "pending" | "empty";
}

// State for the "create block" dialog. `open` means the admin clicked the
// global "Add block" CTA (no prefill); `prefilled` means they clicked a
// specific empty/available cell and we should pre-populate the coach +
// date in the form.
type CreateBlockOpen =
  | { kind: "open" }
  | {
      kind: "prefilled";
      coachUserId: string;
      coachName: string;
      date: string;
    };

function CoverageTab({ onGoToRequests }: { onGoToRequests: () => void }) {
  const [view, setView] = useState<"week" | "month">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [disciplineFilter, setDisciplineFilter] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [createBlock, setCreateBlock] = useState<CreateBlockOpen | null>(null);

  const anchorDate = useMemo(() => {
    if (view === "month") {
      return addMonths(startOfMonth(new Date()), monthOffset);
    }
    const base = startOfWeek(new Date(), { weekStartsOn: 1 });
    return addWeeks(base, weekOffset);
  }, [view, weekOffset, monthOffset]);

  const anchorDateStr = format(anchorDate, "yyyy-MM-dd");

  const { data } = useQuery({
    queryKey: ["admin-availability-coverage", anchorDateStr, view],
    queryFn: () => fetchCoverage(anchorDateStr, view),
  });

  const { data: pending = [] } = useQuery({
    queryKey: ["admin-availability-pending"],
    queryFn: fetchPending,
  });

  const totalGaps = pending.reduce((s, b) => s + b.uncoveredCount, 0);

  // Group days into weeks of 7 for the month view's calendar-style layout.
  const dayGroups = useMemo<CoverageData["dayHeaders"][]>(() => {
    if (!data) return [];
    const groups: CoverageData["dayHeaders"][] = [];
    for (let i = 0; i < data.dayHeaders.length; i += 7) {
      groups.push(data.dayHeaders.slice(i, i + 7));
    }
    return groups;
  }, [data]);

  function handlePrev() {
    if (view === "month") setMonthOffset((v) => v - 1);
    else setWeekOffset((v) => v - 1);
  }
  function handleNext() {
    if (view === "month") setMonthOffset((v) => v + 1);
    else setWeekOffset((v) => v + 1);
  }

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
            onClick={handlePrev}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-[180px] text-center text-sm font-semibold capitalize text-stone-800">
            {data?.weekLabel ?? "…"}
          </span>
          <button
            onClick={handleNext}
            className="rounded-lg p-1.5 text-stone-500 transition-colors hover:bg-stone-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="ml-2 inline-flex rounded-lg bg-stone-100 p-0.5">
            <button
              onClick={() => setView("week")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                view === "week"
                  ? "bg-card text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              Semana
            </button>
            <button
              onClick={() => setView("month")}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                view === "month"
                  ? "bg-card text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              Mes
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCreateBlock({ kind: "open" })}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-[#1C2340] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#252d52]"
          >
            <Plus className="h-3.5 w-3.5" />
            Añadir bloqueo
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

      {data && view === "week" && (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-card p-4">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: "minmax(72px, 96px) repeat(7, minmax(0, 1fr))" }}
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
                {coach.days.map((day) => {
                  const pattern = statusCellPattern(day.status);
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() =>
                        setSelectedCell({
                          coachUserId: coach.userId,
                          coachName: coach.name,
                          coachColor: coach.color,
                          coachInitials: coach.initials,
                          date: day.date,
                          dateLabel: day.label,
                          status: day.status,
                        })
                      }
                      className={cn(
                        "h-[38px] w-full rounded-sm transition-colors hover:ring-2 hover:ring-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400",
                        statusCellClass(day.status),
                      )}
                      style={pattern ? { backgroundImage: pattern } : undefined}
                      title={`${coach.name} · ${day.label} · ${statusLabel(day.status)}`}
                      aria-label={`${coach.name} ${day.label}: ${statusLabel(day.status)}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <CoverageLegend />
        </div>
      )}

      {data && view === "month" && (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-card p-4">
          <div className="space-y-3">
            {dayGroups.map((week, weekIdx) => {
              const firstOfMonth = data.dayHeaders.find(
                (d) => new Date(d.date).getDate() === 1,
              );
              const monthDate = firstOfMonth
                ? new Date(firstOfMonth.date)
                : new Date(data.rangeStart);
              return (
                <div key={weekIdx}>
                  <div
                    className="grid gap-px"
                    style={{ gridTemplateColumns: "minmax(72px, 96px) repeat(7, minmax(0, 1fr))" }}
                  >
                    <div />
                    {week.map((dh) => {
                      const dayDate = new Date(dh.date);
                      const outOfMonth = !isSameMonth(dayDate, monthDate);
                      return (
                        <div
                          key={dh.date}
                          className="flex flex-col items-center py-1"
                        >
                          {weekIdx === 0 && (
                            <span className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
                              {dh.label}
                            </span>
                          )}
                          <span
                            className={cn(
                              "mt-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-semibold",
                              dh.isToday
                                ? "bg-[#3730B8] text-white"
                                : outOfMonth
                                  ? "text-stone-300"
                                  : "text-stone-700",
                            )}
                          >
                            {dh.dayNum}
                          </span>
                        </div>
                      );
                    })}

                    {data.coaches.map((coach) => (
                      <div key={coach.id} className="contents">
                        <div className="flex h-[24px] items-center gap-2 pr-2">
                          {weekIdx === 0 ? (
                            <>
                              <div
                                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
                                style={{ backgroundColor: coach.color }}
                              >
                                {coach.initials}
                              </div>
                              <span className="truncate text-xs font-medium text-stone-700">
                                {coach.name.split(" ")[0]}
                              </span>
                            </>
                          ) : (
                            <span className="truncate text-[10px] text-stone-400">
                              {coach.name.split(" ")[0]}
                            </span>
                          )}
                        </div>
                        {week.map((dh) => {
                          const day = coach.days.find((d) => d.date === dh.date);
                          if (!day) {
                            return (
                              <div
                                key={dh.date}
                                className="h-[24px] rounded-sm bg-stone-50/40"
                              />
                            );
                          }
                          const dayDate = new Date(dh.date);
                          const outOfMonth = !isSameMonth(dayDate, monthDate);
                          const pattern = statusCellPattern(day.status);
                          return (
                            <button
                              key={dh.date}
                              type="button"
                              onClick={() =>
                                setSelectedCell({
                                  coachUserId: coach.userId,
                                  coachName: coach.name,
                                  coachColor: coach.color,
                                  coachInitials: coach.initials,
                                  date: day.date,
                                  dateLabel: day.label,
                                  status: day.status,
                                })
                              }
                              className={cn(
                                "h-[24px] w-full rounded-sm transition-colors hover:ring-2 hover:ring-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400",
                                statusCellClass(day.status),
                                outOfMonth && "opacity-30",
                              )}
                              style={pattern ? { backgroundImage: pattern } : undefined}
                              title={`${coach.name} · ${day.label} · ${statusLabel(day.status)}`}
                              aria-label={`${coach.name} ${day.label}: ${statusLabel(day.status)}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <CoverageLegend />
        </div>
      )}

      <CellDetailDialog
        cell={selectedCell}
        onClose={() => setSelectedCell(null)}
        onGoToRequests={() => {
          setSelectedCell(null);
          onGoToRequests();
        }}
        onBlockDay={(c) => {
          setSelectedCell(null);
          setCreateBlock({
            kind: "prefilled",
            coachUserId: c.coachUserId,
            coachName: c.coachName,
            date: c.date,
          });
        }}
      />

      <CreateBlockDialog
        state={createBlock}
        coaches={data?.coaches ?? []}
        onClose={() => setCreateBlock(null)}
      />
    </div>
  );
}

function CellDetailDialog({
  cell,
  onClose,
  onGoToRequests,
  onBlockDay,
}: {
  cell: SelectedCell | null;
  onClose: () => void;
  onGoToRequests: () => void;
  onBlockDay: (cell: SelectedCell) => void;
}) {
  // Render nothing once the cell is cleared so the Radix portal also unmounts
  // — keeps the page interactive in case the dialog's transition lags.
  if (!cell) return null;

  const dateStr = format(new Date(cell.date), "EEEE d 'de' MMMM", { locale: es });
  const description = cellStatusDescription(cell.status);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-0 sm:max-w-md">
        <DialogTitle className="sr-only">
          {cell.coachName} — {statusLabel(cell.status)}
        </DialogTitle>
        <div className="space-y-4 p-5">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: cell.coachColor }}
            >
              {cell.coachInitials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-900">
                {cell.coachName}
              </p>
              <p className="truncate text-xs capitalize text-stone-500">
                {dateStr}
              </p>
            </div>
          </div>

          <div
            className={cn(
              "flex items-start gap-3 rounded-xl border border-stone-100 p-3",
            )}
          >
            <div
              className={cn(
                "mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-stone-200/60",
                statusCellClass(cell.status),
              )}
              style={(() => {
                const p = statusCellPattern(cell.status);
                return p ? { backgroundImage: p } : undefined;
              })()}
            />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-stone-800">
                {statusLabel(cell.status)}
              </p>
              <p className="text-xs leading-relaxed text-stone-500">
                {description}
              </p>
            </div>
          </div>

          {cell.status === "pending" && (
            <button
              type="button"
              onClick={onGoToRequests}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1C2340] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#252d52]"
            >
              Ir a la solicitud
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          {(cell.status === "available" || cell.status === "empty") && (
            <button
              type="button"
              onClick={() => onBlockDay(cell)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1C2340] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#252d52]"
            >
              <Plus className="h-3.5 w-3.5" />
              Bloquear este día
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cellStatusDescription(status: SelectedCell["status"]): string {
  switch (status) {
    case "available":
      return "El coach está libre ese día — no hay bloqueos activos.";
    case "partial":
      return "Bloqueo recurrente de parte del día configurado por el coach. Ya está confirmado, no requiere tu aprobación.";
    case "blocked":
      return "Día completo bloqueado por una regla recurrente del coach. Ya está confirmado.";
    case "pending":
      return "Solicitud puntual de ausencia esperando que la apruebes o rechaces.";
    case "empty":
      return "No hay clases programadas con este coach ese día.";
  }
}

const DAY_LABELS_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

// Admin-side create dialog. Mirrors the coach's NewBlockForm contract but
// posts to `/api/admin/availability/blocks` (which always creates an
// `active` block and pushes a notification to the coach). Two open modes:
// - "open": empty form, admin picks coach + type + dates
// - "prefilled": coach + a single day baked in from a CoverageTab cell tap
function CreateBlockDialog({
  state,
  coaches,
  onClose,
}: {
  state: CreateBlockOpen | null;
  coaches: CoachCoverage[];
  onClose: () => void;
}) {
  if (!state) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[95vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-stone-100 px-5 pb-3 pt-5">
          <DialogTitle className="text-lg">Añadir bloqueo</DialogTitle>
          <DialogDescription className="text-sm">
            Bloquea la disponibilidad de un coach. Queda confirmado al
            instante y se le notifica.
          </DialogDescription>
        </DialogHeader>
        <CreateBlockForm
          state={state}
          coaches={coaches}
          onCancel={onClose}
          onCreated={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateBlockForm({
  state,
  coaches,
  onCancel,
  onCreated,
}: {
  state: CreateBlockOpen;
  coaches: CoachCoverage[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const queryClient = useQueryClient();
  const prefilled = state.kind === "prefilled" ? state : null;

  const [coachUserId, setCoachUserId] = useState<string>(
    prefilled?.coachUserId ?? coaches[0]?.userId ?? "",
  );
  const [type, setType] = useState<"one_time" | "recurring">("one_time");
  const [startDate, setStartDate] = useState(prefilled?.date ?? "");
  const [endDate, setEndDate] = useState(prefilled?.date ?? "");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [reasonType, setReasonType] = useState<string>("personal");
  const [reasonNote, setReasonNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/admin/availability/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Error al crear el bloqueo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin-availability-coverage"],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin-availability-pending"],
      });
      onCreated();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Error"),
  });

  function toggleDay(d: number) {
    setSelectedDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d],
    );
  }

  const canSubmit =
    !mutation.isPending &&
    coachUserId &&
    (type === "one_time"
      ? Boolean(startDate && endDate)
      : selectedDays.length > 0 && Boolean(startTime && endTime));

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    const payload: Record<string, unknown> = {
      coachUserId,
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
    mutation.mutate(payload);
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Coach
            </label>
            <Select
              value={coachUserId}
              onValueChange={setCoachUserId}
              disabled={Boolean(prefilled)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un coach" />
              </SelectTrigger>
              <SelectContent>
                {coaches.map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Tipo
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
                Fecha puntual
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
                Recurrente
              </button>
            </div>
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
                  Hora (opcional — vacío = todo el día)
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
                  Días de la semana
                </label>
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS_SHORT.map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all",
                        selectedDays.includes(i)
                          ? "bg-[#1C2340] text-white"
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

          <div>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Razón
            </label>
            <Select value={reasonType} onValueChange={setReasonType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">Vacaciones</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="training">Capacitación</SelectItem>
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

          {error && (
            <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 border-t border-stone-100 bg-stone-50/50 px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="flex-1 rounded-xl bg-[#1C2340] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1C2340]/90 disabled:opacity-50"
        >
          {mutation.isPending ? "Guardando…" : "Crear bloqueo"}
        </button>
      </div>
    </>
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
      // Recurring partial block — already confirmed by the coach, no admin
      // action needed. Gray-striped so it reads as "blocked part of the day",
      // never as "pending" (yellow is reserved for that).
      return "bg-stone-100";
    case "blocked":
      return "bg-stone-200";
    case "pending":
      return "bg-amber-50";
    case "empty":
      return "bg-stone-50";
  }
}

// Background pattern overlay per status. Centralised so cells, the dialog
// swatch and the legend stay in sync.
function statusCellPattern(status: string): string | undefined {
  if (status === "pending") {
    return "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(251,191,36,0.45) 3px, rgba(251,191,36,0.45) 6px)";
  }
  if (status === "partial") {
    return "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(120,113,108,0.35) 3px, rgba(120,113,108,0.35) 6px)";
  }
  return undefined;
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
  // The status whose pattern this swatch should mirror — keeps cell + legend
  // in sync. Omit for solid swatches.
  pattern?: "partial" | "pending";
}) {
  const patternImage = pattern ? statusCellPattern(pattern) : undefined;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn("h-3 w-3 shrink-0 rounded-sm border border-stone-200/60", className)}
        style={patternImage ? { backgroundImage: patternImage } : undefined}
      />
      <span className="text-[11px] text-stone-500 sm:text-xs">{label}</span>
    </div>
  );
}

function CoverageLegend() {
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-stone-100 pt-3 sm:flex sm:flex-wrap sm:gap-4">
      <LegendItem className="bg-emerald-50" label="Disponible" />
      <LegendItem className="bg-stone-200" label="Bloqueado" />
      <LegendItem
        className="bg-stone-100"
        pattern="partial"
        label="Parcial (recurrente)"
      />
      <LegendItem
        className="bg-amber-50"
        pattern="pending"
        label="Pendiente aprobación"
      />
      <LegendItem className="bg-red-50" label="Sin cobertura" />
      <LegendItem className="bg-stone-50" label="No programado" />
    </div>
  );
}
