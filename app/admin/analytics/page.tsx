"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/components/tenant-provider";
import { formatMoney } from "@/lib/currency";
import { SectionTabs } from "@/components/admin/section-tabs";
import { INSIGHTS_TABS } from "@/components/admin/section-tab-configs";
import { InsightsSlotMatrix } from "@/components/admin/insights-slot-matrix";

// ─── Types (mirror /api/admin/insights) ─────────────────

interface Point {
  d: string;
  v: number;
}

interface Metric {
  total: number;
  prevTotal: number | null;
  points: Point[];
}

interface InsightsData {
  range: {
    from: string;
    to: string;
    prevFrom: string | null;
    prevTo: string | null;
    agg: "day" | "week";
  };
  metrics: {
    revenue: Metric;
    bookings: Metric;
    visits: Metric;
    occupancy: Metric;
    classes: Metric;
    cancellations: Metric;
    noShows: Metric;
    newClients: Metric;
    newMembers: Metric;
    activeSubscriptions: Metric;
  };
  retention: { repeat: number; new: number };
  supply: {
    points: { d: string; capacity: number; seats: number }[];
    capacity: number;
    seats: number;
    empty: number;
    classes: number;
    seatsPerClass: number;
    prev: { seats: number; classes: number; seatsPerClass: number | null } | null;
    comparable: boolean;
    split: { fromClasses: number; fromFilling: number } | null;
  };
  leadTimes: {
    distribution: { bucket: string; app: number; wellhub: number }[];
    byHour: { hour: number; app: number | null; wellhub: number | null }[];
    totals: { app: number; wellhub: number };
  };
  glance: {
    visits: number;
    uniqueCustomers: number;
    avgVisitsPerCustomer: number;
    classes: number;
    cancellations: number;
    noShows: number;
    capacityFilled: number;
    conversionToMembership: number | null;
  };
}

// ─── Date range presets ─────────────────────────────────

type Preset = "7d" | "30d" | "month" | "lastMonth" | "90d" | "year" | "custom";

function presetRange(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400_000);
  switch (preset) {
    case "7d":
      return { from: iso(daysAgo(6)), to: iso(now) };
    case "30d":
      return { from: iso(daysAgo(29)), to: iso(now) };
    case "month":
      return {
        from: iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
        to: iso(now),
      };
    case "lastMonth": {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
      return { from: iso(start), to: iso(end) };
    }
    case "90d":
      return { from: iso(daysAgo(89)), to: iso(now) };
    case "year":
      return { from: iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1))), to: iso(now) };
    default:
      return { from: iso(daysAgo(29)), to: iso(now) };
  }
}

// ─── Delta badge ────────────────────────────────────────

