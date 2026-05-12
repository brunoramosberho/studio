"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
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
import { useCurrency } from "@/components/tenant-provider";
import { SectionTabs } from "@/components/admin/section-tabs";
import { STUDIO_CONFIG_TABS } from "@/components/admin/section-tab-configs";
import { formatMoney } from "@/lib/currency";
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
  platform: "classpass" | "wellhub";
  inboundEmail: string;
  portalUrl: string | null;
  ratePerVisit: number | null;
  isActive: boolean;
  lastExportedAt: string | null;
  platformPartnerId: string | null;
}

interface PlatformBooking {
  id: string;
  platform: "classpass" | "wellhub";
  platformBookingId: string | null;
  memberName: string | null;
  status: "confirmed" | "cancelled" | "checked_in" | "absent";
  createdAt: string;
  class: {
    startsAt: string;
    classType: { name: string; color: string };
    room: { name: string };
    coach: { name: string; user?: { name?: string | null } | null };
  };
}

interface PlatformQuota {
  id: string;
  classId: string;
  platform: "classpass" | "wellhub";
  quotaSpots: number;
  bookedSpots: number;
  isClosedManually: boolean;
  class: {
    id: string;
    startsAt: string;
    classType: { name: string; color: string };
    room: { name: string; maxCapacity: number };
    coach: { name: string; user?: { name?: string | null } | null };
  };
}

interface PlatformAlert {
  id: string;
  platform: "classpass" | "wellhub";
  type: string;
  message: string;
  classId: string | null;
  createdAt: string;
}

