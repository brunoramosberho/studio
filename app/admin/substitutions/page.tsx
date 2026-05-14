"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Send,
  Users,
  XCircle,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { SectionTabs } from "@/components/admin/section-tabs";
import { TEAM_TABS } from "@/components/admin/section-tab-configs";

type Status = "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED" | "EXPIRED";
type Mode = "OPEN" | "DIRECT";

interface CoachSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  color: string;
}

interface SubstitutionRow {
  id: string;
  status: Status;
  mode: Mode;
  note: string | null;
  rejectionNote: string | null;
  notifiedCoachIds: string[];
  createdAt: string;
  respondedAt: string | null;
  class: {
    id: string;
    startsAt: string;
    classType: { id: string; name: string; color: string | null };
    room: {
      name: string;
      studio: { name: string };
    } | null;
  };
  requestingCoach: CoachSummary;
  originalCoach: CoachSummary;
  targetCoach: CoachSummary | null;
  acceptedByCoach: CoachSummary | null;
}

interface ApiResponse {
  requests: SubstitutionRow[];
  counts: Partial<Record<Status, number>>;
}

const STATUS_FILTERS: { value: "all" | Status; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "PENDING", label: "Pendientes" },
  { value: "ACCEPTED", label: "Aceptadas" },
  { value: "REJECTED", label: "Rechazadas" },
  { value: "CANCELLED", label: "Canceladas" },
  { value: "EXPIRED", label: "Expiradas" },
];