function DeltaBadge({
  total,
  prevTotal,
  unit,
  invert,
}: {
  total: number;
  prevTotal: number | null;
  /** "pct-points" for occupancy; otherwise relative % change. */
  unit?: "pct-points";
  /** For metrics where DOWN is good (cancellations, no-shows). */
  invert?: boolean;
}) {
  if (prevTotal === null || prevTotal === undefined) return null;
  let delta: number;
  let label: string;
  if (unit === "pct-points") {
    delta = total - prevTotal;
    label = `${delta > 0 ? "+" : ""}${Math.round(delta)} pt`;
  } else {
    if (prevTotal === 0) return null;
    delta = ((total - prevTotal) / prevTotal) * 100;
    label = `${delta > 0 ? "+" : ""}${Math.round(delta)}%`;
  }
  if (Math.round(Math.abs(delta)) === 0) return null;
  const good = invert ? delta < 0 : delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        good
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
      )}
    >
      {delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

// ─── Metric card ────────────────────────────────────────

function MetricCard({
  title,
  metric,
  format,
  big,
  suffix,
  invert,
  pctPoints,
  prevLabel,
  chartColor = "#6366f1",
  note,
}: {
  title: string;
  metric: Metric | undefined;
  format?: (v: number) => string;
  big?: boolean;
  suffix?: string;
  invert?: boolean;
  pctPoints?: boolean;
  prevLabel: string;
  chartColor?: string;
  /** Scale behind the number — keeps a ratio like occupancy from reading alone. */
  note?: string;
}) {
  const gradientId = useMemo(() => `g-${title.replace(/\W/g, "")}`, [title]);
  if (!metric) return <Skeleton className={cn("rounded-2xl", big ? "h-48" : "h-36")} />;

  const fmt = format ?? ((v: number) => v.toLocaleString());
  const data = metric.points.map((p) => ({ d: p.d.slice(5), v: p.v }));

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">{title}</p>
        <DeltaBadge
          total={metric.total}
          prevTotal={metric.prevTotal}
          invert={invert}
          unit={pctPoints ? "pct-points" : undefined}
        />
      </div>
      <p className={cn("mt-1 font-display font-bold text-foreground", big ? "text-3xl" : "text-xl")}>
        {fmt(metric.total)}
        {suffix}
      </p>
      {note ? (
        <p className="text-[10px] text-muted/60">
          {note}
          {metric.prevTotal !== null && (
            <span className="ml-1">
              · {fmt(metric.prevTotal)}
              {suffix} {prevLabel}
            </span>
          )}
        </p>
      ) : (
        metric.prevTotal !== null && (
          <p className="text-[10px] text-muted/60">
            {fmt(metric.prevTotal)}
            {suffix} {prevLabel}
          </p>
        )
      )}
      <div className={cn("mt-2", big ? "h-28" : "h-14")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {big && (
              <XAxis
                dataKey="d"
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
            )}
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.06)",
                padding: "4px 8px",
              }}
              labelStyle={{ fontSize: 10 }}
              formatter={(value) => [fmt(Number(value ?? 0)) + (suffix ?? ""), title]}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={chartColor}
              strokeWidth={1.8}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────

