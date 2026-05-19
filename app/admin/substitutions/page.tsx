"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowRight,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  Settings,
  ShieldAlert,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SectionTabs } from "@/components/admin/section-tabs";
import { TEAM_TABS } from "@/components/admin/section-tab-configs";

type Status =
  | "PENDING"
  | "PENDING_ADMIN"
  | "ACCEPTED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

type Mode = "OPEN" | "DIRECT" | "REQUEST" | "MANUAL_ASSIGN" | "SWAP";

type ReasonType = "PERSONAL" | "ILLNESS" | "EMERGENCY" | "TRAVEL" | "OTHER";

const REASON_LABELS: Record<ReasonType, string> = {
  PERSONAL: "Personal",
  ILLNESS: "Enfermedad",
  EMERGENCY: "Emergencia",
  TRAVEL: "Viaje",
  OTHER: "Otro",
};

interface CoachSummary {
  id: string;
  name: string;
  photoUrl: string | null;
  color: string;
}

interface RowClass {
  id: string;
  startsAt: string;
  classType: { id: string; name: string; color: string | null };
  room: { name: string; studio: { name: string } } | null;
}

interface SubstitutionRow {
  id: string;
  status: Status;
  mode: Mode;
  reasonType: ReasonType | null;
  reasonNote: string | null;
  note: string | null;
  rejectionNote: string | null;
  notifiedCoachIds: string[];
  createdAt: string;
  respondedAt: string | null;
  class: RowClass;
  swapWithClass: RowClass | null;
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
  { value: "PENDING_ADMIN", label: "Esperan aprobación" },
  { value: "PENDING", label: "Pendientes" },
  { value: "ACCEPTED", label: "Aceptadas" },
  { value: "REJECTED", label: "Rechazadas" },
  { value: "CANCELLED", label: "Canceladas" },
  { value: "EXPIRED", label: "Expiradas" },
];

async function fetchSubstitutions(status: string): Promise<ApiResponse> {
  const res = await fetch(`/api/admin/substitutions?status=${status}`);
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export default function AdminSubstitutionsPage() {
  const [status, setStatus] = useState<"all" | Status>("PENDING_ADMIN");
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">Cobertura de clases</h1>
            <p className="mt-1 text-sm text-stone-500">
              Solicitudes de suplencia e intercambio entre instructores. Aprueba, asigna o cancela según haga falta.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            className="gap-1.5"
          >
            <Settings className="h-3.5 w-3.5" />
            Configuración
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Esperan aprobación"
            value={counts.PENDING_ADMIN ?? 0}
            tone="amber"
            icon={<ShieldAlert className="h-3.5 w-3.5" />}
          />
          <SummaryCard
            label="Pendientes"
            value={counts.PENDING ?? 0}
            tone="sky"
            icon={<Clock className="h-3.5 w-3.5" />}
          />
          <SummaryCard
            label="Aceptadas"
            value={counts.ACCEPTED ?? 0}
            tone="emerald"
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
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
                <span className="ml-1.5 text-stone-400">{counts[f.value as Status]}</span>
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
              Sin solicitudes en este filtro
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

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
  tone: "amber" | "emerald" | "sky" | "red" | "stone";
  icon: React.ReactNode;
}) {
  const tones = {
    amber: "text-amber-700 bg-amber-50",
    emerald: "text-emerald-700 bg-emerald-50",
    sky: "text-sky-700 bg-sky-50",
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

// ── Card ──────────────────────────────────────────────────────────────

function SubstitutionCard({ req }: { req: SubstitutionRow }) {
  const queryClient = useQueryClient();
  const startDate = new Date(req.class.startsAt);
  const created = new Date(req.createdAt);
  const [assignOpen, setAssignOpen] = useState(false);

  const statusBadge: Record<Status, { label: string; className: string }> = {
    PENDING_ADMIN: {
      label: "Espera aprobación",
      className: "bg-amber-100 text-amber-800",
    },
    PENDING: { label: "Pendiente", className: "bg-sky-50 text-sky-800" },
    ACCEPTED: { label: "Aceptada", className: "bg-emerald-50 text-emerald-800" },
    REJECTED: { label: "Rechazada", className: "bg-red-50 text-red-800" },
    CANCELLED: { label: "Cancelada", className: "bg-stone-100 text-stone-600" },
    EXPIRED: { label: "Expirada", className: "bg-stone-100 text-stone-500" },
  };

  const modeBadge: Record<Mode, { label: string; className: string; icon?: React.ReactNode }> = {
    OPEN: { label: "Abierta", className: "bg-stone-100 text-stone-600" },
    DIRECT: { label: "Directa", className: "bg-blue-50 text-blue-700" },
    REQUEST: { label: "Suplencia", className: "bg-sky-50 text-sky-700" },
    MANUAL_ASSIGN: {
      label: "Asignación directa",
      className: "bg-violet-50 text-violet-700",
      icon: <UserCheck className="h-3 w-3" />,
    },
    SWAP: {
      label: "Intercambio",
      className: "bg-fuchsia-50 text-fuchsia-700",
      icon: <ArrowLeftRight className="h-3 w-3" />,
    },
  };

  const refetch = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-substitutions"] });

  const approveMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/substitutions/${req.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      return json;
    },
    onSuccess: () => {
      refetch();
      toast.success(req.mode === "SWAP" ? "Intercambio aprobado" : "Solicitud aprobada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/substitutions/${req.id}/cancel`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      return json;
    },
    onSuccess: () => {
      refetch();
      toast.success("Cancelada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replacement =
    req.acceptedByCoach ?? (req.targetCoach ?? null);

  const canApprove = req.status === "PENDING_ADMIN";
  const canCancel = req.status === "PENDING_ADMIN" || req.status === "PENDING";
  const canAssign =
    (req.status === "PENDING_ADMIN" || req.status === "PENDING") &&
    req.mode !== "SWAP";

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
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                modeBadge[req.mode].className,
              )}
            >
              {modeBadge[req.mode].icon}
              {modeBadge[req.mode].label}
            </span>
            {req.reasonType && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
                {REASON_LABELS[req.reasonType]}
              </span>
            )}
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
          <CoachChip coach={req.requestingCoach} sublabel="Pide" />
          <ArrowRight className="h-4 w-4 text-stone-400" />
          {replacement ? (
            <CoachChip
              coach={replacement}
              sublabel={
                req.status === "ACCEPTED"
                  ? req.mode === "SWAP"
                    ? "Da tu clase"
                    : "Cubrirá"
                  : "Solicitado"
              }
            />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-stone-300 px-3 py-1.5 text-xs text-stone-500">
              {req.notifiedCoachIds.length} instructor
              {req.notifiedCoachIds.length !== 1 ? "es" : ""} a notificar
            </div>
          )}
        </div>

        {/* SWAP: show the other class */}
        {req.mode === "SWAP" && req.swapWithClass && (
          <div className="mt-3 rounded-lg border border-stone-200 bg-card p-3 text-xs">
            <p className="mb-1 font-medium text-stone-700">
              {req.requestingCoach.name.split(" ")[0]} daría:
            </p>
            <p className="text-stone-600">
              {req.swapWithClass.classType.name} ·{" "}
              {format(new Date(req.swapWithClass.startsAt), "EEE d MMM HH:mm", { locale: es })}
              {req.swapWithClass.room
                ? ` · ${req.swapWithClass.room.studio.name}`
                : ""}
            </p>
          </div>
        )}

        {/* Reason note */}
        {(req.reasonNote || req.note) && (
          <p className="mt-3 rounded-lg bg-card px-3 py-2 text-xs italic text-stone-600">
            “{req.reasonNote || req.note}”
          </p>
        )}
        {req.status === "REJECTED" && req.rejectionNote && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs italic text-red-700">
            Motivo del rechazo: “{req.rejectionNote}”
          </p>
        )}

        {/* Actions */}
        {(canApprove || canCancel || canAssign) && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 pt-3">
            {canApprove && (
              <Button
                size="sm"
                onClick={() => approveMut.mutate()}
                disabled={approveMut.isPending}
                className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {approveMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                {req.mode === "SWAP" ? "Aprobar intercambio" : "Aprobar"}
              </Button>
            )}
            {canAssign && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAssignOpen(true)}
              >
                Asignar a mano
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => cancelMut.mutate()}
                disabled={cancelMut.isPending}
                className="text-stone-500 hover:text-red-700"
              >
                {cancelMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Cancelar
              </Button>
            )}
          </div>
        )}
      </div>

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        requestId={req.id}
        onSuccess={refetch}
      />
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

