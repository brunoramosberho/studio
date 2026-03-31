"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Flame, Check, Loader2 } from "lucide-react";
import { getIconComponent } from "@/components/admin/icon-picker";
import { cn } from "@/lib/utils";

interface Activity {
  name: string;
  icon: string | null;
  color: string;
}

interface CalendarData {
  year: number;
  month: number;
  activities: Record<string, Activity[]>;
  weekStreak: number;
  weeksWithActivity: string[];
}

const DAY_HEADERS = ["L", "M", "X", "J", "V", "S", "D"];

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function getCalendarWeeks(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7;

  const weeks: { date: Date; inMonth: boolean }[][] = [];
  let current = new Date(year, month, 1 - (startDow - 1));

  while (current <= lastDay || weeks.length === 0 || weeks[weeks.length - 1].length < 7) {
    if (!weeks.length || weeks[weeks.length - 1].length === 7) {
      weeks.push([]);
    }
    weeks[weeks.length - 1].push({
      date: new Date(current),
      inMonth: current.getMonth() === month,
    });
    current.setDate(current.getDate() + 1);

    if (weeks[weeks.length - 1].length === 7 && current > lastDay && current.getDay() === 1) {
      break;
    }
  }

  return weeks;
}

function startOfWeekMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function ActivityDot({
  activities,
  day,
  isToday,
  inMonth,
}: {
  activities: Activity[] | undefined;
  day: number;
  isToday: boolean;
  inMonth: boolean;
}) {
  if (!activities || activities.length === 0) {
    return (
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-[13px]",
          isToday
            ? "ring-1.5 ring-foreground/80 ring-offset-1 ring-offset-background"
            : "",
          inMonth ? "text-foreground/50" : "text-foreground/20",
        )}
      >
        {day}
      </div>
    );
  }

  const primary = activities[0];
  const Icon = primary.icon ? getIconComponent(primary.icon) : null;
  const hasMultiple = activities.length > 1;

  return (
    <div className="relative flex h-9 w-9 items-center justify-center">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          isToday && "ring-1.5 ring-foreground/80 ring-offset-1 ring-offset-background",
        )}
        style={{ backgroundColor: primary.color }}
      >
        {Icon ? (
          <Icon className="h-4 w-4 text-white" strokeWidth={2.5} />
        ) : (
          <span className="text-[10px] font-bold text-white">
            {primary.name.slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      {hasMultiple && (
        <div
          className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background"
          style={{ backgroundColor: activities[1].color }}
        />
      )}
    </div>
  );
}

export function ActivityCalendar() {
  const { data: session } = useSession();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const { data, isLoading } = useQuery<CalendarData>({
    queryKey: ["activity-calendar", year, month + 1],
    queryFn: async () => {
      const res = await fetch(
        `/api/profile/activity-calendar?year=${year}&month=${month + 1}`,
      );
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!session?.user,
  });

  const weeks = getCalendarWeeks(year, month);
  const todayStr = now.toISOString().slice(0, 10);

  const totalActivitiesInMonth = data
    ? Object.values(data.activities).reduce((sum, arr) => sum + arr.length, 0)
    : 0;

  function goPrev() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goNext() {
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    if (isCurrentMonth) return;
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const activeWeekKeys = new Set(data?.weeksWithActivity ?? []);

  return (
    <div className="rounded-2xl border border-border/50 bg-white p-4">
      {/* Month nav */}
      <div className="flex items-center justify-between">
        <button
          onClick={goPrev}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-surface"
        >
          <ChevronLeft className="h-4 w-4 text-muted" />
        </button>
        <p className="font-display text-lg font-bold capitalize text-foreground">
          {MONTH_NAMES[month]} {year}
        </p>
        <button
          onClick={goNext}
          disabled={isCurrentMonth}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full transition-colors active:bg-surface",
            isCurrentMonth && "opacity-30",
          )}
        >
          <ChevronRight className="h-4 w-4 text-muted" />
        </button>
      </div>

      {/* Stats row */}
      {data && (data.weekStreak > 0 || totalActivitiesInMonth > 0) && (
        <div className="mt-3 flex gap-6">
          {data.weekStreak > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted">Tu serie</p>
              <p className="font-display text-xl font-bold text-foreground">
                {data.weekStreak}{" "}
                <span className="text-[13px] font-semibold">
                  Semana{data.weekStreak !== 1 ? "s" : ""}
                </span>
              </p>
            </div>
          )}
          {totalActivitiesInMonth > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted">
                Clases en {MONTH_NAMES[month].slice(0, 3)}
              </p>
              <p className="font-display text-xl font-bold text-foreground">
                {totalActivitiesInMonth}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Calendar grid */}
      <div className="mt-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <div className="flex gap-1.5">
            {/* Main calendar */}
            <div className="flex-1">
              {/* Day headers */}
              <div className="mb-1.5 grid grid-cols-7">
                {DAY_HEADERS.map((d) => (
                  <div
                    key={d}
                    className="flex items-center justify-center text-[11px] font-medium text-muted"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Weeks */}
              <div className="space-y-1">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7">
                    {week.map((cell, di) => {
                      const dateStr = cell.date.toISOString().slice(0, 10);
                      const activities = data?.activities[dateStr];
                      return (
                        <div
                          key={di}
                          className="flex items-center justify-center py-0.5"
                        >
                          <ActivityDot
                            activities={activities}
                            day={cell.date.getDate()}
                            isToday={dateStr === todayStr}
                            inMonth={cell.inMonth}
                          />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Streak column */}
            {data && data.weekStreak > 0 && (() => {
              // Flame goes on the last week that has activity
              let flameWeekIdx = -1;
              for (let i = weeks.length - 1; i >= 0; i--) {
                const ws = startOfWeekMonday(weeks[i][0].date);
                if (activeWeekKeys.has(ws)) {
                  flameWeekIdx = i;
                  break;
                }
              }

              const emptyBelow = weeks.length - 1 - flameWeekIdx;
              const barBottomPct = (emptyBelow / weeks.length) * 100;

              return (
                <div className="flex w-14 flex-col items-center pt-6">
                  <div className="relative flex flex-1 flex-col items-center">
                    {/* Vertical bar — stops at the flame row */}
                    <div
                      className="absolute inset-x-0 top-2 mx-auto w-5 rounded-full bg-accent/10"
                      style={{ bottom: `${barBottomPct}%` }}
                    />

                    <div className="relative flex flex-1 flex-col items-center justify-around">
                      {weeks.map((week, wi) => {
                        const weekStart = startOfWeekMonday(week[0].date);
                        const isActive = activeWeekKeys.has(weekStart);
                        const isFlameWeek = wi === flameWeekIdx;
                        return (
                          <div
                            key={wi}
                            className="relative z-10 flex h-9 items-center justify-center"
                          >
                            {isFlameWeek ? (
                              <div className="relative flex h-12 w-12 items-center justify-center">
                                <Flame
                                  className="h-12 w-12 text-accent drop-shadow-sm"
                                  fill="currentColor"
                                  strokeWidth={0.5}
                                />
                                <span
                                  className="absolute text-xs font-extrabold leading-none text-white drop-shadow-sm"
                                  style={{ top: "52%" }}
                                >
                                  {data.weekStreak}
                                </span>
                              </div>
                            ) : isActive ? (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
                                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="h-2 w-2 rounded-full bg-border/60" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