export default function InsightsPage() {
  const t = useTranslations("admin.insightsPage");
  const currency = useCurrency();

  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [agg, setAgg] = useState<"day" | "week">("day");
  const [compare, setCompare] = useState(true);

  const range =
    preset === "custom" && customFrom && customTo
      ? { from: customFrom, to: customTo }
      : presetRange(preset);

  const { data, isLoading } = useQuery<InsightsData>({
    queryKey: ["admin-insights", range.from, range.to, agg, compare],
    queryFn: async () => {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        agg,
        compare: compare ? "prev" : "none",
      });
      const res = await fetch(`/api/admin/insights?${params}`);
      if (!res.ok) throw new Error("Failed to fetch insights");
      return res.json();
    },
  });

  const m = data?.metrics;
  const money = (v: number) => formatMoney(v, currency);
  const prevLabel = t("prevPeriod");
  const retentionTotal = (data?.retention.new ?? 0) + (data?.retention.repeat ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <SectionTabs tabs={INSIGHTS_TABS} ariaLabel="Insights sections" />

      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </motion.div>

      {/* Filters */}
      <div className="sticky top-[calc(3.5rem+4px)] z-20 -mx-4 bg-background/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="h-9 w-[170px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">{t("range7d")}</SelectItem>
              <SelectItem value="30d">{t("range30d")}</SelectItem>
              <SelectItem value="month">{t("rangeMonth")}</SelectItem>
              <SelectItem value="lastMonth">{t("rangeLastMonth")}</SelectItem>
              <SelectItem value="90d">{t("range90d")}</SelectItem>
              <SelectItem value="year">{t("rangeYear")}</SelectItem>
              <SelectItem value="custom">{t("rangeCustom")}</SelectItem>
            </SelectContent>
          </Select>

          {preset === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-9 rounded-lg border border-input-border bg-card px-2 text-sm"
              />
              <span className="text-xs text-muted">–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-9 rounded-lg border border-input-border bg-card px-2 text-sm"
              />
            </>
          )}

          <div className="flex overflow-hidden rounded-lg border border-border">
            {(["day", "week"] as const).map((a) => (
              <button
                key={a}
                onClick={() => setAgg(a)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  agg === a
                    ? "bg-foreground text-background"
                    : "bg-card text-muted hover:text-foreground",
                )}
              >
                {a === "day" ? t("aggDay") : t("aggWeek")}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCompare((c) => !c)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              compare
                ? "border-foreground/20 bg-foreground text-background"
                : "border-border bg-card text-muted hover:text-foreground",
            )}
          >
            {t("compare")}
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-48 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Headline metrics */}
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricCard
              title={t("revenue")}
              metric={m?.revenue}
              format={money}
              big
              prevLabel={prevLabel}
            />
            <MetricCard
              title={t("occupancy")}
              metric={m?.occupancy}
              suffix="%"
              big
              pctPoints
              chartColor="#10b981"
              prevLabel={prevLabel}
              note={
                data
                  ? t("occupancyScale", {
                      classes: data.supply.classes,
                      perClass: data.supply.seatsPerClass,
                    })
                  : undefined
              }
            />
          </div>

          {/* Supply vs demand — the scale behind the occupancy ratio */}
          {data && data.supply.classes > 0 && <SupplyDemandCard supply={data.supply} />}

          {/* Secondary metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title={t("bookings")} metric={m?.bookings} prevLabel={prevLabel} />
            <MetricCard title={t("visits")} metric={m?.visits} prevLabel={prevLabel} />
            <MetricCard title={t("classes")} metric={m?.classes} prevLabel={prevLabel} />
            <MetricCard
              title={t("activeSubscriptions")}
              metric={m?.activeSubscriptions}
              prevLabel={prevLabel}
            />
            <MetricCard
              title={t("newClients")}
              metric={m?.newClients}
              chartColor="#8b5cf6"
              prevLabel={prevLabel}
            />
            <MetricCard
              title={t("newMembers")}
              metric={m?.newMembers}
              chartColor="#8b5cf6"
              prevLabel={prevLabel}
            />
            <MetricCard
              title={t("cancellations")}
              metric={m?.cancellations}
              invert
              chartColor="#f59e0b"
              prevLabel={prevLabel}
            />
            <MetricCard
              title={t("noShows")}
              metric={m?.noShows}
              invert
              chartColor="#ef4444"
              prevLabel={prevLabel}
            />
          </div>

          {/* Retention + glance + conversion */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Retention new vs repeat */}
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
                {t("retentionTitle")}
              </p>
              <p className="mt-1 text-[11px] text-muted">{t("retentionHint")}</p>
              {retentionTotal > 0 ? (
                <div className="mt-4 space-y-3">
                  {(
                    [
                      {
                        label: t("retentionRepeat"),
                        value: data?.retention.repeat ?? 0,
                        color: "bg-emerald-500",
                      },
                      {
                        label: t("retentionNew"),
                        value: data?.retention.new ?? 0,
                        color: "bg-admin",
                      },
                    ] as const
                  ).map((row) => (
                    <div key={row.label}>
                      <div className="mb-1 flex items-baseline justify-between">
                        <span className="text-xs font-medium text-foreground/80">{row.label}</span>
                        <span className="text-xs font-semibold tabular-nums">
                          {row.value} · {Math.round((row.value / retentionTotal) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-surface">
                        <div
                          className={cn("h-full rounded-full", row.color)}
                          style={{ width: `${(row.value / retentionTotal) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs text-muted">{t("noData")}</p>
              )}
            </div>

            {/* Business at a glance */}
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
                {t("glanceTitle")}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                {(
                  [
                    [t("glanceVisits"), data?.glance.visits.toLocaleString()],
                    [t("glanceUnique"), data?.glance.uniqueCustomers.toLocaleString()],
                    [t("glanceAvgVisits"), data?.glance.avgVisitsPerCustomer],
                    [t("glanceClasses"), data?.glance.classes.toLocaleString()],
                    [t("glanceCancellations"), data?.glance.cancellations.toLocaleString()],
                    [t("glanceNoShows"), data?.glance.noShows.toLocaleString()],
                    [t("glanceCapacity"), `${data?.glance.capacityFilled ?? 0}%`],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label as string}>
                    <dt className="text-[10px] text-muted">{label}</dt>
                    <dd className="text-sm font-semibold text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Conversion to membership — the page's door to /admin/conversion */}
            <div className="flex flex-col rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
                {t("conversionTitle")}
              </p>
              <div className="mt-1 flex-1">
                <p className="font-display text-3xl font-bold text-foreground">
                  {data?.glance.conversionToMembership != null
                    ? `${data.glance.conversionToMembership}%`
                    : "—"}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {t("conversionHint", {
                    members: m?.newMembers.total ?? 0,
                    clients: m?.newClients.total ?? 0,
                  })}
                </p>
              </div>
              <Link
                href="/admin/conversion"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-admin hover:underline"
              >
                {t("conversionLink")}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {/* Booking lead times: how far in advance people reserve */}
          {data && data.leadTimes.totals.app + data.leadTimes.totals.wellhub > 0 && (
            <LeadTimesCard leadTimes={data.leadTimes} />
          )}

          {/* Day×hour slot explorer: best time slots by metric/discipline/coach */}
          <InsightsSlotMatrix from={range.from} to={range.to} />
        </>
      )}
    </div>
  );
}

const SUPPLY_SEATS_COLOR = "#6366f1";

function SupplyDemandCard({ supply }: { supply: InsightsData["supply"] }) {
  const t = useTranslations("admin.insightsPage");
  const data = supply.points.map((p) => ({
    d: p.d.slice(5),
    seats: p.seats,
    empty: Math.max(0, p.capacity - p.seats),
  }));

  const perClassDelta =
    supply.prev?.seatsPerClass != null
      ? Math.round((supply.seatsPerClass - supply.prev.seatsPerClass) * 10) / 10
      : null;
  const split = supply.split;
  const seatsDelta = supply.prev ? supply.seats - supply.prev.seats : null;
  // Bars are sized against the larger effect so the smaller one stays visible.
  const splitMax = split
    ? Math.max(Math.abs(split.fromClasses), Math.abs(split.fromFilling), 1)
    : 1;

  const stats: { label: string; value: string }[] = [
    { label: t("supplyClasses"), value: supply.classes.toLocaleString() },
    { label: t("supplyOffered"), value: supply.capacity.toLocaleString() },
    { label: t("supplyTaken"), value: supply.seats.toLocaleString() },
    { label: t("supplyEmpty"), value: supply.empty.toLocaleString() },
  ];

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
            {t("supplyTitle")}
          </p>
          <p className="mt-1 text-[11px] text-muted">{t("supplyHint")}</p>
        </div>
        <span className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: SUPPLY_SEATS_COLOR }}
            />
            {t("supplyTaken")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px] border border-border bg-surface" />
            {t("supplyEmpty")}
          </span>
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-surface/60 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-muted/60">{s.label}</p>
            <p className="mt-0.5 font-display text-lg font-bold tabular-nums text-foreground">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <XAxis
              dataKey="d"
              tick={{ fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis hide />
            <Tooltip
              contentStyle={LEAD_TOOLTIP_STYLE}
              labelStyle={{ fontSize: 10 }}
              formatter={(value, name) => [
                Number(value ?? 0).toLocaleString(),
                name === "seats" ? t("supplyTaken") : t("supplyEmpty"),
              ]}
            />
            <Bar dataKey="seats" stackId="s" fill={SUPPLY_SEATS_COLOR} radius={[0, 0, 3, 3]} />
            <Bar
              dataKey="empty"
              stackId="s"
              fill="currentColor"
              className="text-border/50"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {perClassDelta !== null && supply.prev?.seatsPerClass != null && (
        <div className="mt-4 border-t border-border/50 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
            {t("supplySplitTitle")}
          </p>
          <p className="mt-1 text-sm text-foreground">
            {t("supplyPerClassLine", {
              prev: supply.prev.seatsPerClass,
              now: supply.seatsPerClass,
            })}
          </p>

          {split ? (
            <div className="mt-3 space-y-2">
              {(
                [
                  { key: "classes", label: t("supplyFromClasses"), value: split.fromClasses },
                  { key: "filling", label: t("supplyFromFilling"), value: split.fromFilling },
                ] as const
              ).map((row) => (
                <div key={row.key} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 text-xs text-muted">{row.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        row.value >= 0 ? "bg-emerald-500" : "bg-rose-500",
                      )}
                      style={{ width: `${(Math.abs(row.value) / splitMax) * 100}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "w-16 shrink-0 text-right text-xs font-semibold tabular-nums",
                      row.value >= 0 ? "text-emerald-600" : "text-rose-600",
                    )}
                  >
                    {row.value >= 0 ? "+" : ""}
                    {row.value.toLocaleString()}
                  </span>
                </div>
              ))}
              {seatsDelta !== null && (
                <p className="pt-1 text-[11px] text-muted">
                  {t("supplySplitTotal", { total: seatsDelta })}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-muted">{t("supplyNotComparable")}</p>
          )}
        </div>
      )}
    </div>
  );
}

