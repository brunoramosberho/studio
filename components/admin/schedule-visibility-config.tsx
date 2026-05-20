"use client";

import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { CalendarDays, Repeat, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ScheduleVisibilityMode } from "@/hooks/usePolicies";

export interface ScheduleVisibilityValue {
  scheduleVisibilityMode: ScheduleVisibilityMode;
  visibleScheduleDays: number;
  scheduleReleaseDayOfWeek: number | null;
  scheduleReleaseHour: number | null;
  scheduleReleaseWeeksAhead: number | null;
}

interface Props {
  value: ScheduleVisibilityValue;
  onChange: (next: ScheduleVisibilityValue) => void;
  /** ISO date string of when the public schedule is currently visible until. */
  visibleUntilIso?: string | null;
  /** IANA tz used to compute the release moment ("Europe/Madrid" etc.). */
  effectiveTimezone?: string;
  /** When true, omit the outer card chrome (header + box). Useful inside a Dialog. */
  bare?: boolean;
}

export function ScheduleVisibilityConfig({
  value,
  onChange,
  visibleUntilIso,
  effectiveTimezone,
  bare = false,
}: Props) {
  const t = useTranslations("admin.policiesPage");
  const locale = useLocale();

  const mode = value.scheduleVisibilityMode;
  const set = (patch: Partial<ScheduleVisibilityValue>) => onChange({ ...value, ...patch });

  function switchMode(next: ScheduleVisibilityMode) {
    if (next === value.scheduleVisibilityMode) return;
    if (next === "WEEKLY_RELEASE") {
      set({
        scheduleVisibilityMode: next,
        scheduleReleaseDayOfWeek: value.scheduleReleaseDayOfWeek ?? 0,
        scheduleReleaseHour: value.scheduleReleaseHour ?? 22,
        scheduleReleaseWeeksAhead: value.scheduleReleaseWeeksAhead ?? 1,
      });
    } else {
      set({ scheduleVisibilityMode: next });
    }
  }

  const dayNames = getDayNames(locale);

  const body = (
    <div className="space-y-5">
      <ModeToggle mode={mode} onChange={switchMode} t={t} />

      {mode === "ROLLING_DAYS" ? (
        <RollingFields value={value} set={set} t={t} />
      ) : (
        <WeeklyFields value={value} set={set} t={t} dayNames={dayNames} />
      )}

      {visibleUntilIso && (
        <div className="rounded-lg bg-surface/60 px-3 py-2.5">
          <p className="text-[13px] text-muted">
            {t("currentlyVisibleUntil", {
              date: formatDateLong(visibleUntilIso, locale, effectiveTimezone),
            })}
          </p>
        </div>
      )}
    </div>
  );

  if (bare) return body;

  return (
    <div className="rounded-xl border border-border/50 bg-card p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
          <CalendarDays className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <h2 className="font-display text-lg font-bold">{t("visibleDaysTitle")}</h2>
          <p className="text-sm text-muted">{t("visibleDaysDesc")}</p>
        </div>
      </div>
      {body}
    </div>
  );
}

function ModeToggle({
  mode,
  onChange,
  t,
}: {
  mode: ScheduleVisibilityMode;
  onChange: (m: ScheduleVisibilityMode) => void;
  t: ReturnType<typeof useTranslations<"admin.policiesPage">>;
}) {
  const options: { value: ScheduleVisibilityMode; label: string; desc: string; Icon: typeof CalendarDays }[] = [
    { value: "ROLLING_DAYS", label: t("modeRolling"), desc: t("modeRollingDesc"), Icon: Repeat },
    { value: "WEEKLY_RELEASE", label: t("modeWeekly"), desc: t("modeWeeklyDesc"), Icon: Sparkles },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((opt) => {
        const active = mode === opt.value;
        const Icon = opt.Icon;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "text-left rounded-lg border px-3 py-2.5 transition-all",
              active
                ? "border-admin bg-admin/5"
                : "border-border/50 bg-surface/40 hover:border-border",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4", active ? "text-admin" : "text-muted")} />
              <p className={cn("text-sm font-semibold", active ? "text-admin" : "text-foreground")}>
                {opt.label}
              </p>
            </div>
            <p className="mt-1 text-[12px] text-muted">{opt.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

function RollingFields({
  value,
  set,
  t,
}: {
  value: ScheduleVisibilityValue;
  set: (patch: Partial<ScheduleVisibilityValue>) => void;
  t: ReturnType<typeof useTranslations<"admin.policiesPage">>;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{t("visibleDaysLabel")}</Label>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={1}
          max={60}
          step={1}
          value={value.visibleScheduleDays}
          onChange={(e) =>
            set({
              visibleScheduleDays: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)),
            })
          }
          className="w-24"
        />
        <span className="text-sm text-muted">{t("daysUnit")}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[7, 14, 21, 30].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => set({ visibleScheduleDays: d })}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              value.visibleScheduleDays === d
                ? "bg-admin text-white"
                : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            {t("daysShort", { days: d })}
          </button>
        ))}
      </div>
      <p className="text-[13px] text-muted">
        {t("visibleDaysExplain", { days: value.visibleScheduleDays })}
      </p>
    </div>
  );
}

function WeeklyFields({
  value,
  set,
  t,
  dayNames,
}: {
  value: ScheduleVisibilityValue;
  set: (patch: Partial<ScheduleVisibilityValue>) => void;
  t: ReturnType<typeof useTranslations<"admin.policiesPage">>;
  dayNames: string[];
}) {
  const dow = value.scheduleReleaseDayOfWeek ?? 0;
  const hour = value.scheduleReleaseHour ?? 22;
  const weeksAhead = value.scheduleReleaseWeeksAhead ?? 1;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("releaseDayLabel")}</Label>
          <Select
            value={String(dow)}
            onValueChange={(v) => set({ scheduleReleaseDayOfWeek: parseInt(v) })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {dayNames.map((name, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">{t("releaseHourLabel")}</Label>
          <Select
            value={String(hour)}
            onValueChange={(v) => set({ scheduleReleaseHour: parseInt(v) })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem key={h} value={String(h)}>
                  {String(h).padStart(2, "0")}:00
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{t("weeksAheadLabel")}</Label>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set({ scheduleReleaseWeeksAhead: n })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                weeksAhead === n
                  ? "bg-admin text-white"
                  : "bg-surface text-muted hover:text-foreground"
              }`}
            >
              {t("weeksShort", { weeks: n })}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted">
          {t("weeklyExplain", {
            day: dayNames[dow] ?? "",
            hour: String(hour).padStart(2, "0"),
            weeks: weeksAhead,
          })}
        </p>
      </div>
    </div>
  );
}

function getDayNames(locale: string): string[] {
  // Sunday-first to match Date.getDay() and our DB convention.
  const base = new Date(2026, 2, 1); // 2026-03-01 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return capitalize(d.toLocaleDateString(locale, { weekday: "long" }));
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateLong(iso: string, locale: string, timeZone?: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return iso;
  }
}
