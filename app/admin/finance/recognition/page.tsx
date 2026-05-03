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

interface RevenueReport {
  tenantId: string;
  month: string;
  currency: string;
  summary: {
    attributedCents: number;
    breakageCents: number;
    totalRecognizedCents: number;
  };
  breakageDetail: {
    monthlyBreakageCents: number;
    expirationBreakageCents: number;
  };
  byDiscipline: {
    disciplineId: string;
    disciplineName: string;
    attributions: number;
    revenueCents: number;
    avgPerAttributionCents: number;
  }[];
  byCoach: {
    coachId: string;
    coachName: string;
    attributions: number;
    revenueCents: number;
  }[];
  byPackage: {
    packageId: string | null;
    packageName: string;
    packageType: string | null;
    attributions: number;
    revenueCents: number;
    avgPerAttributionCents: number;
  }[];
  byDisciplinePackage: {
    disciplineId: string;
    disciplineName: string;
    revenueCents: number;
    packages: {
      packageId: string | null;
      packageName: string;
      packageType: string | null;
      attributions: number;
      revenueCents: number;
      avgPerAttributionCents: number;
    }[];
  }[];
  byTimeslot: {
    dayOfWeek: number;
    hourOfDay: number;
    attributions: number;
    revenueCents: number;
  }[];
  heatmap: {
    coachId: string;
    coachName: string;
    dayOfWeek: number;
    hourOfDay: number;
    revenueCents: number;
  }[];
}

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
    if (!data || data.summary.totalRecognizedCents === 0) return 0;
    return Math.round(
      (data.summary.attributedCents / data.summary.totalRecognizedCents) * 100,
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
    a.download = `ingresos-reconocidos-${month}.csv`;
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
              Atribución de ingresos reconocidos a clases, coaches y franjas
              horarias. Incluye el reparto mensual de bonos ilimitados y
              caducidad de bonos (breakage).
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
          label="Reconocido total"
          value={isLoading ? null : formatCurrency(fromCents(data?.summary.totalRecognizedCents ?? 0), currency)}
          sublabel="Gross, pre-IVA, pre-fee de plataforma"
        />
        <SummaryCard
          label="Atribuido a clases"
          value={isLoading ? null : formatCurrency(fromCents(data?.summary.attributedCents ?? 0), currency)}
          sublabel={`${attributedShare}% del total`}
        />
        <SummaryCard
          label="Breakage"
          value={isLoading ? null : formatCurrency(fromCents(data?.summary.breakageCents ?? 0), currency)}
          sublabel={
            data
              ? `${formatCurrency(fromCents(data.breakageDetail.monthlyBreakageCents), currency)} mensual · ${formatCurrency(fromCents(data.breakageDetail.expirationBreakageCents), currency)} caducidad`
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
                  <th className="py-2">Paquete</th>
                  <th className="py-2 text-right">Atrib.</th>
                  <th className="py-2 text-right">Ingreso</th>
                  <th className="py-2 text-right">Ingreso / reserva</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byPackage ?? []).map((row) => (
                  <tr
                    key={row.packageId ?? `fallback:${row.packageName}`}
                    className="border-t border-border/50"
                  >
                    <td className="py-2 font-medium">{row.packageName}</td>
                    <td className="py-2 text-right tabular-nums">{row.attributions}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(fromCents(row.revenueCents), currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {formatCurrency(fromCents(row.avgPerAttributionCents), currency)}
                    </td>
                  </tr>
                ))}
                {(data?.byPackage ?? []).length === 0 && <EmptyRow colSpan={4} />}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel icon={<PieChart className="h-4 w-4" />} title="Por disciplina">
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2" aria-label="Expandir" />
                  <th className="py-2">Disciplina</th>
                  <th className="py-2 text-right">Atrib.</th>
                  <th className="py-2 text-right">Ingreso</th>
                  <th className="py-2 text-right">Promedio</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byDiscipline ?? []).map((row) => {
                  const detail = data?.byDisciplinePackage.find(
                    (d) => d.disciplineId === row.disciplineId,
                  );
                  const isExpanded = expanded.has(row.disciplineId);
                  const canExpand = (detail?.packages.length ?? 0) > 0;
                  return (
                    <Fragment key={row.disciplineId}>
                      <tr
                        className={cn(
                          "border-t border-border/50",
                          canExpand && "cursor-pointer hover:bg-surface/60",
                        )}
                        onClick={() =>
                          canExpand && toggleExpanded(row.disciplineId)
                        }
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
                        <td className="py-2 text-right tabular-nums">
                          {row.attributions}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {formatCurrency(fromCents(row.revenueCents), currency)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted">
                          {formatCurrency(
                            fromCents(row.avgPerAttributionCents),
                            currency,
                          )}
                        </td>
                      </tr>
                      {isExpanded && detail && (
                        <tr className="border-t border-border/30 bg-surface/40">
                          <td />
                          <td colSpan={4} className="py-2 pr-2">
                            <DisciplinePackageDetail
                              packages={detail.packages}
                              currency={currency}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {(data?.byDiscipline ?? []).length === 0 && (
                  <EmptyRow colSpan={5} />
                )}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel icon={<TrendingUp className="h-4 w-4" />} title="Por coach">
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2">Coach</th>
                  <th className="py-2 text-right">Atrib.</th>
                  <th className="py-2 text-right">Ingreso</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byCoach ?? []).map((row) => (
                  <tr key={row.coachId} className="border-t border-border/50">
                    <td className="py-2 font-medium">{row.coachName}</td>
                    <td className="py-2 text-right tabular-nums">{row.attributions}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(fromCents(row.revenueCents), currency)}
                    </td>
                  </tr>
                ))}
                {(data?.byCoach ?? []).length === 0 && <EmptyRow colSpan={3} />}
              </tbody>
            </table>
          )}
        </Panel>
      </section>

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

function InfoBanner() {
  return (
    <div className="flex items-start gap-2 rounded-sm border border-border/50 bg-surface p-3 text-xs text-muted">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        Las clases no generan ingresos por sí mismas: el dinero viene de
        bonos, ilimitados, pases simples y penalizaciones. Aquí lo repartimos
        entre las clases que lo consumieron (atribuido) o lo marcamos como no
        consumido (breakage).
      </p>
    </div>
  );
}

function DisciplinePackageDetail({
  packages,
  currency,
}: {
  packages: {
    packageId: string | null;
    packageName: string;
    attributions: number;
    revenueCents: number;
    avgPerAttributionCents: number;
  }[];
  currency: string;
}) {
  if (packages.length === 0) {
    return (
      <p className="py-2 text-xs text-muted">Sin detalle de paquetes.</p>
    );
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-left font-medium uppercase tracking-wide text-muted">
        <tr>
          <th className="py-1">Paquete</th>
          <th className="py-1 text-right">Atrib.</th>
          <th className="py-1 text-right">Ingreso</th>
          <th className="py-1 text-right">Ingreso / reserva</th>
        </tr>
      </thead>
      <tbody>
        {packages.map((p) => (
          <tr
            key={p.packageId ?? `fallback:${p.packageName}`}
            className="border-t border-border/30"
          >
            <td className="py-1 font-medium">{p.packageName}</td>
            <td className="py-1 text-right tabular-nums">{p.attributions}</td>
            <td className="py-1 text-right tabular-nums">
              {formatCurrency(fromCents(p.revenueCents), currency)}
            </td>
            <td className="py-1 text-right tabular-nums text-muted">
              {formatCurrency(fromCents(p.avgPerAttributionCents), currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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

  const byDay = new Map<number, Map<number, { attributions: number; revenue: number }>>();
  let maxRevenue = 0;
  for (const c of cells) {
    if (!byDay.has(c.dayOfWeek)) byDay.set(c.dayOfWeek, new Map());
    byDay.get(c.dayOfWeek)!.set(c.hourOfDay, {
      attributions: c.attributions,
      revenue: c.revenueCents,
    });
    if (c.revenueCents > maxRevenue) maxRevenue = c.revenueCents;
  }
  const hours = Array.from(
    new Set(cells.map((c) => c.hourOfDay)),
  ).sort((a, b) => a - b);
  const days = [0, 1, 2, 3, 4, 5, 6];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium text-muted">
              Día
            </th>
            {hours.map((h) => (
              <th key={h} className="px-1 py-1 text-center font-medium text-muted">
                {h}:00
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const row = byDay.get(d);
            if (!row) return null;
            return (
              <tr key={d}>
                <td className="sticky left-0 bg-card px-2 py-1 font-medium text-foreground">
                  {DOW_LABELS[d]}
                </td>
                {hours.map((h) => {
                  const cell = row.get(h);
                  if (!cell) {
                    return <td key={h} className="px-1 py-1 text-center text-muted/40">·</td>;
                  }
                  const intensity =
                    maxRevenue > 0 ? Math.round((cell.revenue / maxRevenue) * 100) : 0;
                  return (
                    <td
                      key={h}
                      className={cn(
                        "px-1 py-1 text-center tabular-nums",
                        intensity > 75
                          ? "bg-admin/30 text-foreground"
                          : intensity > 40
                            ? "bg-admin/15 text-foreground"
                            : "bg-admin/5 text-foreground/70",
                      )}
                      title={`${DOW_LABELS[d]} ${h}:00 · ${cell.attributions} atrib.`}
                    >
                      {formatCurrency(fromCents(cell.revenue), currency)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
