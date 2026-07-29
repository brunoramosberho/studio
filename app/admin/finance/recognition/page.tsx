"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Package,
  PieChart,
  TrendingUp,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useCurrency } from "@/components/tenant-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionTabs } from "@/components/admin/section-tabs";
import { FINANCE_TABS } from "@/components/admin/section-tab-configs";

type SourceKind = "pack" | "subscription" | "dropin" | "platform" | "other";

interface SourceRow {
  key: string;
  name: string;
  kind: SourceKind;
  attributions: number;
  classCount: number;
  revenueCents: number;
  avgPerVisitCents: number;
  avgPerClassCents: number;
  breakageCents: number;
}

interface RevenueReport {
  tenantId: string;
  month: string;
  currency: string;
  dropInCapCents: number;
  summary: {
    attributedCents: number;
    breakageCents: number;
    totalCents: number;
  };
  byPackage: SourceRow[];
  byDiscipline: {
    disciplineId: string;
    disciplineName: string;
    attributions: number;
    classCount: number;
    revenueCents: number;
    avgPerVisitCents: number;
    avgPerClassCents: number;
    packages: SourceRow[];
  }[];
  byCoach: {
    coachId: string;
    coachName: string;
    attributions: number;
    classCount: number;
    revenueCents: number;
    avgPerVisitCents: number;
    avgPerClassCents: number;
  }[];
  byTimeslot: {
    dayOfWeek: number;
    hourOfDay: number;
    attributions: number;
    revenueCents: number;
    classCount: number;
    avgOccupancyPct: number | null;
  }[];
  heatmap: {
    coachId: string;
    coachName: string;
    dayOfWeek: number;
    hourOfDay: number;
    revenueCents: number;
  }[];
}

const KIND_LABEL: Record<SourceKind, string> = {
  pack: "Paquete",
  subscription: "Suscripción",
  dropin: "Drop-in",
  platform: "Plataforma",
  other: "Otro",
};

const DOW_LABELS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function fromCents(c: number): number {
  return c / 100;
}

