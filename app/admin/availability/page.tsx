"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Check,
  X as XIcon,
} from "lucide-react";
import { format, addWeeks, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

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

type TabId = "requests" | "coverage";

const REASON_LABELS: Record<string, string> = {
  vacation: "Vacaciones",
  personal: "Personal",
  training: "Formación",
  other: "Otro",
};

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
  const [tab, setTab] = useState<TabId>("requests");

  const { data: pending = [] } = useQuery({
    queryKey: ["admin-availability-pending"],
    queryFn: fetchPending,
  });

  const pendingCount = pending.length;

  return (
    <div className="min-h-full bg-stone-50">
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            Disponibilidad
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Gestiona la disponibilidad del equipo
          </p>
        </div>

        {/* Tabs */}
        <div className="inline-flex rounded-lg bg-stone-100 p-1">
          <button
            onClick={() => setTab("requests")}
            className={cn(
              "relative flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
              tab === "requests"
                ? "border border-stone-200 bg-white text-stone-900"
                : "text-stone-500 hover:text-stone-700",
            )}
          >
            Solicitudes
            {pendingCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[9px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("coverage")}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-all",
              tab === "coverage"
                ? "border border-stone-200 bg-white text-stone-900"
                : "text-stone-500 hover:text-stone-700",
            )}
          >
            Cobertura del equipo
          </button>
        </div>

        {tab === "requests" ? (
          <RequestsTab pending={pending} />
        ) : (
          <CoverageTab />
        )}
      </div>
    </div>
  );
}

// ── Tab 1: Requests ──

function RequestsTab({ pending }: { pending: PendingBlock[] }) {
  const totalUncovered = pending.reduce((s, b) => s + b.uncoveredCount, 0);

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
            Solicitudes pendientes
          </p>
          <p className="mt-1 text-2xl font-bold text-stone-900">
            {pending.length}
          </p>
          <p className="text-xs text-stone-500">Requieren tu atención</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
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

      {/* Request cards */}
      {pending.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
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
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
      {/* Header */}
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

      {/* Impact section */}
      {block.affectedClasses.length > 0 && (
        <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-stone-400">
            Impacto si se aprueba
          </p>
          <div className="space-y-1.5">
            {block.affectedClasses.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 text-sm"
              >
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

          {/* Substitute suggestions */}
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

      {/* Actions */}
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
      {/* Gaps alert */}
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

      {/* Controls */}
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

      {/* Heatmap */}
      {data && (
        <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white p-4">
          <div
            className="grid gap-px"
            style={{
              gridTemplateColumns: "80px repeat(7, 1fr)",
            }}
          >
            {/* Header row */}
            <div />
            {data.dayHeaders.map((dh) => (
              <div
                key={dh.date}
                className="flex flex-col items-center py-1"
              >
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

            {/* Coach rows */}
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

          {/* Legend */}
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

// ── Helpers ──

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