const LEAD_COLOR_APP = "#6366f1";
const LEAD_COLOR_WELLHUB = "#10b981";
const LEAD_TOOLTIP_STYLE = {
  fontSize: 11,
  borderRadius: 10,
  border: "1px solid rgba(0,0,0,0.06)",
  padding: "4px 8px",
} as const;

function LeadTimesCard({
  leadTimes,
}: {
  leadTimes: InsightsData["leadTimes"];
}) {
  const t = useTranslations("admin.insightsPage");
  // "111 h" is hard to translate mentally — from a day up, read it as days + hours.
  const fmtLead = (hours: number): string => {
    if (hours < 24) return t("leadHours", { h: Math.round(hours) });
    const d = Math.floor(hours / 24);
    const rem = Math.round(hours % 24);
    return rem === 0
      ? t("leadDaysOnly", { d })
      : t("leadDaysHours", { d, h: rem });
  };
  const hasWellhub = leadTimes.totals.wellhub > 0;

  const distData = leadTimes.distribution.map((d) => ({
    ...d,
    label: t(`leadBucket_${d.bucket}`),
  }));
  const hourData = leadTimes.byHour.map((h) => ({
    ...h,
    label: `${h.hour}:00`,
  }));

  const legend = (
    <span className="flex items-center gap-3 text-[11px] text-muted">
      <span className="flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: LEAD_COLOR_APP }} />
        {t("leadApp")}
      </span>
      {hasWellhub && (
        <span className="flex items-center gap-1">
          <span
            className="h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: LEAD_COLOR_WELLHUB }}
          />
          {t("leadWellhub")}
        </span>
      )}
    </span>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
              {t("leadTitle")}
            </p>
            <p className="mt-1 text-[11px] text-muted">{t("leadHint")}</p>
          </div>
          {legend}
        </div>
        <div className="mt-3 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distData} barGap={2} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={0}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={LEAD_TOOLTIP_STYLE}
                labelStyle={{ fontSize: 10 }}
                formatter={(value, name) => [
                  `${value}%`,
                  name === "app" ? t("leadApp") : t("leadWellhub"),
                ]}
              />
              <Bar dataKey="app" fill={LEAD_COLOR_APP} radius={[3, 3, 0, 0]} />
              {hasWellhub && (
                <Bar dataKey="wellhub" fill={LEAD_COLOR_WELLHUB} radius={[3, 3, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
              {t("leadByHourTitle")}
            </p>
            <p className="mt-1 text-[11px] text-muted">{t("leadByHourHint")}</p>
          </div>
          {legend}
        </div>
        <div className="mt-3 h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={hourData} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={LEAD_TOOLTIP_STYLE}
                labelStyle={{ fontSize: 10 }}
                formatter={(value, name) => [
                  fmtLead(value as number),
                  name === "app" ? t("leadApp") : t("leadWellhub"),
                ]}
              />
              <Line
                dataKey="app"
                stroke={LEAD_COLOR_APP}
                strokeWidth={2.5}
                dot={{ r: 3, fill: LEAD_COLOR_APP }}
                connectNulls
              />
              {hasWellhub && (
                <Line
                  dataKey="wellhub"
                  stroke={LEAD_COLOR_WELLHUB}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: LEAD_COLOR_WELLHUB }}
                  connectNulls
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