// ── Assign dialog ─────────────────────────────────────────────────────

function AssignDialog({
  open,
  onOpenChange,
  requestId,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requestId: string;
  onSuccess: () => void;
}) {
  const [coachProfileId, setCoachProfileId] = useState("");

  const { data: coaches } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["admin-coaches-simple"],
    queryFn: async () => {
      const res = await fetch("/api/coaches");
      if (!res.ok) return [];
      const data = await res.json();
      return data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }));
    },
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/substitutions/${requestId}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coachProfileId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      return json;
    },
    onSuccess: () => {
      toast.success("Asignado");
      onSuccess();
      onOpenChange(false);
      setCoachProfileId("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar instructor</DialogTitle>
          <DialogDescription>
            Selecciona quién dará la clase. La solicitud se cerrará como aceptada y se reasignará la clase al instante.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={coachProfileId} onValueChange={setCoachProfileId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un instructor" />
            </SelectTrigger>
            <SelectContent>
              {(coaches ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!coachProfileId || mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Settings dialog ───────────────────────────────────────────────────

function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useQuery<{ subRequestAdminApprovalHours: number }>({
    queryKey: ["admin-substitutions-settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/substitutions/settings");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: open,
  });

  const [hours, setHours] = useState<number>(24);
  // Re-seed when data arrives via key on the input.
  const seedHours = data?.subRequestAdminApprovalHours ?? 24;
  if (open && data && hours !== seedHours && hours === 24 && seedHours !== 24) {
    setHours(seedHours);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/substitutions/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subRequestAdminApprovalHours: hours }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Error");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-substitutions-settings"] });
      toast.success("Configuración guardada");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configuración de cobertura</DialogTitle>
          <DialogDescription>
            Define el límite a partir del cual una solicitud requiere tu aprobación.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-stone-700">
            Horas antes de la clase para considerarla urgente
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={720}
              value={hours}
              onChange={(e) => setHours(parseInt(e.target.value, 10) || 0)}
              className="w-24"
            />
            <span className="text-sm text-stone-500">horas</span>
          </div>
          <p className="text-xs text-stone-500">
            Solicitudes para clases dentro de este margen se mandan
            directamente a los instructores seleccionados. Si la clase es
            en más de {hours || 0} horas, la solicitud espera tu aprobación
            primero.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
