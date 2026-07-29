"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
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

// Day×hour explorer: pick a metric (total revenue / avg per class / occupancy)
// and slice by discipline and/or coach — all client-side over one payload, so
// switching mixes is instant. Answers "which slots work best for X".

interface Cell {
  dayOfWeek: number;
  hourOfDay: number;
  classTypeId: string;
  coachId: string;
  classes: number;
  occSum: number;
  revenueCents: number;
}

interface SlotMatrixData {
  cells: Cell[];
  classTypes: { id: string; name: string }[];
  coaches: { id: string; name: string }[];
}

type SlotMetric = "revenue" | "avgPerClass" | "occupancy";

const ALL = "__all__";
// Monday-first, like every schedule surface.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function InsightsSlotMatrix({ from, to }: { from: string; to: string }) {
  const t = useTranslations("admin.insightsPage");
  const currency = useCurrency();
  const [metric, setMetric] = useState<SlotMetric>("revenue");
  const [classTypeId, setClassTypeId] = useState<string>(ALL);
  const [coachId, setCoachId] = useState<string>(ALL);

  const { data, isLoading } = useQuery<SlotMatrixData>({
    queryKey: ["insights-slots", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/admin/insights/slots?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const dayLabels = useMemo(() => {
    // 2026-06-07 was a Sunday; +i days walks Sun..Sat in UTC.
    const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
    return Array.from({ length: 7 }, (_, dow) =>
      fmt.format(new Date(Date.UTC(2026, 5, 7 + dow))),
    );
  }, []);

  const view = useMemo(() => {
    const cells = (data?.cells ?? []).filter(
      (c) =>
        (classTypeId === ALL || c.classTypeId === classTypeId) &&
        (coachId === ALL || c.coachId === coachId),
    );
    interface Agg {
      classes: number;
      occSum: number;
      revenueCents: number;
    }
    const slots = new Map<string, Agg>();
    for (const c of cells) {
      const key = `${c.dayOfWeek}|${c.hourOfDay}`;
      const agg = slots.get(key) ?? { classes: 0, occSum: 0, revenueCents: 0 };
      agg.classes += c.classes;
      agg.occSum += c.occSum;
      agg.revenueCents += c.revenueCents;
      slots.set(key, agg);
    }
    const valueOf = (a: Agg): number | null => {
      if (metric === "revenue") return a.revenueCents;
      if (metric === "avgPerClass")
        return a.classes > 0 ? Math.round(a.revenueCents / a.classes) : null;
      return a.classes > 0 ? Math.round(a.occSum / a.classes) : null;
    };
    const days = DAY_ORDER.filter((d) =>
      [...slots.keys()].some((k) => Number(k.split("|")[0]) === d),
    );
    const hours = [...new Set([...slots.keys()].map((k) => Number(k.split("|")[1])))].sort(
      (a, b) => a - b,
    );
    let max = 0;
    for (const a of slots.values()) {
      const v = valueOf(a);
      if (v != null && v > max) max = v;
    }
    return { slots, days, hours, max, valueOf };
  }, [data, classTypeId, coachId, metric]);

  const fmtValue = (v: number): string => {
    if (metric === "occupancy") return `${v}%`;
    return formatMoney(v / 100, currency);
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
            {t("slotsTitle")}
          </p>
          <p className="mt-1 text-[11px] text-muted">{t("slotsHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as SlotMetric)}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">{t("slotMetricRevenue")}</SelectItem>
              <SelectItem value="avgPerClass">{t("slotMetricAvg")}</SelectItem>
              <SelectItem value="occupancy">{t("slotMetricOcc")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={classTypeId} onValueChange={setClassTypeId}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("slotsAllDisciplines")}</SelectItem>
              {(data?.classTypes ?? []).map((ct) => (
                <SelectItem key={ct.id} value={ct.id}>
                  {ct.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachId} onValueChange={setCoachId}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("slotsAllCoaches")}</SelectItem>
              {(data?.coaches ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-48 w-full rounded-xl" />
      ) : view.hours.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted">{t("noData")}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 bg-card px-2 py-1 text-left font-medium text-muted">
                  {t("slotsHour")}
                </th>
                {view.days.map((d) => (
                  <th key={d} className="px-1 py-1 text-center font-medium capitalize text-muted">
                    {dayLabels[d]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.hours.map((h) => (
                <tr key={h}>
                  <td className="sticky left-0 bg-card px-2 py-1 font-medium text-foreground">
                    {h}:00
                  </td>
                  {view.days.map((d) => {
                    const agg = view.slots.get(`${d}|${h}`);
                    const v = agg ? view.valueOf(agg) : null;
                    if (!agg || v == null) {
                      return (
                        <td key={d} className="px-1 py-1.5 text-center text-muted/40">
                          ·
                        </td>
                      );
                    }
                    const intensity = view.max > 0 ? Math.round((v / view.max) * 100) : 0;
                    const occ = agg.classes > 0 ? Math.round(agg.occSum / agg.classes) : null;
                    return (
                      <td
                        key={d}
                        className={cn(
                          "px-1 py-1.5 text-center tabular-nums",
                          intensity > 75
                            ? "bg-admin/30 text-foreground"
                            : intensity > 40
                              ? "bg-admin/15 text-foreground"
                              : "bg-admin/5 text-foreground/70",
                        )}
                        title={`${dayLabels[d]} ${h}:00 · ${t("slotsTooltip", {
                          classes: agg.classes,
                          occ: occ ?? 0,
                        })}`}
                      >
                        <div className="font-medium">{fmtValue(v)}</div>
                        <div className="text-[10px] text-muted">
                          {agg.classes}c{occ != null && metric !== "occupancy" ? ` · ${occ}%` : ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted/70">{t("slotsFootnote")}</p>
        </div>
      )}
    </div>
  );
}
