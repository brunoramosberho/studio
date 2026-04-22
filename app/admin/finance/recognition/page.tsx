"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, PieChart, Info, TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [month, setMonth] = useState<string>(currentMonth());

  const { data, isLoading, error } = useQuery<RevenueReport>({
    queryKey: ["revenue-recognition", month],
    queryFn: async () => {
      const res = await fetch(`/api/admin/finance/revenue-recognition?month=${month}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const currency = (data?.currency ?? "eur").toUpperCase();

  const attributedShare = useMemo(() => {
    if (!data || data.summary.totalRecognizedCents === 0) return 0;
    return Math.round(
      (data.summary.attributedCents / data.summary.totalRecognizedCents) * 100,
    );
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
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
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-sm border border-border/60 bg-card px-3 py-1.5 text-sm font-medium text-foreground focus:border-admin/50 focus:outline-none"
          />
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

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel icon={<PieChart className="h-4 w-4" />} title="Por disciplina">
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-medium uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-2">Disciplina</th>
                  <th className="py-2 text-right">Atrib.</th>
                  <th className="py-2 text-right">Ingreso</th>
                  <th className="py-2 text-right">Promedio</th>
                </tr>
              </thead>
              <tbody>
                {(data?.byDiscipline ?? []).map((row) => (
                  <tr key={row.disciplineId} className="border-t border-border/50">
                    <td className="py-2 font-medium">{row.disciplineName}</td>
                    <td className="py-2 text-right tabular-nums">{row.attributions}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatCurrency(fromCents(row.revenueCents), currency)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted">
                      {formatCurrency(fromCents(row.avgPerAttributionCents), currency)}
                    </td>
                  </tr>
                ))}
                {(data?.byDiscipline ?? []).length === 0 && (
                  <EmptyRow colSpan={4} />
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
