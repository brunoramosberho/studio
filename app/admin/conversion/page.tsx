"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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
  Star,
  Sparkles,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeDecoy, type DecoyPackage } from "@/lib/packages/decoy";
import { useFormatMoney } from "@/components/tenant-provider";
import { SectionTabs } from "@/components/admin/section-tabs";
import { INSIGHTS_TABS } from "@/components/admin/section-tab-configs";

// ── Types ──

interface ConversionStats {
  totals: {
    nudgesShown: number;
    nudgesShownTotal: number;
    conversions: number;
    conversionsTotal: number;
    conversionRate: number;
    mrr: number;
  };
  funnel: {
    reservasWithoutMembership: number;
    nudgesShown: number;
    nudgesShownTotal: number;
    interacted: number;
    interactedTotal: number;
    converted: number;
    convertedTotal: number;
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
  curatedEnabled: boolean;
  curatedFirstTimerIds: string[];
  curatedFirstTimerRecommendedId: string | null;
  curatedReturningIds: string[];
  curatedReturningRecommendedId: string | null;
}

interface SubscriptionPackage {
  id: string;
  name: string;
  price: number;
  currency: string;
  credits: number | null;
  type: string;
  maxPurchasesPerCustomer: number | null;
}

// ── Helpers ──

function useNudgeLabels() {
  const t = useTranslations("admin");
  return {
    booking_flow: t("nudgeBookingFlow"),
    intro_offer: t("nudgeIntroOffer"),
    savings_email: t("nudgeSavingsEmail"),
    package_upgrade: t("nudgePackageUpgrade"),
    post_class: t("nudgePostClass"),
  } as Record<string, string>;
}

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
  const t = useTranslations("admin");
  const [range, setRange] = useState("30d");

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <SectionTabs tabs={INSIGHTS_TABS} ariaLabel="Insights sections" />
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            {t("conversionToMembership")}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {t("conversionSubtitle")}
          </p>
        </div>

