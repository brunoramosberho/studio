"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Globe2,
  Plus,
  Download,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ExternalLink,
  Search,
  Sparkles,
  Copy,
  Check,
  XCircle,
  Ban,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  startOfMonth,
  subMonths,
  addMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KpiCard } from "@/components/admin/kpi-card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────

interface PlatformConfig {
  id: string;
  platform: "classpass" | "gympass";
  inboundEmail: string;
  portalUrl: string | null;
  ratePerVisit: number | null;
  isActive: boolean;
  lastExportedAt: string | null;
  platformPartnerId: string | null;
}

interface PlatformBooking {
  id: string;
  platform: "classpass" | "gympass";
  platformBookingId: string | null;
  memberName: string | null;
  status: "confirmed" | "cancelled" | "checked_in" | "absent";
  createdAt: string;
  class: {
    startsAt: string;
    classType: { name: string; color: string };
    room: { name: string };
    coach: { user: { name: string | null } };
  };
}

interface PlatformQuota {
  id: string;
  classId: string;
  platform: "classpass" | "gympass";
  quotaSpots: number;
  bookedSpots: number;
  isClosedManually: boolean;
  class: {
    id: string;
    startsAt: string;
    classType: { name: string; color: string };
    room: { name: string; maxCapacity: number };
    coach: { user: { name: string | null } };
  };
}

interface PlatformAlert {
  id: string;
  platform: "classpass" | "gympass";
  type: string;
  message: string;
  classId: string | null;
  createdAt: string;
}

interface LiquidationData {
  month: string;
  platforms: Array<{
    platform: "classpass" | "gympass";
    checkedIn: Array<{ className: string; date: string; bookingId: string }>;
    absent: Array<{ className: string; date: string; bookingId: string }>;
    rate: number;
    totalEstimated: number;
  }>;
  grandTotal: number;
}

// ─── Helpers ────────────────────────────────────────────

const PLATFORM_LABEL: Record<string, string> = {
  classpass: "ClassPass",
  gympass: "Gympass",
};

const PLATFORM_COLOR: Record<string, string> = {
  classpass: "#5B5EA6",
  gympass: "#E4572E",
};

const STATUS_BADGE: Record<string, { label: string; variant: "success" | "danger" | "warning" | "secondary" }> = {
  confirmed: { label: "Confirmada", variant: "warning" },
  cancelled: { label: "Cancelada", variant: "danger" },
  checked_in: { label: "Check-in", variant: "success" },
  absent: { label: "Ausente", variant: "secondary" },
};

function formatWeekRange(date: Date) {
  const ws = startOfWeek(date, { weekStartsOn: 1 });
  const we = endOfWeek(date, { weekStartsOn: 1 });
  return `${format(ws, "d MMM", { locale: es })} – ${format(we, "d MMM yyyy", { locale: es })}`;
}

function PlatformDot({ platform }: { platform: string }) {
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: PLATFORM_COLOR[platform] ?? "#888" }}
    />
  );
}

// ─── Page ───────────────────────────────────────────────

export default function AdminPlatformsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            Plataformas
          </h1>
          <p className="mt-1 text-sm text-muted">
            ClassPass y Gympass — quotas, reservas y exportación
          </p>
        </div>
        <ConfigButtons />
      </motion.div>

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="quotas">Quotas</TabsTrigger>
          <TabsTrigger value="reservas">Reservas</TabsTrigger>
          <TabsTrigger value="exportar">Exportar</TabsTrigger>
          <TabsTrigger value="liquidacion">Liquidación</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen"><ResumenTab /></TabsContent>
        <TabsContent value="quotas"><QuotasTab /></TabsContent>
        <TabsContent value="reservas"><ReservasTab /></TabsContent>
        <TabsContent value="exportar"><ExportarTab /></TabsContent>
        <TabsContent value="liquidacion"><LiquidacionTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Config Buttons ─────────────────────────────────────

