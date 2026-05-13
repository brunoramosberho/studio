"use client";

import Link from "next/link";
import { Clock, ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding-provider";

export interface TodayClass {
  id: string;
  name: string;
  coachName: string | null;
  startsAt: string;
  durationMinutes: number;
  enrolled: number;
  capacity: number;
  fillPct: number;
  status: string;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fillTone(pct: number): { fg: string; bg: string; ring: string } {
  if (pct >= 80) return { fg: "text-emerald-700", bg: "bg-emerald-500/15", ring: "ring-emerald-500/30" };
  if (pct >= 50) return { fg: "text-sky-700", bg: "bg-sky-500/15", ring: "ring-sky-500/30" };
  if (pct >= 25) return { fg: "text-amber-700", bg: "bg-amber-500/15", ring: "ring-amber-500/30" };
  return { fg: "text-red-700", bg: "bg-red-500/15", ring: "ring-red-500/30" };
}

export function TodayTimeline({ classes }: { classes: TodayClass[] }) {
  const t = useTranslations("admin.todayTimeline");
  const { colorAdmin } = useBranding();
  const total = classes.length;
  const totalEnrolled = classes.reduce((s, c) => s + c.enrolled, 0);
  const totalCapacity = classes.reduce((s, c) => s + c.capacity, 0);
  const avgFill = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted/70" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted/60">
              {t("kicker")}
            </span>
          </div>
          <p className="mt-1 text-[15px] font-semibold text-foreground">
            {total === 0
              ? t("noClasses")
              : t("summary", {
                  count: total,
                  classWord: total === 1 ? t("classOne") : t("classMany"),
                  enrolled: totalEnrolled,
                  capacity: totalCapacity,
                  pct: avgFill,
                })}
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

      {total === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center">
          <p className="text-sm text-muted">
            {t("emptyPrefix")}{" "}
            <Link
              href="/admin/schedule"
              className="font-semibold underline-offset-2 hover:underline"
              style={{ color: colorAdmin }}
            >
              {t("emptyLink")}
            </Link>
            {t("emptySuffix")}
          </p>
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {classes.map((c) => {
            const tone = fillTone(c.fillPct);
            return (
              <Link
                key={c.id}
                href={`/admin/class/${c.id}`}
                className={cn(
                  "group min-w-[150px] shrink-0 rounded-xl px-3 py-2.5 ring-1 transition-all",
                  tone.bg,
                  tone.ring,
                  "hover:ring-2",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-[11px] font-bold tabular-nums", tone.fg)}>
                    {fmtTime(c.startsAt)}
                  </span>
                  <span className={cn("text-[11px] font-bold tabular-nums", tone.fg)}>
                    {c.fillPct}%
                  </span>
                </div>
                <p className="mt-1 truncate text-[13px] font-semibold text-foreground">
                  {c.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted/80">
                  {c.coachName ?? t("noCoach")} · {c.enrolled}/{c.capacity}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
