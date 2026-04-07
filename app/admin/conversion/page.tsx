"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Eye,
  ArrowRightLeft,
  Target,
  DollarSign,
  Zap,
  Gift,
  Mail,
  ArrowUpCircle,
  ChevronRight,
  Loader2,
  Info,
  Save,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";

// ── Types ──

interface ConversionStats {
  totals: {
    nudgesShown: number;
    conversions: number;
    conversionRate: number;
    mrr: number;
  };
  funnel: {
    reservasWithoutMembership: number;
    nudgesShown: number;
    interacted: number;
    converted: number;
  };
  byAutomation: Array<{
    type: string;
    shown: number;
    converted: number;
    conversionRate: number;
    mrr: number;
  }>;
  recentConversions: Array<{
    memberName: string;
    nudgeType: string;
    membershipName: string;
    revenue: number;
    convertedAt: string;
  }>;
  trends: {
    vsLastPeriod: { nudges: number; conversions: number; mrr: number };
  };
}

interface ConversionConfig {
  id: string;
  tenantId: string;
  showInBookingFlow: boolean;
  featuredMembershipId: string | null;
  showSavingsBanner: string;
  introOfferEnabled: boolean;
  introOfferPrice: number;
  introOfferMembershipId: string | null;
  introOfferTimerHours: number;
  savingsEmailEnabled: boolean;
  savingsEmailTriggerClasses: number;
  savingsEmailDelayHours: number;
  packageUpgradeEnabled: boolean;
  packageUpgradeTrigger: number;
  packageUpgradeTiming: string;
  packageUpgradeCredit: boolean;
  maxNudgesPerMemberPerWeek: number;
}

interface SubscriptionPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
}

// ── Helpers ──

const NUDGE_LABELS: Record<string, string> = {
  booking_flow: "Opciones en reserva",
  intro_offer: "Intro Offer",
  savings_email: "Email de ahorro",
  package_upgrade: "Upgrade paquete",
  post_class: "Post clase",
};

const NUDGE_ICONS: Record<string, React.ReactNode> = {
  booking_flow: <Zap className="h-4 w-4" />,
  intro_offer: <Gift className="h-4 w-4" />,
  savings_email: <Mail className="h-4 w-4" />,
  package_upgrade: <ArrowUpCircle className="h-4 w-4" />,
  post_class: <Target className="h-4 w-4" />,
};

const NUDGE_BADGE_STYLES: Record<string, string> = {
  booking_flow: "bg-blue-50 text-blue-700",
  intro_offer: "bg-purple-50 text-purple-700",
  savings_email: "bg-amber-50 text-amber-700",
  package_upgrade: "bg-emerald-50 text-emerald-700",
  post_class: "bg-surface text-foreground",
};

function rateColor(rate: number): string {
  if (rate > 0.12) return "text-emerald-700";
  if (rate >= 0.06) return "text-amber-700";
  return "text-red-700";
}

function trendIndicator(value: number) {
  if (value > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-emerald-700">
        <TrendingUp className="h-3 w-3" />
        +{value.toFixed(1)}%
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-red-700">
        <TrendingDown className="h-3 w-3" />
        {value.toFixed(1)}%
      </span>
    );
  }
  return <span className="text-xs text-muted">—</span>;
}

// ── Main Page ──

export default function ConversionPage() {
  const [range, setRange] = useState("30d");
  const [tab, setTab] = useState<"resultados" | "configuracion">("resultados");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            Conversión a membresía
          </h1>
          <p className="mt-1 text-muted">
            Automatizaciones para convertir clientes a membresías mensuales.
          </p>
        </motion.div>
      </div>

      <div className="flex items-center gap-1">
        {(["resultados", "configuracion"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t
                ? "bg-admin text-white"
                : "bg-surface text-muted hover:text-foreground",
            )}
          >
            {t === "resultados" ? "Resultados" : "Configuración"}
          </button>
        ))}
      </div>

      {tab === "resultados" ? (
        <ResultsTab range={range} onRangeChange={setRange} />
      ) : (
        <ConfigTab />
      )}
    </div>
  );
}

// ── Results Tab ──

