"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Download, Check, AlertTriangle } from "lucide-react";
import { useBranding } from "@/components/branding-provider";
import { useCurrency } from "@/components/tenant-provider";
import { type CurrencyConfig } from "@/lib/currency";
import { cn } from "@/lib/utils";

type ChartType = "bar" | "line" | "pie";

interface ChartSeries {
  dataKey: string;
  name?: string;
  color?: string;
}

interface ChartSpec {
  type: ChartType;
  title?: string;
  /** Key in each data point for the x-axis / pie label. */
  xKey?: string;
  /** Series to plot. Pie charts only use the first one. */
  series?: ChartSeries[];
  data: Record<string, unknown>[];
  /** Optional y-axis label/formatter hint ("currency" | "percent" | "number"). */
  format?: "currency" | "percent" | "number";
}

interface ChatChartProps {
  /** Raw JSON string from the ```chart code fence. */
  spec: string;
}

/**
 * Fallback palette used when a series doesn't specify a color. First color is
 * the admin brand color so charts feel on-brand; subsequent colors are
 * neutral-to-muted variants that work in both light and dark mode.
 */
const FALLBACK_PALETTE = [
  "var(--color-admin)",
  "#64748B",
  "#94A3B8",
  "#CBD5E1",
  "#475569",
  "#334155",
];

function parseSpec(raw: string): ChartSpec | { error: string } {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { error: "Spec vacío" };
    if (!Array.isArray(parsed.data)) return { error: "Falta el campo 'data'" };
    const type = parsed.type as ChartType;
    if (!["bar", "line", "pie"].includes(type)) {
      return { error: `Tipo de gráfica no soportado: ${parsed.type}` };
    }
    return parsed as ChartSpec;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "JSON inválido" };
  }
}

function formatValue(
  value: unknown,
  format: ChartSpec["format"] | undefined,
  currency: CurrencyConfig,
): string {
  if (typeof value !== "number") return String(value ?? "");
  if (format === "currency") {
    return new Intl.NumberFormat(currency.intlLocale, {
      style: "currency",
      currency: currency.code,
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (format === "percent") {
    return `${value.toFixed(1)}%`;
  }
  return new Intl.NumberFormat(currency.intlLocale).format(value);
}

function shortAxisFormatter(format?: ChartSpec["format"]) {
  return (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
    if (format === "percent") return `${v}%`;
    return String(v);
  };
}

export function ChatChart({ spec: rawSpec }: ChatChartProps) {
  const [copied, setCopied] = useState(false);
  const { colorAdmin } = useBranding();
  const currency = useCurrency();

  const parsed = useMemo(() => parseSpec(rawSpec), [rawSpec]);

  if ("error" in parsed) {
    return (
      <div className="my-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning-soft px-3.5 py-3 text-[12px] text-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0">
          <p className="font-medium">No pude renderizar esta gráfica</p>
          <p className="mt-0.5 text-muted">{parsed.error}</p>
        </div>
      </div>
    );
  }

  const spec: ChartSpec = parsed;
  const xKey = spec.xKey ?? "name";
  const series = spec.series ?? [{ dataKey: "value", name: "Valor" }];

  function resolveColor(c?: string, idx = 0): string {
    if (!c) return idx === 0 ? colorAdmin : FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
    if (c === "admin") return colorAdmin;
    if (c.startsWith("var(") || c.startsWith("#") || c.startsWith("rgb")) return c;
    return c;
  }

  function handleDownload() {
    // Export data as CSV
    const cols = [xKey, ...series.map((s) => s.dataKey)];
    const escape = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const header = [xKey, ...series.map((s) => s.name ?? s.dataKey)];
    const lines = [
      header.map(escape).join(","),
      ...spec.data.map((row) =>
        cols.map((c) => escape(String(row[c] ?? ""))).join(","),
      ),
    ];
    const blob = new Blob(["\ufeff" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const safeTitle = (spec.title ?? "spark-chart")
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40) || "spark-chart";
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border/60 bg-surface/50 px-3.5 py-2.5">
        <span className="text-[12px] font-semibold text-foreground">
          {spec.title ?? "Gráfica"}
        </span>
        <button
          onClick={handleDownload}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted transition-all",
            "hover:bg-admin/10 hover:text-admin",
          )}
          title="Descargar datos como CSV"
          aria-label="Descargar datos como CSV"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-success" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <div className="px-2 pb-3 pt-4" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
          {spec.type === "bar" ? (
            <BarChart
              data={spec.data}
              margin={{ top: 8, right: 12, left: -8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
                interval={0}
                angle={spec.data.length > 5 ? -20 : 0}
                textAnchor={spec.data.length > 5 ? "end" : "middle"}
                height={spec.data.length > 5 ? 50 : 30}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={shortAxisFormatter(spec.format)}
              />
              <Tooltip
                content={<ChartTooltip format={spec.format} currency={currency} />}
                cursor={{ fill: "var(--color-surface)" }}
              />
              {series.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }}
                  iconType="circle"
                  iconSize={8}
                />
              )}
              {series.map((s, idx) => (
                <Bar
                  key={s.dataKey}
                  dataKey={s.dataKey}
                  name={s.name ?? s.dataKey}
                  fill={resolveColor(s.color, idx)}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              ))}
            </BarChart>
          ) : spec.type === "line" ? (
            <LineChart
              data={spec.data}
              margin={{ top: 8, right: 12, left: -8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
                vertical={false}
              />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={shortAxisFormatter(spec.format)}
              />
              <Tooltip content={<ChartTooltip format={spec.format} currency={currency} />} />
              {series.length > 1 && (
                <Legend
                  wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }}
                  iconType="circle"
                  iconSize={8}
                />
              )}
              {series.map((s, idx) => (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name ?? s.dataKey}
                  stroke={resolveColor(s.color, idx)}
                  strokeWidth={2.5}
                  dot={{ r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          ) : (
            <PieChart>
              <Pie
                data={spec.data}
                dataKey={series[0].dataKey}
                nameKey={xKey}
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={40}
                paddingAngle={2}
              >
                {spec.data.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={
                      idx === 0
                        ? colorAdmin
                        : FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length]
                    }
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip format={spec.format} currency={currency} />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }}
                iconType="circle"
                iconSize={8}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
  currency,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string; payload: Record<string, unknown> }[];
  label?: string;
  format?: ChartSpec["format"];
  currency: CurrencyConfig;
}) {
  if (!active || !payload?.length) return null;
  const headerLabel = label ?? String(payload[0]?.payload?.name ?? "");

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-warm">
      {headerLabel && (
        <p className="mb-1 text-[11px] font-medium text-muted">{headerLabel}</p>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-muted">{p.name}:</span>
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {formatValue(p.value, format, currency)}
          </span>
        </div>
      ))}
    </div>
  );
}