export default function RevenueRecognitionPage() {
  const tenantCurrency = useCurrency();
  const [month, setMonth] = useState<string>(currentMonth());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (disciplineId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(disciplineId)) next.delete(disciplineId);
      else next.add(disciplineId);
      return next;
    });
  };

  const { data, isLoading, error } = useQuery<RevenueReport>({
    queryKey: ["revenue-recognition", month],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finance/revenue-recognition?month=${month}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const currency = (data?.currency ?? tenantCurrency.code).toUpperCase();

  const attributedShare = useMemo(() => {
    if (!data || data.summary.totalCents === 0) return 0;
    return Math.round(
      (data.summary.attributedCents / data.summary.totalCents) * 100,
    );
  }, [data]);

  const handleExport = useCallback(async () => {
    const res = await fetch(
      `/api/admin/finance/revenue-recognition/export?month=${month}`,
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ingresos-estimados-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [month]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <SectionTabs tabs={FINANCE_TABS} ariaLabel="Finance sections" />
      <header className="space-y-3">
        <Link
          href="/admin/finance"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Finanzas
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              Ingresos por clase
            </h1>
            <p className="mt-1 text-sm text-muted">
              Estimado de ganancias atribuidas a clases, coaches y disciplinas —
              paquetes, suscripciones y Wellhub, cada asistencia valorada hasta
              el precio de una clase suelta.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-sm border border-border/60 bg-card px-3 py-1.5 text-sm font-medium text-foreground focus:border-admin/50 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleExport}
              disabled={isLoading || !data}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-admin/50 hover:text-admin disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el reporte. Revisa los logs del servidor.
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Total estimado"
          value={isLoading ? null : formatCurrency(fromCents(data?.summary.totalCents ?? 0), currency)}
          sublabel="Atribuido + breakage · estimado, pre-IVA/fees"
        />
        <SummaryCard
          label="Atribuido a clases"
          value={isLoading ? null : formatCurrency(fromCents(data?.summary.attributedCents ?? 0), currency)}
          sublabel={`${attributedShare}% del total`}
        />
        <SummaryCard
          label="Breakage (suscripciones)"
          value={isLoading ? null : formatCurrency(fromCents(data?.summary.breakageCents ?? 0), currency)}
          sublabel={
            data && data.dropInCapCents > 0
              ? `Tope por clase: ${formatCurrency(fromCents(data.dropInCapCents), currency)}`
              : undefined
          }
        />
      </section>

      <InfoBanner />

      <Panel icon={<Package className="h-4 w-4" />} title="Por paquete">
        {isLoading ? (
          <TableSkeleton rows={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2">Fuente</th>
                  <th className="py-2">Tipo</th>
                  <th className="py-2 text-right">Visitas</th>
                  <th className="py-2 text-right">Clases</th>
                  <th className="py-2 text-right">Ingreso est.</th>
                  <th className="py-2 text-right">Prom/clase</th>
                  <th className="py-2 text-right">Prom/visita</th>
                  <th className="py-2 text-right">Breakage</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byPackage ?? []).map((row) => (
                  <tr key={row.key} className="border-t border-border/50">
                    <td className="py-2 font-medium">{row.name}</td>
                    <td className="py-2 text-xs text-muted">{KIND_LABEL[row.kind]}</td>
                    <td className="py-2 text-right tabular-nums">{row.attributions}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {row.classCount}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(fromCents(row.revenueCents), currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {row.classCount > 0
                        ? formatCurrency(fromCents(row.avgPerClassCents), currency)
                        : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {row.attributions > 0
                        ? formatCurrency(fromCents(row.avgPerVisitCents), currency)
                        : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
                      {row.breakageCents > 0
                        ? formatCurrency(fromCents(row.breakageCents), currency)
                        : "—"}
                    </td>
                  </tr>
                ))}
                {(data?.byPackage ?? []).length === 0 && <EmptyRow colSpan={8} />}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel icon={<PieChart className="h-4 w-4" />} title="Por disciplina">
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2" aria-label="Expandir" />
                  <th className="py-2">Disciplina</th>
                  <th className="py-2 text-right">Visitas</th>
                  <th className="py-2 text-right">Clases</th>
                  <th className="py-2 text-right">Ingreso est.</th>
                  <th className="py-2 text-right">Prom/clase</th>
                  <th className="py-2 text-right">Prom/visita</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byDiscipline ?? []).map((row) => {
                  const isExpanded = expanded.has(row.disciplineId);
                  const canExpand = row.packages.length > 0;
                  return (
                    <Fragment key={row.disciplineId}>
                      <tr
                        className={cn(
                          "border-t border-border/50",
                          canExpand && "cursor-pointer hover:bg-surface/60",
                        )}
                        onClick={() => canExpand && toggleExpanded(row.disciplineId)}
                      >
                        <td className="w-6 py-2 pl-1 text-muted">
                          {canExpand ? (
                            isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )
                          ) : null}
                        </td>
                        <td className="py-2 font-medium">{row.disciplineName}</td>
                        <td className="py-2 text-right tabular-nums">{row.attributions}</td>
                        <td className="py-2 text-right tabular-nums text-muted">
                          {row.classCount}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatCurrency(fromCents(row.revenueCents), currency)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted">
                          {formatCurrency(fromCents(row.avgPerClassCents), currency)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted">
                          {formatCurrency(fromCents(row.avgPerVisitCents), currency)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="border-t border-border/30 bg-surface/40">
                          <td />
                          <td colSpan={6} className="py-2 pr-2">
                            <DisciplinePackageDetail
                              packages={row.packages}
                              currency={currency}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {(data?.byDiscipline ?? []).length === 0 && (
                  <EmptyRow colSpan={7} />
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel icon={<TrendingUp className="h-4 w-4" />} title="Por coach">
        {isLoading ? (
          <TableSkeleton rows={4} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2">Coach</th>
                  <th className="py-2 text-right">Visitas</th>
                  <th className="py-2 text-right">Clases</th>
                  <th className="py-2 text-right">Ingreso est.</th>
                  <th className="py-2 text-right">Prom/clase</th>
                  <th className="py-2 text-right">Prom/visita</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byCoach ?? []).map((row) => (
                  <tr key={row.coachId} className="border-t border-border/50">
                    <td className="py-2 font-medium">{row.coachName}</td>
                    <td className="py-2 text-right tabular-nums">{row.attributions}</td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {row.classCount}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(fromCents(row.revenueCents), currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {formatCurrency(fromCents(row.avgPerClassCents), currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {formatCurrency(fromCents(row.avgPerVisitCents), currency)}
                    </td>
                  </tr>
                ))}
                {(data?.byCoach ?? []).length === 0 && <EmptyRow colSpan={6} />}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Por franja horaria (día × hora)">
        {isLoading ? <TableSkeleton rows={3} /> : <TimeslotHeatmap data={data} currency={currency} />}
      </Panel>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string | null;
  sublabel?: string;
}) {
  return (
    <div className="rounded-sm border border-border/60 bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {value ?? <Skeleton className="inline-block h-7 w-28" />}
      </p>
      {sublabel && <p className="mt-1 text-xs text-muted">{sublabel}</p>}
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-border/60 bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-6 text-center text-sm text-muted">
        Sin datos para este mes.
      </td>
    </tr>
  );
}

function DisciplinePackageDetail({
  packages,
  currency,
}: {
  packages: SourceRow[];
  currency: string;
}) {
  if (packages.length === 0) {
    return <p className="py-2 text-xs text-muted">Sin detalle de fuentes.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-left font-medium uppercase tracking-wide text-muted">
        <tr>
          <th className="py-1">Fuente</th>
          <th className="py-1">Tipo</th>
          <th className="py-1 text-right">Visitas</th>
          <th className="py-1 text-right">Clases</th>
          <th className="py-1 text-right">Ingreso est.</th>
          <th className="py-1 text-right">Prom/clase</th>
          <th className="py-1 text-right">Prom/visita</th>
        </tr>
      </thead>
      <tbody>
        {packages.map((p) => (
          <tr key={p.key} className="border-t border-border/30">
            <td className="py-1 font-medium">{p.name}</td>
            <td className="py-1 text-muted">{KIND_LABEL[p.kind]}</td>
            <td className="py-1 text-right tabular-nums">{p.attributions}</td>
            <td className="py-1 text-right tabular-nums text-muted">{p.classCount}</td>
            <td className="py-1 text-right tabular-nums">
              {formatCurrency(fromCents(p.revenueCents), currency)}
            </td>
            <td className="py-1 text-right tabular-nums text-muted">
              {formatCurrency(fromCents(p.avgPerClassCents), currency)}
            </td>
            <td className="py-1 text-right tabular-nums text-muted">
              {formatCurrency(fromCents(p.avgPerVisitCents), currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InfoBanner() {
  return (
    <div className="flex items-start gap-2 rounded-sm border border-border/50 bg-surface p-3 text-xs text-muted">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        Estimado de ganancias: cada asistencia (paquete, suscripción o Wellhub)
        se atribuye a su clase, valorada hasta el precio de una clase suelta
        (drop-in). <strong>Prom/visita</strong> = ingreso por asistencia (p. ej.
        Wellhub ≈ su tarifa por visita); <strong>Prom/clase</strong> = ingreso
        por clase (Wellhub agrupa las varias visitas de una misma clase, más las
        comisiones fijas por no-show / late-cancel). Lo que una suscripción paga
        y no &quot;gasta&quot; en clases ese mes es breakage. Es una estimación de
        a dónde va tu ingreso, no la contabilidad reconocida (ASC 606).
      </p>
    </div>
  );
}


function TimeslotHeatmap({
  data,
  currency,
}: {
  data: RevenueReport | undefined;
  currency: string;
}) {
  const cells = data?.byTimeslot ?? [];
  if (cells.length === 0) {
    return <p className="py-6 text-center text-sm text-muted">Sin datos para este mes.</p>;
  }

  const byKey = new Map(cells.map((c) => [`${c.dayOfWeek}-${c.hourOfDay}`, c]));
  const hours = Array.from(new Set(cells.map((c) => c.hourOfDay))).sort((a, b) => a - b);
  // Schedule-style: days as columns, Monday first; skip days with nothing.
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => cells.some((c) => c.dayOfWeek === d));
  const maxRevenue = Math.max(...cells.map((c) => c.revenueCents));

  interface SlotAgg {
    revenue: number;
    classes: number;
    occWeighted: number; // sum(avgOcc × classes) for a class-weighted average
    occClasses: number;
  }
  const emptyAgg = (): SlotAgg => ({ revenue: 0, classes: 0, occWeighted: 0, occClasses: 0 });
  const addCell = (agg: SlotAgg, c: (typeof cells)[number]) => {
    agg.revenue += c.revenueCents;
    agg.classes += c.classCount ?? 0;
    if (c.avgOccupancyPct != null && c.classCount) {
      agg.occWeighted += c.avgOccupancyPct * c.classCount;
      agg.occClasses += c.classCount;
    }
  };
  const dayTotals = new Map<number, SlotAgg>(days.map((d) => [d, emptyAgg()]));
  const hourTotals = new Map<number, SlotAgg>(hours.map((h) => [h, emptyAgg()]));
  const grand = emptyAgg();
  for (const c of cells) {
    if (!days.includes(c.dayOfWeek)) continue;
    addCell(dayTotals.get(c.dayOfWeek)!, c);
    addCell(hourTotals.get(c.hourOfDay)!, c);
    addCell(grand, c);
  }
  const aggOcc = (a: SlotAgg) =>
    a.occClasses > 0 ? Math.round(a.occWeighted / a.occClasses) : null;
  const aggAvgPerClass = (a: SlotAgg) =>
    a.classes > 0 ? Math.round(a.revenue / a.classes) : null;

  const subline = (occ: number | null, classes: number) =>
    classes > 0 ? `${occ != null ? `${occ}%` : "—"} · ${classes}c` : null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium text-muted">
              Hora
            </th>
            {days.map((d) => (
              <th key={d} className="px-1 py-1 text-center font-medium text-muted">
                {DOW_LABELS[d]}
              </th>
            ))}
            <th className="border-l border-border/60 px-2 py-1 text-center font-semibold text-muted">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => {
            const ht = hourTotals.get(h)!;
            return (
              <tr key={h}>
                <td className="sticky left-0 bg-card px-2 py-1 font-medium text-foreground">
                  {h}:00
                </td>
                {days.map((d) => {
                  const cell = byKey.get(`${d}-${h}`);
                  if (!cell || (cell.revenueCents === 0 && !cell.classCount)) {
                    return (
                      <td key={d} className="px-1 py-1 text-center text-muted/40">
                        ·
                      </td>
                    );
                  }
                  const intensity =
                    maxRevenue > 0 ? Math.round((cell.revenueCents / maxRevenue) * 100) : 0;
                  const avgPerClass = cell.classCount
                    ? Math.round(cell.revenueCents / cell.classCount)
                    : null;
                  return (
                    <td
                      key={d}
                      className={cn(
                        "px-1 py-1 text-center tabular-nums",
                        intensity > 75
                          ? "bg-admin/30 text-foreground"
                          : intensity > 40
                            ? "bg-admin/15 text-foreground"
                            : "bg-admin/5 text-foreground/70",
                      )}
                      title={`${DOW_LABELS[d]} ${h}:00 · ${cell.classCount} clase(s) · ${
                        avgPerClass != null
                          ? `media ${formatCurrency(fromCents(avgPerClass), currency)}/clase · `
                          : ""
                      }${
                        cell.avgOccupancyPct != null
                          ? `ocupación ${cell.avgOccupancyPct}% · `
                          : ""
                      }${cell.attributions} atrib.`}
                    >
                      <div className="font-medium">
                        {formatCurrency(fromCents(cell.revenueCents), currency)}
                      </div>
                      {subline(cell.avgOccupancyPct, cell.classCount) && (
                        <div className="text-[10px] text-muted">
                          {subline(cell.avgOccupancyPct, cell.classCount)}
                        </div>
                      )}
                    </td>
                  );
                })}
                <td
                  className="border-l border-border/60 bg-surface/60 px-2 py-1 text-center tabular-nums"
                  title={
                    aggAvgPerClass(ht) != null
                      ? `media ${formatCurrency(fromCents(aggAvgPerClass(ht)!), currency)}/clase`
                      : undefined
                  }
                >
                  <div className="font-semibold">
                    {formatCurrency(fromCents(ht.revenue), currency)}
                  </div>
                  {subline(aggOcc(ht), ht.classes) && (
                    <div className="text-[10px] text-muted">{subline(aggOcc(ht), ht.classes)}</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border/60">
            <td className="sticky left-0 bg-card px-2 py-1 font-semibold text-foreground">
              Total
            </td>
            {days.map((d) => {
              const dt = dayTotals.get(d)!;
              return (
                <td
                  key={d}
                  className="bg-surface/60 px-1 py-1 text-center tabular-nums"
                  title={
                    aggAvgPerClass(dt) != null
                      ? `media ${formatCurrency(fromCents(aggAvgPerClass(dt)!), currency)}/clase`
                      : undefined
                  }
                >
                  <div className="font-semibold">
                    {formatCurrency(fromCents(dt.revenue), currency)}
                  </div>
                  {subline(aggOcc(dt), dt.classes) && (
                    <div className="text-[10px] text-muted">{subline(aggOcc(dt), dt.classes)}</div>
                  )}
                </td>
              );
            })}
            <td className="border-l border-border/60 bg-surface px-2 py-1 text-center tabular-nums">
              <div className="font-semibold">
                {formatCurrency(fromCents(grand.revenue), currency)}
              </div>
              {subline(aggOcc(grand), grand.classes) && (
                <div className="text-[10px] text-muted">
                  {subline(aggOcc(grand), grand.classes)}
                </div>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-[11px] text-muted/70">
        Cada celda: ingresos atribuidos · ocupación media y clases impartidas (solo clases
        terminadas). Pasa el cursor para ver la media por clase.
      </p>
    </div>
  );
}