function ConfigButtons() {
  const { data: configs } = useQuery<PlatformConfig[]>({
    queryKey: ["platform-configs"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/config");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const active = configs?.filter((c) => c.isActive) ?? [];
  const canAdd = (configs?.length ?? 0) < 2;

  return (
    <div className="flex items-center gap-2">
      {active.map((c) => (
        <Badge key={c.id} variant="success" className="gap-1.5">
          <PlatformDot platform={c.platform} />
          {PLATFORM_LABEL[c.platform]}
        </Badge>
      ))}
      {canAdd && (
        <Link href="/admin/platforms/setup/classpass">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Añadir plataforma
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Tab: Resumen ───────────────────────────────────────

function ResumenTab() {
  const { data: configs, isLoading: loadingConfigs } = useQuery<PlatformConfig[]>({
    queryKey: ["platform-configs"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/config");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: bookings } = useQuery<PlatformBooking[]>({
    queryKey: ["platform-bookings-summary"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/bookings");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: alerts } = useQuery<PlatformAlert[]>({
    queryKey: ["platform-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/alerts");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const active = configs?.filter((c) => c.isActive) ?? [];

  if (loadingConfigs) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (active.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <Globe2 className="h-12 w-12 text-muted/20" />
          <div>
            <p className="font-medium text-foreground">
              No hay plataformas configuradas
            </p>
            <p className="mt-1 text-sm text-muted">
              Conecta ClassPass o Gympass para recibir reservas automáticamente
            </p>
          </div>
          <div className="mt-2 flex gap-2">
            <Link href="/admin/platforms/setup/classpass">
              <Button size="sm" className="gap-1.5 bg-admin hover:bg-admin/90">
                <Plus className="h-3.5 w-3.5" />
                ClassPass
              </Button>
            </Link>
            <Link href="/admin/platforms/setup/gympass">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Gympass
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalBookings = bookings?.length ?? 0;
  const checkedIn = bookings?.filter((b) => b.status === "checked_in").length ?? 0;
  const pendingCheckin = bookings?.filter(
    (b) => b.status === "confirmed" && new Date(b.class.startsAt) <= new Date(),
  ).length ?? 0;
  const activeAlerts = alerts?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Globe2}
          label="Reservas totales"
          value={totalBookings}
          accentColor={PLATFORM_COLOR.classpass}
        />
        <KpiCard
          icon={ClipboardCheck}
          label="Check-ins"
          value={checkedIn}
          accentColor="#059669"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Pendientes check-in"
          value={pendingCheckin}
          accentColor="#D97706"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Alertas activas"
          value={activeAlerts}
          accentColor={activeAlerts > 0 ? "#DC2626" : "#059669"}
        />
      </div>

      {/* Active alerts */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Alertas</h3>
          <AlertList alerts={alerts} />
        </div>
      )}

      {/* Pending check-ins for today */}
      {pendingCheckin > 0 && bookings && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Pendientes de check-in
          </h3>
          <div className="space-y-1.5">
            {bookings
              .filter((b) => b.status === "confirmed" && new Date(b.class.startsAt) <= new Date())
              .slice(0, 10)
              .map((b) => (
                <PendingCheckinRow key={b.id} booking={b} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertList({ alerts }: { alerts: PlatformAlert[] }) {
  const queryClient = useQueryClient();

  const resolveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/platforms/alerts/${id}/resolve`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-alerts"] });
      toast.success("Alerta resuelta");
    },
  });

  return (
    <div className="space-y-1.5">
      {alerts.map((alert) => {
        const isWarning = alert.type === "class_full" || alert.type === "unmatched_booking";
        return (
          <Card
            key={alert.id}
            className={cn(
              "border-l-4",
              isWarning ? "border-l-orange-400" : "border-l-blue-400",
            )}
          >
            <CardContent className="flex items-start gap-3 p-3">
              <AlertTriangle
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  isWarning ? "text-orange-500" : "text-blue-500",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <PlatformDot platform={alert.platform} />
                  <span className="text-xs font-medium text-muted">
                    {PLATFORM_LABEL[alert.platform]}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-foreground">{alert.message}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1 text-xs"
                onClick={() => resolveMutation.mutate(alert.id)}
                disabled={resolveMutation.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolver
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function PendingCheckinRow({ booking }: { booking: PlatformBooking }) {
  const queryClient = useQueryClient();

  const checkinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/platforms/bookings/${booking.id}/checkin`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["platform-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["platform-bookings-summary"] });
      toast.success(data.reminder, {
        action: data.portalUrl
          ? { label: "Abrir portal", onClick: () => window.open(data.portalUrl, "_blank") }
          : undefined,
      });
    },
  });

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <PlatformDot platform={booking.platform} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {booking.memberName ?? booking.platformBookingId ?? "Reserva"}
          </p>
          <p className="text-xs text-muted">
            {booking.class.classType.name} · {format(new Date(booking.class.startsAt), "HH:mm")}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-admin hover:bg-admin/90"
          onClick={() => checkinMutation.mutate()}
          disabled={checkinMutation.isPending}
        >
          {checkinMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ClipboardCheck className="h-3.5 w-3.5" />
          )}
          Check-in
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Tab: Quotas ────────────────────────────────────────

function QuotasTab() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [editingQuota, setEditingQuota] = useState<{ classId: string; className: string; maxCapacity: number } | null>(null);
  const [quotaValues, setQuotaValues] = useState<{ classpass: string; gympass: string }>({ classpass: "0", gympass: "0" });
  const queryClient = useQueryClient();

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const ws = format(weekStart, "yyyy-MM-dd");

  const { data: quotas, isLoading } = useQuery<PlatformQuota[]>({
    queryKey: ["platform-quotas", ws],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/quotas?weekStart=${ws}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ classId, platform, quotaSpots }: { classId: string; platform: string; quotaSpots: number }) => {
      const res = await fetch("/api/platforms/quotas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, platform, quotaSpots }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-quotas"] });
      toast.success("Quota guardado");
    },
  });

  const suggestMutation = useMutation({
    mutationFn: async (classId: string) => {
      const q = quotas?.find((q) => q.classId === classId);
      if (!q) return;
      const capacity = q.class.room.maxCapacity;
      const directBooked = 0;
      const daysUntil = Math.max(0, Math.ceil((new Date(q.class.startsAt).getTime() - Date.now()) / 86400000));

      const { suggestQuota } = await import("@/lib/platforms/quota-algorithm");
      return suggestQuota({ capacity, directBooked, daysUntilClass: daysUntil });
    },
    onSuccess: (suggestion) => {
      if (suggestion) {
        setQuotaValues({
          classpass: String(suggestion.classpass),
          gympass: String(suggestion.gympass),
        });
        toast.info("Sugerencia aplicada — revisa y guarda");
      }
    },
  });

  function openEditor(classId: string, className: string, maxCapacity: number) {
    const cpQuota = quotas?.find((q) => q.classId === classId && q.platform === "classpass");
    const gpQuota = quotas?.find((q) => q.classId === classId && q.platform === "gympass");
    setQuotaValues({
      classpass: String(cpQuota?.quotaSpots ?? 0),
      gympass: String(gpQuota?.quotaSpots ?? 0),
    });
    setEditingQuota({ classId, className, maxCapacity });
  }

  async function handleSave() {
    if (!editingQuota) return;
    const cp = parseInt(quotaValues.classpass) || 0;
    const gp = parseInt(quotaValues.gympass) || 0;

    await Promise.all([
      saveMutation.mutateAsync({ classId: editingQuota.classId, platform: "classpass", quotaSpots: cp }),
      saveMutation.mutateAsync({ classId: editingQuota.classId, platform: "gympass", quotaSpots: gp }),
    ]);
    setEditingQuota(null);
  }

  const classMap = useMemo(() => {
    const map = new Map<string, { classData: PlatformQuota["class"]; cp: PlatformQuota | null; gp: PlatformQuota | null }>();
    for (const q of quotas ?? []) {
      if (!map.has(q.classId)) {
        map.set(q.classId, { classData: q.class, cp: null, gp: null });
      }
      const entry = map.get(q.classId)!;
      if (q.platform === "classpass") entry.cp = q;
      else entry.gp = q;
    }
    return [...map.entries()].sort(
      (a, b) => new Date(a[1].classData.startsAt).getTime() - new Date(b[1].classData.startsAt).getTime(),
    );
  }, [quotas]);

  return (
    <div className="space-y-4">
      {/* Week nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display text-base font-bold">{formatWeekRange(currentWeek)}</h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : classMap.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No hay quotas configurados para esta semana</p>
            <p className="mt-1 text-xs text-muted/70">
              Crea clases en el horario y luego asigna quotas desde aquí
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {classMap.map(([classId, { classData, cp, gp }]) => {
            const max = classData.room.maxCapacity;
            const cpSpots = cp?.quotaSpots ?? 0;
            const gpSpots = gp?.quotaSpots ?? 0;
            const cpBooked = cp?.bookedSpots ?? 0;
            const gpBooked = gp?.bookedSpots ?? 0;
            const directSpots = max - cpSpots - gpSpots;

            return (
              <Card
                key={classId}
                className="cursor-pointer transition-shadow hover:shadow-warm"
                onClick={() => openEditor(classId, classData.classType.name, max)}
              >
                <CardContent className="flex items-center gap-3 p-3">
                  <div
                    className="h-10 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: classData.classType.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{classData.classType.name}</p>
                      <span className="text-xs text-muted">
                        {format(new Date(classData.startsAt), "EEE d", { locale: es })} · {format(new Date(classData.startsAt), "HH:mm")}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {classData.coach.user.name} · {classData.room.name}
                    </p>
                  </div>

                  {/* Mini quota bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex h-5 w-24 overflow-hidden rounded-full bg-surface">
                      {directSpots > 0 && (
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${(directSpots / max) * 100}%` }}
                          title={`Directos: ${directSpots}`}
                        />
                      )}
                      {cpSpots > 0 && (
                        <div
                          className="h-full"
                          style={{ width: `${(cpSpots / max) * 100}%`, backgroundColor: PLATFORM_COLOR.classpass }}
                          title={`CP: ${cpBooked}/${cpSpots}`}
                        />
                      )}
                      {gpSpots > 0 && (
                        <div
                          className="h-full"
                          style={{ width: `${(gpSpots / max) * 100}%`, backgroundColor: PLATFORM_COLOR.gympass }}
                          title={`GP: ${gpBooked}/${gpSpots}`}
                        />
                      )}
                    </div>
                    <span className="font-mono text-xs text-muted">{max}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quota editor dialog */}
      <Dialog open={!!editingQuota} onOpenChange={() => setEditingQuota(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar quota — {editingQuota?.className}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <PlatformDot platform="classpass" />
              <label className="w-20 text-sm font-medium">ClassPass</label>
              <Input
                type="number"
                min={0}
                value={quotaValues.classpass}
                onChange={(e) => setQuotaValues((v) => ({ ...v, classpass: e.target.value }))}
                className="w-20 text-center"
              />
              <span className="text-xs text-muted">spots</span>
            </div>
            <div className="flex items-center gap-3">
              <PlatformDot platform="gympass" />
              <label className="w-20 text-sm font-medium">Gympass</label>
              <Input
                type="number"
                min={0}
                value={quotaValues.gympass}
                onChange={(e) => setQuotaValues((v) => ({ ...v, gympass: e.target.value }))}
                className="w-20 text-center"
              />
              <span className="text-xs text-muted">spots</span>
            </div>

            {/* Visual bar */}
            {editingQuota && (() => {
              const cp = parseInt(quotaValues.classpass) || 0;
              const gp = parseInt(quotaValues.gympass) || 0;
              const max = editingQuota.maxCapacity;
              const direct = max - cp - gp;
              const over = cp + gp > max;

              return (
                <div className="space-y-2">
                  <div className="flex h-7 overflow-hidden rounded-lg bg-surface">
                    {direct > 0 && <div className="flex items-center justify-center bg-emerald-400 text-[10px] font-bold text-white" style={{ width: `${(direct / max) * 100}%` }}>D:{direct}</div>}
                    {cp > 0 && <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(cp / max) * 100}%`, backgroundColor: PLATFORM_COLOR.classpass }}>CP:{cp}</div>}
                    {gp > 0 && <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(gp / max) * 100}%`, backgroundColor: PLATFORM_COLOR.gympass }}>GP:{gp}</div>}
                  </div>
                  {over && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      La suma supera la capacidad ({max})
                    </p>
                  )}
                </div>
              );
            })()}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => editingQuota && suggestMutation.mutate(editingQuota.classId)}
              disabled={suggestMutation.isPending}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Sugerir automático
            </Button>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingQuota(null)}>Cancelar</Button>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="bg-admin hover:bg-admin/90"
            >
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab: Reservas ──────────────────────────────────────

function ReservasTab() {
  const [platformFilter, setPlatformFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showManual, setShowManual] = useState(false);
  const queryClient = useQueryClient();

  const { data: bookings, isLoading } = useQuery<PlatformBooking[]>({
    queryKey: ["platform-bookings"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/bookings");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    return (bookings ?? []).filter((b) => {
      if (platformFilter !== "all" && b.platform !== platformFilter) return false;
      if (statusFilter !== "all" && b.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          b.class.classType.name.toLowerCase().includes(q) ||
          b.platformBookingId?.toLowerCase().includes(q) ||
          b.memberName?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [bookings, platformFilter, statusFilter, search]);

  const checkinMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/platforms/bookings/${id}/checkin`, { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["platform-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["platform-bookings-summary"] });
      toast.success(data.reminder, {
        action: data.portalUrl
          ? { label: "Abrir portal", onClick: () => window.open(data.portalUrl, "_blank") }
          : undefined,
      });
    },
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-10"
            placeholder="Buscar por clase, ID o nombre..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="classpass">ClassPass</SelectItem>
            <SelectItem value="gympass">Gympass</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="confirmed">Confirmadas</SelectItem>
            <SelectItem value="checked_in">Check-in</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
            <SelectItem value="absent">Ausentes</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowManual(true)}>
          <Plus className="h-3.5 w-3.5" />
          Manual
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No hay reservas de plataformas</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-surface/40">
                <TableRow>
                  <TableHead className="text-xs font-semibold uppercase">Plataforma</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Clase</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Miembro</TableHead>
                  <TableHead className="text-xs font-semibold uppercase">Estado</TableHead>
                  <TableHead className="text-right text-xs font-semibold uppercase">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-2">
                        <PlatformDot platform={b.platform} />
                        <span className="text-sm font-medium">{PLATFORM_LABEL[b.platform]}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      <p className="text-sm font-medium">{b.class.classType.name}</p>
                      <p className="text-xs text-muted">
                        {format(new Date(b.class.startsAt), "EEE d MMM · HH:mm", { locale: es })}
                      </p>
                    </TableCell>
                    <TableCell className="py-3">
                      <p className="text-sm">{b.memberName ?? "—"}</p>
                      {b.platformBookingId && (
                        <p className="font-mono text-xs text-muted">{b.platformBookingId}</p>
                      )}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant={STATUS_BADGE[b.status]?.variant ?? "secondary"}>
                        {STATUS_BADGE[b.status]?.label ?? b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3 text-right">
                      {b.status === "confirmed" && (
                        <Button
                          size="sm"
                          className="gap-1 bg-admin hover:bg-admin/90"
                          onClick={() => checkinMutation.mutate(b.id)}
                          disabled={checkinMutation.isPending}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          Check-in
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ManualBookingDialog open={showManual} onOpenChange={setShowManual} />
    </div>
  );
}

function ManualBookingDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [platform, setPlatform] = useState<string>("classpass");
  const [classId, setClassId] = useState("");
  const [bookingId, setBookingId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [notes, setNotes] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/platforms/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          platform,
          platformBookingId: bookingId || undefined,
          memberName: memberName || undefined,
          notes: notes || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-bookings"] });
      toast.success("Reserva registrada");
      onOpenChange(false);
      setClassId("");
      setBookingId("");
      setMemberName("");
      setNotes("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar reserva manualmente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Plataforma</label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="classpass">ClassPass</SelectItem>
                <SelectItem value="gympass">Gympass</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">ID de clase</label>
            <Input
              placeholder="cuid de la clase..."
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Nombre del miembro</label>
            <Input
              placeholder="Nombre..."
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">ID reserva (opcional)</label>
            <Input
              placeholder="CP-12345..."
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notas (opcional)</label>
            <Input
              placeholder="Notas..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!classId || mutation.isPending}
            className="bg-admin hover:bg-admin/90"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab: Exportar ──────────────────────────────────────

function ExportarTab() {
  const { data: configs } = useQuery<PlatformConfig[]>({
    queryKey: ["platform-configs"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/config");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const [weekDate, setWeekDate] = useState(new Date());
  const ws = format(startOfWeek(weekDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const active = configs?.filter((c) => c.isActive) ?? [];

  async function handleDownload(platform: string) {
    const url = `/api/platforms/export?platform=${platform}&weekStart=${ws}`;
    const res = await fetch(url);
    if (!res.ok) {
      toast.error("Error al exportar");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${platform}-schedule-${ws}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV descargado");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setWeekDate(subWeeks(weekDate, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display text-base font-bold">{formatWeekRange(weekDate)}</h2>
        <Button variant="ghost" size="icon" onClick={() => setWeekDate(addWeeks(weekDate, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {active.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">Activa una plataforma para exportar horarios</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {active.map((config) => (
            <ExportCard key={config.id} config={config} onDownload={() => handleDownload(config.platform)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExportCard({ config, onDownload }: { config: PlatformConfig; onDownload: () => void }) {
  const label = PLATFORM_LABEL[config.platform];
  const isCP = config.platform === "classpass";

  const steps = isCP
    ? [
        "Descarga el CSV con el horario de la semana",
        "Abre el ClassPass Partner Portal",
        "Ve a Schedule → Import",
        "Sube el CSV descargado",
      ]
    : [
        "Descarga el CSV con el horario de la semana",
        "Abre el Wellhub Partner Hub",
        "Ve a Horarios → Importar",
        "Sube el CSV descargado",
      ];

  return (
    <Card>
      <div className="h-0.5" style={{ backgroundColor: PLATFORM_COLOR[config.platform], opacity: 0.3 }} />
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <PlatformDot platform={config.platform} />
          <h3 className="text-sm font-bold">{label}</h3>
          {config.lastExportedAt && (
            <span className="text-xs text-muted">
              Último export: {format(new Date(config.lastExportedAt), "d MMM HH:mm", { locale: es })}
            </span>
          )}
        </div>

        <ol className="space-y-1.5 text-sm text-muted">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-foreground">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-2">
          <Button onClick={onDownload} size="sm" className="gap-1.5 bg-admin hover:bg-admin/90">
            <Download className="h-3.5 w-3.5" />
            Descargar CSV
          </Button>
          {config.portalUrl && (
            <a href={config.portalUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir portal
              </Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Tab: Liquidación ───────────────────────────────────

function LiquidacionTab() {
  const [monthDate, setMonthDate] = useState(new Date());
  const month = format(startOfMonth(monthDate), "yyyy-MM");

  const { data, isLoading } = useQuery<LiquidationData>({
    queryKey: ["platform-liquidation", month],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/liquidation?month=${month}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setMonthDate(subMonths(monthDate, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display text-base font-bold capitalize">
          {format(monthDate, "MMMM yyyy", { locale: es })}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setMonthDate(addMonths(monthDate, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !data || data.platforms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No hay datos de liquidación para este mes</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.platforms.map((p) => (
            <Card key={p.platform}>
              <div className="h-0.5" style={{ backgroundColor: PLATFORM_COLOR[p.platform], opacity: 0.3 }} />
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b p-4">
                  <div className="flex items-center gap-2">
                    <PlatformDot platform={p.platform} />
                    <h3 className="text-sm font-bold">{PLATFORM_LABEL[p.platform]}</h3>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-lg font-bold">
                      €{p.totalEstimated.toFixed(2)}
                    </p>
                    <p className="text-xs text-muted">
                      {p.checkedIn.length} visitas × €{p.rate.toFixed(2)}
                    </p>
                  </div>
                </div>

                {p.checkedIn.length > 0 && (
                  <Table>
                    <TableHeader className="bg-surface/40">
                      <TableRow>
                        <TableHead className="text-xs font-semibold uppercase">Clase</TableHead>
                        <TableHead className="text-xs font-semibold uppercase">Fecha</TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase">Tarifa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.checkedIn.map((v) => (
                        <TableRow key={v.bookingId}>
                          <TableCell className="py-2 text-sm">{v.className}</TableCell>
                          <TableCell className="py-2 text-sm text-muted">{v.date}</TableCell>
                          <TableCell className="py-2 text-right font-mono text-sm">
                            €{p.rate.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {p.absent.length > 0 && (
                  <div className="border-t px-4 py-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <Ban className="h-3 w-3" />
                      {p.absent.length} ausencia{p.absent.length !== 1 ? "s" : ""} (no cobrables)
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          <Card className="bg-surface/50">
            <CardContent className="flex items-center justify-between p-4">
              <p className="text-sm font-semibold">Total estimado</p>
              <p className="font-mono text-xl font-bold">€{data.grandTotal.toFixed(2)}</p>
            </CardContent>
          </Card>

          <p className="text-xs text-muted/70">
            * Las tarifas mostradas son estimaciones basadas en la tarifa por visita configurada.
            La liquidación real depende del contrato con cada plataforma.
          </p>
        </div>
      )}
    </div>
  );
}