interface LiquidationData {
  month: string;
  platforms: Array<{
    platform: "classpass" | "wellhub";
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
  wellhub: "Wellhub",
};

const PLATFORM_COLOR: Record<string, string> = {
  classpass: "#5B5EA6",
  wellhub: "#E4572E",
};

// ─── Demo Data ──────────────────────────────────────────

function buildDemoQuotas(weekStart: Date): PlatformQuota[] {
  const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const classTypes = [
    { name: "Cycling", color: "#F59E0B" },
    { name: "Yoga Flow", color: "#8B5CF6" },
    { name: "HIIT", color: "#EF4444" },
    { name: "Pilates", color: "#EC4899" },
    { name: "Barre", color: "#14B8A6" },
    { name: "Boxing", color: "#1D4ED8" },
  ];
  const coaches = ["Ana García", "Carlos Ruiz", "Sofía Torres", "Diego Martínez"];
  const rooms = [
    { name: "Sala A", maxCapacity: 25 },
    { name: "Sala B", maxCapacity: 18 },
    { name: "Terraza", maxCapacity: 12 },
  ];
  const hours = ["07:00", "09:30", "12:00", "17:00", "19:00"];

  const quotas: PlatformQuota[] = [];
  let idx = 0;

  for (let d = 0; d < 6; d++) {
    const count = d < 5 ? 4 : 2;
    for (let h = 0; h < count; h++) {
      const ct = classTypes[(d + h) % classTypes.length];
      const room = rooms[(d + h) % rooms.length];
      const coach = coaches[(d + h) % coaches.length];
      const hour = hours[h % hours.length];
      const [hh, mm] = hour.split(":").map(Number);
      const startsAt = new Date(weekStart);
      startsAt.setDate(startsAt.getDate() + d);
      startsAt.setHours(hh, mm, 0, 0);
      const classId = `demo-class-${idx}`;

      const cpSpots = [3, 4, 2, 5, 0, 3, 2, 4][(d + h) % 8];
      const gpSpots = [2, 1, 3, 0, 2, 2, 1, 3][(d + h) % 8];
      const cpBooked = Math.min(cpSpots, [1, 2, 0, 3, 0, 1, 2, 1][(d + h) % 8]);
      const gpBooked = Math.min(gpSpots, [0, 1, 1, 0, 2, 0, 1, 0][(d + h) % 8]);

      if (cpSpots > 0) {
        quotas.push({
          id: `demo-cp-${idx}`,
          classId,
          platform: "classpass",
          quotaSpots: cpSpots,
          bookedSpots: cpBooked,
          isClosedManually: false,
          class: {
            id: classId,
            startsAt: startsAt.toISOString(),
            classType: ct,
            room,
            coach: { name: coach },
          },
        });
      }
      if (gpSpots > 0) {
        quotas.push({
          id: `demo-gp-${idx}`,
          classId,
          platform: "wellhub",
          quotaSpots: gpSpots,
          bookedSpots: gpBooked,
          isClosedManually: false,
          class: {
            id: classId,
            startsAt: startsAt.toISOString(),
            classType: ct,
            room,
            coach: { name: coach },
          },
        });
      }
      idx++;
    }
  }
  return quotas;
}

const DEMO_CONFIGS: PlatformConfig[] = [
  {
    id: "demo-cp",
    platform: "classpass",
    inboundEmail: "classpass.demo@in.mgic.app",
    portalUrl: "https://partners.classpass.com",
    ratePerVisit: 6.5,
    isActive: true,
    lastExportedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    platformPartnerId: "CP-DEMO-001",
  },
  {
    id: "demo-gp",
    platform: "wellhub",
    inboundEmail: "wellhub.demo@in.mgic.app",
    portalUrl: "https://partners.wellhub.com",
    ratePerVisit: 5.0,
    isActive: true,
    lastExportedAt: null,
    platformPartnerId: null,
  },
];

function buildDemoBookings(): PlatformBooking[] {
  const now = new Date();
  const names = ["María López", "Juan Hernández", "Lucía Fernández", "Pedro Sánchez", "Camila Rivera", "Andrés Morales", "Valentina Cruz", "Mateo Díaz"];
  const statuses: PlatformBooking["status"][] = ["confirmed", "checked_in", "checked_in", "confirmed", "cancelled", "checked_in", "absent", "confirmed"];

  return names.map((name, i) => {
    const startsAt = new Date(now);
    startsAt.setHours(7 + i * 1.5, 0, 0, 0);
    return {
      id: `demo-bk-${i}`,
      platform: i % 3 === 0 ? "wellhub" : "classpass",
      platformBookingId: `${i % 3 === 0 ? "GP" : "CP"}-${10000 + i}`,
      memberName: name,
      status: statuses[i % statuses.length],
      createdAt: new Date(now.getTime() - 3600000 * (i + 1)).toISOString(),
      class: {
        startsAt: startsAt.toISOString(),
        classType: { name: ["Cycling", "Yoga Flow", "HIIT", "Pilates", "Barre", "Boxing", "Cycling", "HIIT"][i], color: ["#F59E0B", "#8B5CF6", "#EF4444", "#EC4899", "#14B8A6", "#1D4ED8", "#F59E0B", "#EF4444"][i] },
        room: { name: ["Sala A", "Sala B", "Terraza"][i % 3] },
        coach: { name: ["Ana García", "Carlos Ruiz", "Sofía Torres", "Diego Martínez"][i % 4] },
      },
    };
  });
}

function buildDemoAlerts(): PlatformAlert[] {
  return [
    {
      id: "demo-alert-1",
      platform: "classpass",
      type: "class_full",
      message: "Cycling 19:00 está llena — considerar abrir más spots en ClassPass",
      classId: "demo-class-4",
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: "demo-alert-2",
      platform: "wellhub",
      type: "unmatched_booking",
      message: "Reserva GP-10003 no coincide con ninguna clase — verificar manualmente",
      classId: null,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
    },
  ];
}

function DemoBanner() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-2.5">
      <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-xs font-medium text-amber-800">
        <span className="font-semibold">Modo demo</span> — Estás viendo datos de ejemplo.
        Configura ClassPass o Wellhub para usar datos reales.
      </p>
      <Link href="/admin/platforms/setup/classpass" className="ml-auto shrink-0">
        <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-300 text-xs text-amber-700 hover:bg-amber-100">
          <Plus className="h-3 w-3" />
          Conectar
        </Button>
      </Link>
    </div>
  );
}

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
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const { data: configs, isLoading } = useQuery<PlatformConfig[]>({
    queryKey: ["platform-configs"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/config");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const hasActive = (configs ?? []).some((c) => c.isActive);
  const isDemo = !isLoading && !hasActive;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionTabs tabs={STUDIO_CONFIG_TABS} ariaLabel="Studio configuration sections" />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            {t("platforms")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("platformsSubtitle")}
          </p>
        </div>
        <ConfigButtons />
      </motion.div>

      {isDemo && <DemoBanner />}

      <Tabs defaultValue="resumen">
        <TabsList>
          <TabsTrigger value="resumen">{t("summaryTab")}</TabsTrigger>
          <TabsTrigger value="quotas">Quotas</TabsTrigger>
          <TabsTrigger value="reservas">{t("bookingsTab")}</TabsTrigger>
          <TabsTrigger value="conversion">Conversión</TabsTrigger>
          <TabsTrigger value="exportar">{t("exportTab")}</TabsTrigger>
          <TabsTrigger value="liquidacion">{t("settlementTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen"><ResumenTab demo={isDemo} /></TabsContent>
        <TabsContent value="quotas"><QuotasTab demo={isDemo} /></TabsContent>
        <TabsContent value="reservas"><ReservasTab demo={isDemo} /></TabsContent>
        <TabsContent value="conversion"><WellhubConversionTab /></TabsContent>
        <TabsContent value="exportar"><ExportarTab demo={isDemo} /></TabsContent>
        <TabsContent value="liquidacion"><LiquidacionTab demo={isDemo} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Config Buttons ─────────────────────────────────────

function ConfigButtons() {
  const t = useTranslations("admin");
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
            {t("addPlatform")}
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Tab: Resumen ───────────────────────────────────────

function ResumenTab({ demo }: { demo: boolean }) {
  const { data: configs, isLoading: loadingConfigs } = useQuery<PlatformConfig[]>({
    queryKey: ["platform-configs"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/config");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !demo,
  });

  const { data: bookings } = useQuery<PlatformBooking[]>({
    queryKey: ["platform-bookings-summary"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/bookings");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !demo,
  });

  const { data: alerts } = useQuery<PlatformAlert[]>({
    queryKey: ["platform-alerts"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/alerts");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !demo,
  });

  const effectiveConfigs = demo ? DEMO_CONFIGS : configs;
  const effectiveBookings = demo ? buildDemoBookings() : bookings;
  const effectiveAlerts = demo ? buildDemoAlerts() : alerts;
  const active = effectiveConfigs?.filter((c) => c.isActive) ?? [];

  if (!demo && loadingConfigs) {
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
              Conecta ClassPass o Wellhub para recibir reservas automáticamente
            </p>
          </div>
          <div className="mt-2 flex gap-2">
            <Link href="/admin/platforms/setup/classpass">
              <Button size="sm" className="gap-1.5 bg-admin hover:bg-admin/90">
                <Plus className="h-3.5 w-3.5" />
                ClassPass
              </Button>
            </Link>
            <Link href="/admin/platforms/setup/wellhub">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Wellhub
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalBookings = effectiveBookings?.length ?? 0;
  const checkedIn = effectiveBookings?.filter((b) => b.status === "checked_in").length ?? 0;
  const pendingCheckin = effectiveBookings?.filter(
    (b) => b.status === "confirmed" && new Date(b.class.startsAt) <= new Date(),
  ).length ?? 0;
  const activeAlerts = effectiveAlerts?.length ?? 0;

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
      {effectiveAlerts && effectiveAlerts.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Alertas</h3>
          <AlertList alerts={effectiveAlerts} demo={demo} />
        </div>
      )}

      {/* Pending check-ins for today */}
      {pendingCheckin > 0 && effectiveBookings && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Pendientes de check-in
          </h3>
          <div className="space-y-1.5">
            {effectiveBookings
              .filter((b) => b.status === "confirmed" && new Date(b.class.startsAt) <= new Date())
              .slice(0, 10)
              .map((b) => (
                <PendingCheckinRow key={b.id} booking={b} demo={demo} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AlertList({ alerts, demo }: { alerts: PlatformAlert[]; demo?: boolean }) {
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
                onClick={() => demo ? toast.info("Modo demo — conecta una plataforma para gestionar alertas") : resolveMutation.mutate(alert.id)}
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

function PendingCheckinRow({ booking, demo }: { booking: PlatformBooking; demo?: boolean }) {
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
          onClick={() => demo ? toast.info("Modo demo — conecta una plataforma para hacer check-in") : checkinMutation.mutate()}
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

function QuotasTab({ demo }: { demo: boolean }) {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [editingQuota, setEditingQuota] = useState<{ classId: string; className: string; maxCapacity: number } | null>(null);
  const [quotaValues, setQuotaValues] = useState<{ classpass: string; wellhub: string }>({ classpass: "0", wellhub: "0" });
  const [demoOverrides, setDemoOverrides] = useState<Record<string, { cp: number; gp: number }>>({});
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
    enabled: !demo,
  });

  const demoQuotas = useMemo(() => {
    if (!demo) return [];
    const base = buildDemoQuotas(weekStart);
    return base.map((q) => {
      const override = demoOverrides[q.classId];
      if (!override) return q;
      if (q.platform === "classpass") return { ...q, quotaSpots: override.cp };
      return { ...q, quotaSpots: override.gp };
    });
  }, [demo, weekStart, demoOverrides]);

  const effectiveQuotas = demo ? demoQuotas : quotas;

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
      const q = effectiveQuotas?.find((q) => q.classId === classId);
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
          wellhub: String(suggestion.wellhub),
        });
        toast.info("Sugerencia aplicada — revisa y guarda");
      }
    },
  });

  function openEditor(classId: string, className: string, maxCapacity: number) {
    const cpQuota = effectiveQuotas?.find((q) => q.classId === classId && q.platform === "classpass");
    const gpQuota = effectiveQuotas?.find((q) => q.classId === classId && q.platform === "wellhub");
    setQuotaValues({
      classpass: String(cpQuota?.quotaSpots ?? 0),
      wellhub: String(gpQuota?.quotaSpots ?? 0),
    });
    setEditingQuota({ classId, className, maxCapacity });
  }

  async function handleSave() {
    if (!editingQuota) return;
    const cp = parseInt(quotaValues.classpass) || 0;
    const gp = parseInt(quotaValues.wellhub) || 0;

    if (demo) {
      setDemoOverrides((prev) => ({ ...prev, [editingQuota.classId]: { cp, gp } }));
      toast.success("Quota actualizado (demo)");
      setEditingQuota(null);
      return;
    }

    await Promise.all([
      saveMutation.mutateAsync({ classId: editingQuota.classId, platform: "classpass", quotaSpots: cp }),
      saveMutation.mutateAsync({ classId: editingQuota.classId, platform: "wellhub", quotaSpots: gp }),
    ]);
    setEditingQuota(null);
  }

  const classMap = useMemo(() => {
    const map = new Map<string, { classData: PlatformQuota["class"]; cp: PlatformQuota | null; gp: PlatformQuota | null }>();
    for (const q of effectiveQuotas ?? []) {
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
  }, [effectiveQuotas]);

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

      {!demo && isLoading ? (
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
                      {classData.coach.name} · {classData.room.name}
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
                          style={{ width: `${(gpSpots / max) * 100}%`, backgroundColor: PLATFORM_COLOR.wellhub }}
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
              <PlatformDot platform="wellhub" />
              <label className="w-20 text-sm font-medium">Wellhub</label>
              <Input
                type="number"
                min={0}
                value={quotaValues.wellhub}
                onChange={(e) => setQuotaValues((v) => ({ ...v, wellhub: e.target.value }))}
                className="w-20 text-center"
              />
              <span className="text-xs text-muted">spots</span>
            </div>

            {/* Visual bar */}
            {editingQuota && (() => {
              const cp = parseInt(quotaValues.classpass) || 0;
              const gp = parseInt(quotaValues.wellhub) || 0;
              const max = editingQuota.maxCapacity;
              const direct = max - cp - gp;
              const over = cp + gp > max;

              return (
                <div className="space-y-2">
                  <div className="flex h-7 overflow-hidden rounded-lg bg-surface">
                    {direct > 0 && <div className="flex items-center justify-center bg-emerald-400 text-[10px] font-bold text-white" style={{ width: `${(direct / max) * 100}%` }}>D:{direct}</div>}
                    {cp > 0 && <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(cp / max) * 100}%`, backgroundColor: PLATFORM_COLOR.classpass }}>CP:{cp}</div>}
                    {gp > 0 && <div className="flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${(gp / max) * 100}%`, backgroundColor: PLATFORM_COLOR.wellhub }}>GP:{gp}</div>}
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

function ReservasTab({ demo }: { demo: boolean }) {
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
    enabled: !demo,
  });

  const effectiveBookings = demo ? buildDemoBookings() : bookings;

  const filtered = useMemo(() => {
    return (effectiveBookings ?? []).filter((b) => {
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
  }, [effectiveBookings, platformFilter, statusFilter, search]);

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
            <SelectItem value="wellhub">Wellhub</SelectItem>
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

      {!demo && isLoading ? (
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
                          onClick={() => demo ? toast.info("Modo demo — conecta una plataforma para hacer check-in") : checkinMutation.mutate(b.id)}
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
                <SelectItem value="wellhub">Wellhub</SelectItem>
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

function ExportarTab({ demo }: { demo: boolean }) {
  const { data: configs } = useQuery<PlatformConfig[]>({
    queryKey: ["platform-configs"],
    queryFn: async () => {
      const res = await fetch("/api/platforms/config");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !demo,
  });

  const [weekDate, setWeekDate] = useState(new Date());
  const ws = format(startOfWeek(weekDate, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const effectiveConfigs = demo ? DEMO_CONFIGS : configs;
  const active = effectiveConfigs?.filter((c) => c.isActive) ?? [];

  async function handleDownload(platform: string) {
    if (demo) {
      toast.info("Modo demo — conecta una plataforma para exportar horarios reales");
      return;
    }
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

function buildDemoLiquidation(month: string): LiquidationData {
  const classNames = ["Cycling", "Yoga Flow", "HIIT", "Pilates", "Barre", "Boxing"];
  const cpCheckedIn = Array.from({ length: 12 }, (_, i) => ({
    className: classNames[i % classNames.length],
    date: `${month}-${String(Math.min(28, 3 + i * 2)).padStart(2, "0")}`,
    bookingId: `CP-${20000 + i}`,
  }));
  const gpCheckedIn = Array.from({ length: 7 }, (_, i) => ({
    className: classNames[(i + 2) % classNames.length],
    date: `${month}-${String(Math.min(28, 5 + i * 3)).padStart(2, "0")}`,
    bookingId: `GP-${30000 + i}`,
  }));

  return {
    month,
    platforms: [
      {
        platform: "classpass",
        checkedIn: cpCheckedIn,
        absent: [
          { className: "Cycling", date: `${month}-10`, bookingId: "CP-20099" },
          { className: "HIIT", date: `${month}-18`, bookingId: "CP-20100" },
        ],
        rate: 6.5,
        totalEstimated: cpCheckedIn.length * 6.5,
      },
      {
        platform: "wellhub",
        checkedIn: gpCheckedIn,
        absent: [
          { className: "Barre", date: `${month}-14`, bookingId: "GP-30099" },
        ],
        rate: 5.0,
        totalEstimated: gpCheckedIn.length * 5.0,
      },
    ],
    grandTotal: cpCheckedIn.length * 6.5 + gpCheckedIn.length * 5.0,
  };
}

function LiquidacionTab({ demo }: { demo: boolean }) {
  const currency = useCurrency();
  const [monthDate, setMonthDate] = useState(new Date());
  const month = format(startOfMonth(monthDate), "yyyy-MM");

  const formatPlatformAmount = (amount: number): string => {
    try {
      return new Intl.NumberFormat(currency.intlLocale, {
        style: "currency",
        currency: currency.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return formatMoney(amount, currency);
    }
  };

  const { data, isLoading } = useQuery<LiquidationData>({
    queryKey: ["platform-liquidation", month],
    queryFn: async () => {
      const res = await fetch(`/api/platforms/liquidation?month=${month}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !demo,
  });

  const effectiveData = demo ? buildDemoLiquidation(month) : data;

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

      {!demo && isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !effectiveData || effectiveData.platforms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted">No hay datos de liquidación para este mes</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {effectiveData.platforms.map((p) => (
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
                      {formatPlatformAmount(p.totalEstimated)}
                    </p>
                    <p className="text-xs text-muted">
                      {p.checkedIn.length} visitas × {formatPlatformAmount(p.rate)}
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
                            {formatPlatformAmount(p.rate)}
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
              <p className="font-mono text-xl font-bold">{formatPlatformAmount(effectiveData.grandTotal)}</p>
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

// ─── Wellhub Conversion Tab ────────────────────────────

interface ConversionResponse {
  funnel: {
    visitors_total: number;
    with_profile: number;
    linked_to_user: number;
    with_active_membership: number;
    with_active_package: number;
    with_active_subscription: number;
  };
  avgDaysToConvert: number | null;
  recentConversions: Array<{
    id: string;
    name: string;
    image: string | null;
    email: string | null;
    firstSeenAt: string;
    linkedAt: string | null;
    linkedVia: string | null;
  }>;
}

function WellhubConversionTab() {
  const { data, isLoading } = useQuery<ConversionResponse>({
    queryKey: ["wellhub-conversion"],
    queryFn: async () => (await fetch("/api/platforms/wellhub/conversion")).json(),
  });

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted">Calculando…</div>;
  }
  if (!data) {
    return <div className="py-12 text-center text-sm text-muted">Sin datos.</div>;
  }

  const f = data.funnel;
  const pct = (n: number) =>
    f.visitors_total > 0 ? Math.round((n / f.visitors_total) * 100) : 0;

  const stages = [
    { label: "Visitantes Wellhub vistos", value: f.visitors_total, hint: "Total único de gympass_ids." },
    { label: "Con email o teléfono", value: f.with_profile, hint: "Wellhub nos mandó datos suficientes para matchear." },
    { label: "Vinculados a User Magic", value: f.linked_to_user, hint: "Email / teléfono coincide con un User del estudio." },
    { label: "Con paquete activo", value: f.with_active_package, hint: "Compraron al menos un paquete Magic." },
    { label: "Con suscripción activa", value: f.with_active_subscription, hint: "Pagan suscripción recurrente." },
  ];

  return (
    <div className="space-y-6 py-4">
      <div>
        <h3 className="font-display text-lg font-semibold">Migración desde Wellhub</h3>
        <p className="text-xs text-muted">
          Mide cuántos visitantes que llegaron por Wellhub terminaron como miembros directos.
          El match es automático por email o teléfono — sólo cuenta si el usuario ya tiene una Membership del estudio.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {stages.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-stone-200 bg-card p-4 dark:border-border"
          >
            <p className="font-display text-2xl font-bold">{s.value}</p>
            <p className="mt-1 text-[11px] font-medium text-stone-600 dark:text-muted">
              {s.label}
            </p>
            <p className="mt-1 text-[10px] text-stone-400 dark:text-muted/70">{s.hint}</p>
            {f.visitors_total > 0 && (
              <p className="mt-2 text-[10px] font-medium text-orange-600">
                {pct(s.value)}% del total
              </p>
            )}
          </div>
        ))}
      </div>

      {data.avgDaysToConvert !== null && (
        <div className="rounded-xl border border-stone-200 bg-orange-50/50 p-4 text-sm dark:border-border dark:bg-orange-500/10">
          Tiempo promedio de conversión: <strong>{data.avgDaysToConvert.toFixed(1)} días</strong>{" "}
          desde la primera visita Wellhub hasta el vínculo con cuenta Magic.
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold">Conversiones recientes</h4>
        {data.recentConversions.length === 0 ? (
          <p className="text-xs text-muted">Sin conversiones aún.</p>
        ) : (
          <div className="space-y-2">
            {data.recentConversions.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl border border-stone-100 bg-card p-3 dark:border-border"
              >
                <div className="h-9 w-9 shrink-0 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-semibold">
                  {c.name[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {c.email && (
                    <p className="truncate text-[11px] text-muted">{c.email}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted">
                    Vinculado{" "}
                    {c.linkedAt
                      ? new Date(c.linkedAt).toLocaleDateString("es-ES")
                      : "—"}
                  </p>
                  <p className="text-[10px] text-stone-400 dark:text-muted/70">
                    {c.linkedVia === "email_match"
                      ? "Match por email"
                      : c.linkedVia === "phone_match"
                        ? "Match por teléfono"
                        : "Manual"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
