"use client";

import Link from "next/link";
import { CalendarDays, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface HeatmapClass {
  id: string;
  startsAt: string;
  dayOfWeek: number; // 0=Sun..6=Sat
  hour: number; // 0-23
  enrolled: number;
  capacity: number;
  fillPct: number;
}

const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
// Internal order Mon→Sun so the weekend stays on the right.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

// Hour buckets: morning, midday, evening, late
const HOUR_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: "AM", min: 6, max: 11 },
  { label: "MD", min: 12, max: 15 },
  { label: "PM", min: 16, max: 20 },
  { label: "LT", min: 21, max: 23 },
];

function fillColor(pct: number): string {
  if (pct >= 80) return "bg-emerald-500";
  if (pct >= 60) return "bg-emerald-400/80";
  if (pct >= 40) return "bg-amber-400/80";
  if (pct >= 20) return "bg-red-400/80";
  return "bg-red-300/70";
}

export function WeekHeatmap({ classes }: { classes: HeatmapClass[] }) {
  const t = useTranslations("admin.weekHeatmap");

  // Group by day + hour bucket, average fill
  const matrix: { count: number; sumPct: number; classes: HeatmapClass[] }[][] =
    DAY_ORDER.map(() => HOUR_BUCKETS.map(() => ({ count: 0, sumPct: 0, classes: [] })));

  for (const c of classes) {
    const dayIdx = DAY_ORDER.indexOf(c.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6);
    if (dayIdx === -1) continue;
    const bucketIdx = HOUR_BUCKETS.findIndex(
      (b) => c.hour >= b.min && c.hour <= b.max,
    );
    if (bucketIdx === -1) continue;
    const cell = matrix[dayIdx][bucketIdx];
    cell.count += 1;
    cell.sumPct += c.fillPct;
    cell.classes.push(c);
  }

  const totalClasses = classes.length;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted/70" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
              {t("kicker")}
            </span>
          </div>
          <p className="mt-1 text-[15px] font-semibold text-foreground">
            {totalClasses === 0
              ? t("noClasses")
              : t("summary", { count: totalClasses })}
          </p>
        </div>
        <Link
          href="/admin/schedule"
          className="group inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-foreground"
        >
          {t("viewSchedule")}
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </Link>
      </div>

      {totalClasses === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <p className="text-sm text-muted">{t("emptyMessage")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[auto_repeat(7,1fr)] gap-1">
            {/* Header row */}
            <div />
            {DAY_ORDER.map((d, i) => (
              <div
                key={d}
                className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted/70"
              >
                {DAY_LABELS[i]}
              </div>
            ))}

            {/* Rows */}
            {HOUR_BUCKETS.map((bucket, rowIdx) => (
              <Row
                key={bucket.label}
                label={bucket.label}
                cells={matrix.map((day) => day[rowIdx])}
                tooltipOne={t("tooltipOne")}
                tooltipMany={t("tooltipMany")}
                tooltipEmpty={t("tooltipEmpty")}
              />
            ))}
          </div>

          <div className="mt-3 flex items-center gap-3 text-[10px] text-muted/70">
            <LegendDot color="bg-red-300/70" label="<20%" />
            <LegendDot color="bg-red-400/80" label="20-39" />
            <LegendDot color="bg-amber-400/80" label="40-59" />
            <LegendDot color="bg-emerald-400/80" label="60-79" />
            <LegendDot color="bg-emerald-500" label="80%+" />
          </div>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  cells,
  tooltipOne,
  tooltipMany,
  tooltipEmpty,
}: {
  label: string;
  cells: { count: number; sumPct: number; classes: HeatmapClass[] }[];
  tooltipOne: string;
  tooltipMany: string;
  tooltipEmpty: string;
}) {
  return (
    <>
      <div className="text-right text-[10px] font-medium text-muted/70 pr-1 self-center">
        {label}
      </div>
      {cells.map((cell, i) => {
        if (cell.count === 0) {
          return (
            <div
              key={i}
              className="aspect-square rounded-md border border-dashed border-border/50"
              title={tooltipEmpty}
            />
          );
        }
        const avg = Math.round(cell.sumPct / cell.count);
        const tooltip = (cell.count === 1 ? tooltipOne : tooltipMany)
          .replace("{count}", String(cell.count))
          .replace("{pct}", String(avg));
        return (
          <div
            key={i}
            className={cn("aspect-square rounded-md", fillColor(avg))}
            title={tooltip}
          />
        );
      })}
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("h-2 w-2 rounded-sm", color)} />
      {label}
    </span>
  );
}