        <Tabs defaultValue="resultados" className="space-y-6">
          <TabsList>
            <TabsTrigger value="resultados">{t("resultsTab")}</TabsTrigger>
            <TabsTrigger value="configuracion">{t("configTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="resultados">
            <ResultsTab range={range} onRangeChange={setRange} />
          </TabsContent>

          <TabsContent value="configuracion">
            <ConfigTab />
          </TabsContent>
        </Tabs>
      </div>
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
  const t = useTranslations("admin");
  const formatCurrency = useFormatMoney();
  const NUDGE_LABELS = useNudgeLabels();
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
          <SelectTrigger className="w-[140px] bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t("last7days")}</SelectItem>
            <SelectItem value="30d">{t("last30days")}</SelectItem>
            <SelectItem value="90d">{t("last90days")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("usersReached")}
          value={totals.nudgesShown.toLocaleString()}
          subtitle={totals.nudgesShownTotal > totals.nudgesShown ? `${totals.nudgesShownTotal} impresiones` : undefined}
          icon={<Eye className="h-5 w-5 text-muted" />}
          trend={trendIndicator(trends.vsLastPeriod.nudges)}
        />
        <StatCard
          label={t("conversions")}
          value={totals.conversions.toLocaleString()}
          subtitle={totals.conversionsTotal > totals.conversions ? `${totals.conversionsTotal} totales` : undefined}
          icon={<ArrowRightLeft className="h-5 w-5 text-muted" />}
          trend={trendIndicator(trends.vsLastPeriod.conversions)}
        />
        <StatCard
          label={t("conversionRate")}
          value={`${(totals.conversionRate * 100).toFixed(1)}%`}
          icon={<Target className="h-5 w-5 text-muted" />}
          valueClassName={rateColor(totals.conversionRate)}
        />
        <StatCard
          label={t("mrrGenerated")}
          value={formatCurrency(totals.mrr)}
          icon={<DollarSign className="h-5 w-5 text-muted" />}
          valueClassName="text-emerald-700"
          trend={trendIndicator(trends.vsLastPeriod.mrr)}
        />
      </div>

      {/* Funnel */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {t("conversionFunnel")}
        </h3>
        <FunnelRow funnel={funnel} />
      </div>

      {/* By Automation */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {t("byAutomation")}
        </h3>
        <div className="space-y-3">
          {byAutomation
            .filter((a) => a.shown > 0)
            .map((a) => (
              <div
                key={a.type}
                className="flex items-center gap-4 rounded-xl border border-border px-4 py-3"
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
                    <p className="text-xs text-muted">{t("shown")}</p>
                    <p className="font-medium">{a.shown}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted">{t("conversions")}</p>
                    <p className="font-medium">{a.converted}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted">{t("conversionRate")}</p>
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
              {t("noDataForPeriod")}
            </p>
          )}
        </div>
      </div>

      {/* Recent Conversions */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {t("recentConversions")}
        </h3>
        {recentConversions.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">
            {t("noConversionsYet")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted">
                    {t("memberLabel")}
                  </th>
                  <th className="pb-2 text-left font-medium text-muted">
                    {t("automationLabel")}
                  </th>
                  <th className="pb-2 text-left font-medium text-muted">
                    {t("membershipLabel")}
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
                  <tr key={i} className="border-b border-border last:border-0">
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
                    <td className="py-2.5 text-foreground">
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
      </div>
    </div>
  );
}

// ── Stat Card ──

function StatCard({
  label,
  value,
  subtitle,
  icon,
  trend,
  valueClassName,
}: {
  label: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        {icon}
        {trend}
      </div>
      <p className={cn("mt-3 text-2xl font-bold", valueClassName ?? "text-foreground")}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted">{label}</p>
      {subtitle && (
        <p className="mt-0.5 text-[10px] text-muted/50">{subtitle}</p>
      )}
    </div>
  );
}

// ── Funnel Row ──

function FunnelRow({
  funnel,
}: {
  funnel: ConversionStats["funnel"];
}) {
  const t = useTranslations("admin");
  const steps = [
    { label: t("funnelBookingsNoMembership"), value: funnel.reservasWithoutMembership },
    { label: t("funnelNudgeShown"), value: funnel.nudgesShown, total: funnel.nudgesShownTotal },
    { label: t("funnelInteracted"), value: funnel.interacted, total: funnel.interactedTotal },
    { label: t("funnelConverted"), value: funnel.converted, total: funnel.convertedTotal },
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
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted/50" />
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

  const { data: allPackages } = useQuery<SubscriptionPackage[]>({
    queryKey: ["all-packages-for-curation"],
    queryFn: async () => {
      const res = await fetch("/api/packages");
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
      <CuratedPackagesConfig config={config} allPackages={allPackages ?? []} />
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
  const tc = useTranslations("common");
  return (
    <div className="rounded-2xl border border-border bg-card">
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
          className="data-[state=checked]:bg-[#3730B8] data-[state=unchecked]:bg-stone-300"
        />
      </div>
      {enabled && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-border"
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
                {tc("save")}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Curated packages (behavioural-economics decoy effect) ──

function AudienceEditor({
  title,
  hint,
  audience,
  ids,
  setIds,
  recommendedId,
  setRecommendedId,
  allPackages,
}: {
  title: string;
  hint: string;
  audience: "firstTimer" | "returning";
  ids: string[];
  setIds: (v: string[]) => void;
  recommendedId: string | null;
  setRecommendedId: (v: string | null) => void;
  allPackages: SubscriptionPackage[];
}) {
  const [suggesting, setSuggesting] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  const setSlot = (i: number, value: string) => {
    const next = [...ids];
    while (next.length <= i) next.push("");
    next[i] = value === "__none__" ? "" : value;
    setIds(next);
    if (recommendedId && !next.includes(recommendedId)) setRecommendedId(null);
  };

  const chosen: DecoyPackage[] = ids
    .filter(Boolean)
    .map((id) => allPackages.find((p) => p.id === id))
    .filter((p): p is SubscriptionPackage => !!p)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      credits: p.credits,
      type: p.type,
      maxPurchasesPerCustomer: p.maxPurchasesPerCustomer,
    }));
  const analysis = analyzeDecoy(chosen, recommendedId, audience);

  async function handleSuggest() {
    setSuggesting(true);
    try {
      const res = await fetch("/api/admin/conversion/suggest-decoy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.ids) && data.ids.length) {
        setIds(data.ids);
        setRecommendedId(data.recommendedId ?? null);
        setExplanation(data.explanation ?? null);
      }
    } finally {
      setSuggesting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            {title}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{hint}</p>
        </div>
        <button
          type="button"
          onClick={handleSuggest}
          disabled={suggesting}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-500/15 dark:text-amber-300 dark:hover:bg-amber-500/25"
        >
          {suggesting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Sugerir con Spark
        </button>
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => {
          const id = ids[i] ?? "";
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-4 text-center text-xs font-medium text-muted">
                {i + 1}
              </span>
              <Select value={id || "__none__"} onValueChange={(v) => setSlot(i, v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Elegir paquete" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— vacío —</SelectItem>
                  {allPackages.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                disabled={!id}
                onClick={() =>
                  setRecommendedId(recommendedId === id ? null : id)
                }
                title="Marcar como recomendado (preferred pick)"
                className="shrink-0 rounded-lg p-1.5 transition-colors hover:bg-surface disabled:opacity-30"
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    recommendedId === id && id
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted/50",
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
      {explanation && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50/70 p-2.5 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>{explanation}</span>
        </div>
      )}

      {chosen.length >= 2 && (
        <div className="mt-3 space-y-1 border-t border-border pt-2.5">
          {analysis.checks.map((c, i) => (
            <p
              key={i}
              className={cn(
                "flex items-start gap-1.5 text-[11px]",
                c.level === "ok"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400",
              )}
            >
              {c.level === "ok" ? (
                <Check className="mt-0.5 h-3 w-3 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              )}
              {c.message}
            </p>
          ))}
        </div>
      )}

      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> = preferido
        (badge &ldquo;Recomendado&rdquo;). El orden 1→3 es el que verá el cliente.
      </p>
    </div>
  );
}

function CuratedPackagesConfig({
  config,
  allPackages,
}: {
  config: ConversionConfig;
  allPackages: SubscriptionPackage[];
}) {
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(config.curatedEnabled);
  const [ftIds, setFtIds] = useState<string[]>(config.curatedFirstTimerIds ?? []);
  const [ftRec, setFtRec] = useState<string | null>(
    config.curatedFirstTimerRecommendedId ?? null,
  );
  const [rtIds, setRtIds] = useState<string[]>(config.curatedReturningIds ?? []);
  const [rtRec, setRtRec] = useState<string | null>(
    config.curatedReturningRecommendedId ?? null,
  );
  const [saving, setSaving] = useState(false);

  const clean = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));
  const anyConfigured = clean(ftIds).length > 0 || clean(rtIds).length > 0;

  async function persist(nextEnabled: boolean) {
    setSaving(true);
    try {
      const ft = clean(ftIds);
      const rt = clean(rtIds);
      await fetch("/api/admin/conversion/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curatedEnabled: nextEnabled,
          curatedFirstTimerIds: ft,
          curatedFirstTimerRecommendedId: ft.includes(ftRec ?? "") ? ftRec : null,
          curatedReturningIds: rt,
          curatedReturningRecommendedId: rt.includes(rtRec ?? "") ? rtRec : null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["conversion-config"] });
    } finally {
      setSaving(false);
    }
  }

  // Toggle controls "live" only — the editor below is always available, so the
  // admin can build + save the sets before turning it on. Can't go live empty.
  async function handleToggle(v: boolean) {
    if (v && !anyConfigured) return;
    setEnabled(v);
    await persist(v);
  }

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-4 px-6 py-5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface">
          <Sparkles className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Paquetes destacados · efecto decoy
          </h3>
          <p className="text-xs text-muted">
            Muestra 3 paquetes elegidos (con un preferido) en el booking y
            /packages; el resto queda en “ver más”. Apagado → se muestran todos
            como hoy.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={!enabled && !anyConfigured}
          className="data-[state=checked]:bg-[#3730B8] data-[state=unchecked]:bg-stone-300"
        />
      </div>

      <div className="space-y-4 border-t border-border px-6 py-5">
        <div className="rounded-xl bg-surface p-4 text-[11px] leading-relaxed text-muted">
          <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-foreground">
            <Info className="h-3.5 w-3.5" /> Cómo funciona el efecto decoy
          </p>
          <p>
            Elige 3 opciones: un <b>ancla</b> barata (mete el pie), tu{" "}
            <b>objetivo</b> ⭐ (lo que quieres empujar) y un <b>decoy</b> que
            cuesta ≥ que el objetivo pero ofrece menos — así el objetivo se
            vuelve la elección obvia. Configura los sets y <b>guarda</b>; luego
            actívalo con el switch de arriba. &ldquo;Sugerir con Spark&rdquo; lo
            arma por ti.
          </p>
        </div>
        <AudienceEditor
          title="Primera reserva"
          hint="Para quien nunca ha comprado. Objetivo: que vuelva."
          audience="firstTimer"
          ids={ftIds}
          setIds={setFtIds}
          recommendedId={ftRec}
          setRecommendedId={setFtRec}
          allPackages={allPackages}
        />
        <AudienceEditor
          title="Cliente recurrente"
          hint="Para quien ya compró antes. Objetivo: suscripción / paquete mayor."
          audience="returning"
          ids={rtIds}
          setIds={setRtIds}
          recommendedId={rtRec}
          setRecommendedId={setRtRec}
          allPackages={allPackages}
        />
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-muted">
            {enabled
              ? "Activo. Los cambios se aplican al guardar."
              : anyConfigured
                ? "Guarda y actívalo con el switch de arriba."
                : "Configura al menos un set para poder activarlo."}
          </p>
          <Button
            size="sm"
            onClick={() => persist(enabled)}
            disabled={saving}
            className="bg-[#3730B8] hover:bg-[#2D27A0]"
          >
            {saving ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-2 h-3.5 w-3.5" />
            )}
            {tc("save")}
          </Button>
        </div>
      </div>
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
  const t = useTranslations("admin");
  const formatCurrency = useFormatMoney();
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
      title={t("nudgeBookingFlow")}
      description={t("bookingFlowDesc")}
      icon={<Zap className="h-5 w-5 text-blue-600" />}
      enabled={config.showInBookingFlow}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("featuredMembership")}
          </label>
          <Select value={featured} onValueChange={setFeatured}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar membresía" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t("none")}</SelectItem>
              {memberships.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} — {formatCurrency(m.price, m.currency)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("showSavingsBanner")}
          </label>
          <Select value={savingsBanner} onValueChange={setSavingsBanner}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="always">{t("always")}</SelectItem>
              <SelectItem value="if_real">{t("onlyIfRealSavings")}</SelectItem>
              <SelectItem value="never">{t("never")}</SelectItem>
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
  const t = useTranslations("admin");
  const formatCurrency = useFormatMoney();
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
      title={t("nudgeIntroOffer")}
      description={t("introOfferDesc")}
      icon={<Gift className="h-5 w-5 text-purple-600" />}
      enabled={config.introOfferEnabled}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("introOfferPrice")}
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
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("membershipApplied")}
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
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("timerDuration")}
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
  const t = useTranslations("admin");
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
      title={t("nudgeSavingsEmail")}
      description={t("savingsEmailDesc")}
      icon={<Mail className="h-5 w-5 text-amber-600" />}
      enabled={config.savingsEmailEnabled}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("triggerClassesThisMonth")}
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
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("sendDelay")}
          </label>
          <Select
            value={String(delayHours)}
            onValueChange={(v) => setDelayHours(Number(v))}
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">{t("immediate")}</SelectItem>
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
  const t = useTranslations("admin");
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
      title={t("nudgePackageUpgrade")}
      description={t("packageUpgradeDesc")}
      icon={<ArrowUpCircle className="h-5 w-5 text-emerald-600" />}
      enabled={config.packageUpgradeEnabled}
      onToggle={handleToggle}
      saving={saving}
      onSave={handleSave}
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("remainingClassesTrigger")}
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
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            Timing
          </label>
          <Select value={timing} onValueChange={setTiming}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="post_booking">{t("postBooking")}</SelectItem>
              <SelectItem value="pre_booking">{t("preBooking")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={credit}
            onCheckedChange={setCredit}
            className="data-[state=checked]:bg-[#3730B8] data-[state=unchecked]:bg-stone-300"
          />
          <label className="text-sm text-foreground">
            {t("applyProportionalCredit")}
          </label>
        </div>
      </div>
    </ConfigCard>
  );
}