async function fetchSubstitutions(
  status: string,
): Promise<ApiResponse> {
  const res = await fetch(`/api/admin/substitutions?status=${status}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export default function AdminSubstitutionsPage() {
  const [status, setStatus] = useState<"all" | Status>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-substitutions", status],
    queryFn: () => fetchSubstitutions(status),
  });

  const counts = useMemo(() => data?.counts ?? {}, [data]);
  const total = useMemo(
    () => Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0),
    [counts],
  );

  return (
    <div className="min-h-full bg-stone-50">
      <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
        <SectionTabs tabs={TEAM_TABS} ariaLabel="Team sections" />
        <div>
          <h1 className="text-2xl font-bold text-stone-900">Suplencias</h1>
          <p className="mt-1 text-sm text-stone-500">
            Solicitudes de suplencia entre instructores. Para que tengas
            visibilidad de qué clases están siendo cubiertas y cómo.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Pendientes"
            value={counts.PENDING ?? 0}
            tone="amber"
            icon={<Clock className="h-3.5 w-3.5" />}
          />
          <SummaryCard
            label="Aceptadas"
            value={counts.ACCEPTED ?? 0}
            tone="emerald"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          />
          <SummaryCard
            label="Rechazadas"
            value={counts.REJECTED ?? 0}
            tone="red"
            icon={<XCircle className="h-3.5 w-3.5" />}
          />
          <SummaryCard
            label="Total"
            value={total}
            tone="stone"
            icon={<Send className="h-3.5 w-3.5" />}
          />
        </div>

        <div className="inline-flex flex-wrap rounded-lg bg-stone-100 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                status === f.value
                  ? "border border-stone-200 bg-card text-stone-900"
                  : "text-stone-500 hover:text-stone-700",
              )}
            >
              {f.label}
              {f.value !== "all" && counts[f.value as Status] !== undefined && (
                <span className="ml-1.5 text-stone-400">
                  {counts[f.value as Status]}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-stone-200 bg-card p-8 text-center text-sm text-stone-500">
            Cargando…
          </div>
        ) : !data || data.requests.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-card p-12 text-center">
            <Users className="mx-auto mb-3 h-8 w-8 text-stone-300" />
            <p className="text-sm font-medium text-stone-700">
              Sin solicitudes de suplencia
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Cuando un instructor pida que lo cubran, lo verás aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.requests.map((req) => (
              <SubstitutionCard key={req.id} req={req} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "amber" | "emerald" | "red" | "stone";
  icon: React.ReactNode;
}) {
  const tones = {
    amber: "text-amber-700 bg-amber-50",
    emerald: "text-emerald-700 bg-emerald-50",
    red: "text-red-700 bg-red-50",
    stone: "text-stone-700 bg-stone-100",
  };
  return (
    <div className="rounded-2xl border border-stone-200 bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">
          {label}
        </p>
        <span className={cn("rounded-full p-1", tones[tone])}>{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
    </div>
  );
}

function SubstitutionCard({ req }: { req: SubstitutionRow }) {
  const startDate = new Date(req.class.startsAt);
  const created = new Date(req.createdAt);

  const statusBadge: Record<Status, { label: string; className: string }> = {
    PENDING: {
      label: "Pendiente",
      className: "bg-amber-50 text-amber-800",
    },
    ACCEPTED: {
      label: "Aceptada",
      className: "bg-emerald-50 text-emerald-800",
    },
    REJECTED: {
      label: "Rechazada",
      className: "bg-red-50 text-red-800",
    },
    CANCELLED: {
      label: "Cancelada",
      className: "bg-stone-100 text-stone-600",
    },
    EXPIRED: {
      label: "Expirada",
      className: "bg-stone-100 text-stone-500",
    },
  };

  const replacement =
    req.acceptedByCoach ??
    (req.mode === "DIRECT" ? req.targetCoach : null);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-card">
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-stone-900">
              {req.class.classType.name}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                statusBadge[req.status].className,
              )}
            >
              {statusBadge[req.status].label}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                req.mode === "DIRECT"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-stone-100 text-stone-600",
              )}
            >
              {req.mode === "DIRECT" ? "Directa" : "Abierta"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">
            {format(startDate, "EEEE d MMM", { locale: es })} ·{" "}
            {formatTime(startDate)}
            {req.class.room
              ? ` · ${req.class.room.studio.name} – ${req.class.room.name}`
              : ""}
          </p>
        </div>
        <span
          className="ml-auto shrink-0 text-[10px] text-stone-400"
          title={format(created, "d MMM yyyy HH:mm", { locale: es })}
        >
          {format(created, "d MMM", { locale: es })}
        </span>
      </div>

      <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <CoachChip coach={req.requestingCoach} sublabel="Original" />
          <ArrowRight className="h-4 w-4 text-stone-400" />
          {replacement ? (
            <CoachChip
              coach={replacement}
              sublabel={
                req.status === "ACCEPTED"
                  ? "Cubrirá"
                  : req.mode === "DIRECT"
                    ? "Solicitado"
                    : "Pendiente"
              }
            />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs text-stone-500">
              {req.status === "PENDING"
                ? `${req.notifiedCoachIds.length} instructor${req.notifiedCoachIds.length !== 1 ? "es" : ""} notificado${req.notifiedCoachIds.length !== 1 ? "s" : ""}`
                : "Sin reemplazo"}
            </div>
          )}
        </div>

        {req.note && (
          <p className="mt-3 rounded-lg bg-card px-3 py-2 text-xs italic text-stone-600">
            “{req.note}”
          </p>
        )}
        {req.status === "REJECTED" && req.rejectionNote && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs italic text-red-700">
            Motivo del rechazo: “{req.rejectionNote}”
          </p>
        )}
      </div>
    </div>
  );
}

function CoachChip({
  coach,
  sublabel,
}: {
  coach: CoachSummary;
  sublabel?: string;
}) {
  const initials = (coach.name || "C")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-2 rounded-lg bg-card px-2 py-1.5">
      {coach.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coach.photoUrl}
          alt={coach.name}
          className="h-6 w-6 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white"
          style={{ backgroundColor: coach.color || "#1C2340" }}
        >
          {initials}
        </div>
      )}
      <div className="flex flex-col leading-tight">
        <span className="text-xs font-medium text-stone-800">
          {coach.name.split(" ")[0]}
        </span>
        {sublabel && (
          <span className="text-[9px] uppercase tracking-wide text-stone-400">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}