function ResultsTab({
  range,
  onRangeChange,
}: {
  range: string;
  onRangeChange: (r: string) => void;
}) {
  const { data: stats, isLoading } = useQuery<ConversionStats>({
    queryKey: ["conversion-stats", range],
    queryFn: async () => {
      const res = await fetch(`/api/admin/conversion/stats?range=${range}`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  if (isLoading || !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-60 rounded-2xl" />
      </div>
    );
  }

  const { totals, funnel, byAutomation, recentConversions, trends } = stats;

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex justify-end">
        <Select value={range} onValueChange={onRangeChange}>
          <SelectTrigger className="w-[140px] bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 días</SelectItem>
            <SelectItem value="30d">Últimos 30 días</SelectItem>
            <SelectItem value="90d">Últimos 90 días</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Nudges mostrados"
          value={totals.nudgesShown.toLocaleString()}
          icon={<Eye className="h-5 w-5 text-muted" />}
          trend={trendIndicator(trends.vsLastPeriod.nudges)}
        />
        <StatCard
          label="Conversiones"
          value={totals.conversions.toLocaleString()}
          icon={<ArrowRightLeft className="h-5 w-5 text-muted" />}
          trend={trendIndicator(trends.vsLastPeriod.conversions)}
        />
        <StatCard
          label="Tasa conversión"
          value={`${(totals.conversionRate * 100).toFixed(1)}%`}
          icon={<Target className="h-5 w-5 text-muted" />}
          valueClassName={rateColor(totals.conversionRate)}
        />
        <StatCard
          label="MRR generado"
          value={formatCurrency(totals.mrr)}
          icon={<DollarSign className="h-5 w-5 text-muted" />}
          valueClassName="text-emerald-700"
          trend={trendIndicator(trends.vsLastPeriod.mrr)}
        />
      </div>

      {/* Funnel */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Funnel de conversión</CardTitle>
        </CardHeader>
        <CardContent>
        <FunnelRow funnel={funnel} />
        </CardContent>
      </Card>

      {/* By Automation */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Por automatización</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="space-y-3">
          {byAutomation
            .filter((a) => a.shown > 0)
            .map((a) => (
              <div
                key={a.type}
                className="flex items-center gap-4 rounded-xl border border-border/50 px-4 py-3"
              >
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                    NUDGE_BADGE_STYLES[a.type] ?? "bg-surface text-foreground",
                  )}
                >
                  {NUDGE_ICONS[a.type]}
                  {NUDGE_LABELS[a.type] ?? a.type}
                </span>
                <div className="flex flex-1 items-center justify-end gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-xs text-muted">Mostrado</p>
                    <p className="font-medium">{a.shown}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted">Conversiones</p>
                    <p className="font-medium">{a.converted}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted">Tasa</p>
                    <p className={cn("font-medium", rateColor(a.conversionRate))}>
                      {(a.conversionRate * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted">MRR</p>
                    <p className="font-medium text-emerald-700">
                      {formatCurrency(a.mrr)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          {byAutomation.every((a) => a.shown === 0) && (
            <p className="text-sm text-muted text-center py-4">
              Aún no hay datos para este período.
            </p>
          )}
        </div>
        </CardContent>
      </Card>

      {/* Recent Conversions */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Conversiones recientes</CardTitle>
        </CardHeader>
        <CardContent>
        {recentConversions.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">
            Aún no hay conversiones.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted">
                    Miembro
                  </th>
                  <th className="pb-2 text-left font-medium text-muted">
                    Automatización
                  </th>
                  <th className="pb-2 text-left font-medium text-muted">
                    Membresía
                  </th>
                  <th className="pb-2 text-right font-medium text-muted">
                    Revenue
                  </th>
                  <th className="pb-2 text-right font-medium text-muted">
                    Fecha
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentConversions.map((c, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2.5 font-medium text-foreground">
                      {c.memberName}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          NUDGE_BADGE_STYLES[c.nudgeType] ??
                            "bg-surface text-foreground",
                        )}
                      >
                        {NUDGE_LABELS[c.nudgeType] ?? c.nudgeType}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted">
                      {c.membershipName}
                    </td>
                    <td className="py-2.5 text-right font-medium text-emerald-700">
                      {formatCurrency(c.revenue)}
                    </td>
                    <td className="py-2.5 text-right text-muted">
                      {new Date(c.convertedAt).toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "short",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Stat Card ──

function StatCard({
  label,
  value,
  icon,
  trend,
  valueClassName,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          {icon}
          {trend}
        </div>
        <p className={cn("mt-3 text-2xl font-bold", valueClassName ?? "text-foreground")}>
          {value}
        </p>
        <p className="mt-0.5 text-xs text-muted">{label}</p>
      </CardContent>
    </Card>
  );
}

// ── Funnel Row ──

function FunnelRow({
  funnel,
}: {
  funnel: ConversionStats["funnel"];
}) {
  const steps = [
    { label: "Reservas sin membresía", value: funnel.reservasWithoutMembership },
    { label: "Nudge mostrado", value: funnel.nudgesShown },
    { label: "Interactuaron", value: funnel.interacted },
    { label: "Compraron", value: funnel.converted },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {steps.map((step, i) => {
        const prevValue = i > 0 ? steps[i - 1].value : step.value;
        const pct =
          prevValue > 0 ? ((step.value / prevValue) * 100).toFixed(1) : "0.0";

        return (
          <div key={step.label} className="flex items-center gap-2">
            {i > 0 && (
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted/40" />
            )}
            <div className="flex flex-col items-center text-center min-w-[100px]">
              <p className="text-2xl font-bold text-foreground">
                {step.value.toLocaleString()}
              </p>
              <p className="text-xs text-muted">{step.label}</p>
              {i > 0 && (
                <p className="mt-0.5 text-xs font-medium text-muted">
                  {pct}%
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Config Tab ──

function ConfigTab() {
  const queryClient = useQueryClient();

  const { data: config, isLoading: configLoading } =
    useQuery<ConversionConfig>({
      queryKey: ["conversion-config"],
      queryFn: async () => {
        const res = await fetch("/api/admin/conversion/config");
        if (!res.ok) throw new Error("Failed to fetch config");
        return res.json();
      },
    });

  const { data: memberships } = useQuery<SubscriptionPackage[]>({
    queryKey: ["subscription-packages"],
    queryFn: async () => {
      const res = await fetch("/api/packages?type=SUBSCRIPTION");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : data.packages ?? [];
    },
  });

  if (configLoading || !config) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BookingFlowConfig
        config={config}
        memberships={memberships ?? []}
      />
      <IntroOfferConfig
        config={config}
        memberships={memberships ?? []}
      />
      <SavingsEmailConfig config={config} />
      <PackageUpgradeConfig config={config} />
    </div>
  );
}

// ── Config card wrapper ──

function ConfigCard({
  title,
  description,
  icon,
  enabled,
  onToggle,
  children,
  saving,
  onSave,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white">
      <div className="flex items-center gap-4 px-6 py-5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          className="data-[state=checked]:bg-[#3730B8] data-[state=unchecked]:bg-border"
        />
      </div>
      {enabled && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-border/50"
        >
          <div className="px-6 py-5 space-y-4">
            {children}
            <div className="flex justify-end pt-2">
              <Button
                size="sm"
                onClick={onSave}
                disabled={saving}
                className="bg-[#3730B8] hover:bg-[#2D27A0]"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-2 h-3.5 w-3.5" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Automation 1: Booking Flow ──

function BookingFlowConfig({
  config,
  memberships,
}: {
  config: ConversionConfig;
  memberships: SubscriptionPackage[];
}) {
  const queryClient = useQueryClient();
  const [featured, setFeatured] = useState(config.featuredMembershipId ?? "__none__");
  const [savingsBanner, setSavingsBanner] = useState(config.showSavingsBanner);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/admin/conversion/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showInBookingFlow: true,
          featuredMembershipId: featured === "__none__" ? null : featured,
          showSavingsBanner: savingsBanner,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    await fetch("/api/admin/conversion/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showInBookingFlow: enabled }),
    });
    queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
  }

  return (
    <ConfigCard
      title="Opciones en reserva"
      description="Muestra opciones de membresía durante el flujo de reserva"
      icon={<Zap className="h-5 w-5 text-blue-600" />}
      enabled={config.showInBookingFlow}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Membresía destacada como &quot;Recomendada&quot;
          </label>
          <Select value={featured} onValueChange={setFeatured}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar membresía" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Ninguna</SelectItem>
              {memberships.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} — {formatCurrency(m.price, m.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Mostrar banner de ahorro
          </label>
          <Select value={savingsBanner} onValueChange={setSavingsBanner}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">Siempre</SelectItem>
              <SelectItem value="if_real">Solo si hay ahorro real</SelectItem>
              <SelectItem value="never">Nunca</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </ConfigCard>
  );
}

// ── Automation 2: Intro Offer ──

function IntroOfferConfig({
  config,
  memberships,
}: {
  config: ConversionConfig;
  memberships: SubscriptionPackage[];
}) {
  const queryClient = useQueryClient();
  const [price, setPrice] = useState(config.introOfferPrice);
  const [membershipId, setMembershipId] = useState(
    config.introOfferMembershipId ?? "",
  );
  const [timerHours, setTimerHours] = useState(config.introOfferTimerHours);
  const [saving, setSaving] = useState(false);

  const selectedPkg = memberships.find((m) => m.id === membershipId);
  const savingAmount = selectedPkg ? selectedPkg.price - price : 0;
  const savingPct =
    selectedPkg && selectedPkg.price > 0
      ? ((savingAmount / selectedPkg.price) * 100).toFixed(0)
      : "0";

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/admin/conversion/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          introOfferEnabled: true,
          introOfferPrice: price,
          introOfferMembershipId: membershipId || null,
          introOfferTimerHours: timerHours,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    await fetch("/api/admin/conversion/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ introOfferEnabled: enabled }),
    });
    queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
  }

  return (
    <ConfigCard
      title="Intro Offer"
      description="Oferta especial para la primera visita de un cliente"
      icon={<Gift className="h-5 w-5 text-purple-600" />}
      enabled={config.introOfferEnabled}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Precio primer mes (€)
          </label>
          <Input
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-32"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Membresía a la que aplica
          </label>
          <Select value={membershipId} onValueChange={setMembershipId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar membresía" />
            </SelectTrigger>
            <SelectContent>
              {memberships.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} — {formatCurrency(m.price, m.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Duración del timer
          </label>
          <Select
            value={String(timerHours)}
            onValueChange={(v) => setTimerHours(Number(v))}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24">24 horas</SelectItem>
              <SelectItem value="48">48 horas</SelectItem>
              <SelectItem value="72">72 horas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {savingAmount > 0 && (
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Ahorro: {formatCurrency(savingAmount)} ({savingPct}%)
          </div>
        )}
      </div>
    </ConfigCard>
  );
}

// ── Automation 3: Savings Email ──

function SavingsEmailConfig({ config }: { config: ConversionConfig }) {
  const queryClient = useQueryClient();
  const [triggerClasses, setTriggerClasses] = useState(
    config.savingsEmailTriggerClasses,
  );
  const [delayHours, setDelayHours] = useState(config.savingsEmailDelayHours);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/admin/conversion/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          savingsEmailEnabled: true,
          savingsEmailTriggerClasses: triggerClasses,
          savingsEmailDelayHours: delayHours,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    await fetch("/api/admin/conversion/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savingsEmailEnabled: enabled }),
    });
    queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
  }

  return (
    <ConfigCard
      title="Email de ahorro"
      description="Email automático con el ahorro acumulado del miembro"
      icon={<Mail className="h-5 w-5 text-amber-600" />}
      enabled={config.savingsEmailEnabled}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Trigger: clases sueltas este mes
          </label>
          <Select
            value={String(triggerClasses)}
            onValueChange={(v) => setTriggerClasses(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2, 3, 4, 5].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} clases
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Delay de envío
          </label>
          <Select
            value={String(delayHours)}
            onValueChange={(v) => setDelayHours(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Inmediato</SelectItem>
              <SelectItem value="24">24 horas</SelectItem>
              <SelectItem value="48">48 horas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2">
          <Info className="h-4 w-4 flex-shrink-0 text-blue-600 mt-0.5" />
          <p className="text-xs text-blue-800">
            Solo se envía si el ahorro calculado es positivo (el miembro ha
            gastado más que el precio de la membresía mensual).
          </p>
        </div>
      </div>
    </ConfigCard>
  );
}

// ── Automation 4: Package Upgrade ──

function PackageUpgradeConfig({ config }: { config: ConversionConfig }) {
  const queryClient = useQueryClient();
  const [trigger, setTrigger] = useState(config.packageUpgradeTrigger);
  const [timing, setTiming] = useState(config.packageUpgradeTiming);
  const [credit, setCredit] = useState(config.packageUpgradeCredit);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/admin/conversion/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageUpgradeEnabled: true,
          packageUpgradeTrigger: trigger,
          packageUpgradeTiming: timing,
          packageUpgradeCredit: credit,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    await fetch("/api/admin/conversion/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packageUpgradeEnabled: enabled }),
    });
    queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
  }

  return (
    <ConfigCard
      title="Upgrade paquete"
      description="Ofrecer upgrade a membresía cuando el paquete está por acabarse"
      icon={<ArrowUpCircle className="h-5 w-5 text-emerald-600" />}
      enabled={config.packageUpgradeEnabled}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Clases restantes que activan el nudge
          </label>
          <Select
            value={String(trigger)}
            onValueChange={(v) => setTrigger(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} clase{n !== 1 ? "s" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">
            Timing
          </label>
          <Select value={timing} onValueChange={setTiming}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="post_booking">Post-reserva</SelectItem>
              <SelectItem value="pre_booking">Pre-reserva</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={credit}
            onCheckedChange={setCredit}
            className="data-[state=checked]:bg-[#3730B8] data-[state=unchecked]:bg-border"
          />
          <label className="text-sm text-foreground">
            Aplicar crédito proporcional del paquete restante
          </label>
        </div>
      </div>
    </ConfigCard>
  );
}
