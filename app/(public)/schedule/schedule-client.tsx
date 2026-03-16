"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import {
  format,
  addDays,
  startOfWeek,
  isSameDay,
  isToday,
  subWeeks,
  addWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn, formatTime } from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

export function ScheduleClient() {
  const [classes, setClasses] = useState<ClassWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCoach, setFilterCoach] = useState<string>("all");

  useEffect(() => {
    async function fetchClasses() {
      setLoading(true);
      try {
        const res = await fetch("/api/classes");
        if (res.ok) setClasses(await res.json());
      } catch {
        /* no db */
      } finally {
        setLoading(false);
      }
    }
    fetchClasses();
  }, []);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const classTypes = Array.from(
    new Map(classes.map((c) => [c.classType.id, c.classType])).values()
  );
  const coaches = Array.from(
    new Map(classes.map((c) => [c.coach.id, c.coach])).values()
  );

  function getClassesForDay(day: Date) {
    return classes
      .filter((c) => isSameDay(new Date(c.startsAt), day))
      .filter((c) => filterType === "all" || c.classType.id === filterType)
      .filter((c) => filterCoach === "all" || c.coach.id === filterCoach);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-6 lg:pb-8">
      <div className="flex gap-10 lg:flex-row">
        {/* ── Sidebar (desktop) ── */}
        <aside className="hidden shrink-0 lg:block lg:w-52">
          <div className="sticky top-20 space-y-8">
            <div>
              <h1 className="font-display text-[2rem] font-bold leading-tight text-foreground">
                Flō Studio
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Pilates & Wellness
              </p>
            </div>

            <div className="space-y-4">
              <FilterSelect
                label="Por disciplina"
                value={filterType}
                onChange={setFilterType}
                options={[
                  { value: "all", label: "Todas" },
                  ...classTypes.map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
              <FilterSelect
                label="Por instructor"
                value={filterCoach}
                onChange={setFilterCoach}
                options={[
                  { value: "all", label: "Todos" },
                  ...coaches.map((c) => ({
                    value: c.id,
                    label: c.user.name || "Coach",
                  })),
                ]}
              />
            </div>
          </div>
        </aside>

        {/* ── Calendar grid ── */}
        <div className="min-w-0 flex-1">
          {/* Week nav */}
          <div className="mb-5 flex items-center">
            <button
              onClick={() => setCurrentDate(subWeeks(currentDate, 1))}
              className="mr-auto rounded-full p-1.5 text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium uppercase tracking-widest text-muted">
              {format(weekStart, "MMMM yyyy", { locale: es })}
            </span>
            <button
              onClick={() => setCurrentDate(addWeeks(currentDate, 1))}
              className="ml-auto rounded-full p-1.5 text-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* ── Desktop: 7-col week ── */}
          <div className="hidden lg:block">
            {/* Day headers */}
            <div className="mb-3 grid grid-cols-7 gap-3">
              {weekDays.map((day) => {
                const today = isToday(day);
                return (
                  <div key={day.toISOString()} className="text-center">
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wider",
                        today ? "text-foreground" : "text-muted"
                      )}
                    >
                      {today && "● "}
                      {format(day, "EEE", { locale: es })}
                      {" "}
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Class columns */}
            <div className="grid grid-cols-7 items-start gap-3">
              {weekDays.map((day) => {
                const dayClasses = getClassesForDay(day);
                return (
                  <div key={day.toISOString()} className="space-y-2">
                    {dayClasses.map((cls) => (
                      <ClassCard key={cls.id} cls={cls} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Mobile: 2-col grid ── */}
          <div className="lg:hidden">
            {/* Day headers */}
            <div className="mb-3 grid grid-cols-2 gap-3">
              {weekDays.slice(0, 2).map((day) => {
                const today = isToday(day);
                return (
                  <div key={day.toISOString()} className="text-center">
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wider",
                        today ? "text-foreground" : "text-muted"
                      )}
                    >
                      {today && "● "}
                      {format(day, "EEE d", { locale: es })}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 items-start gap-3">
              {weekDays.slice(0, 2).map((day) => {
                const dayClasses = getClassesForDay(day);
                return (
                  <div key={day.toISOString()} className="space-y-2">
                    {dayClasses.map((cls) => (
                      <ClassCard key={cls.id} cls={cls} />
                    ))}
                    {dayClasses.length === 0 && (
                      <p className="py-10 text-center text-[11px] text-muted/30">
                        Sin clases
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Swipe hint */}
            <p className="mt-6 text-center text-[11px] text-muted/50">
              Desliza para ver más días →
            </p>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom filter bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white px-4 py-3 safe-bottom lg:hidden">
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-[13px] font-medium text-foreground"
          >
            <option value="all">Por disciplina</option>
            {classTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={filterCoach}
            onChange={(e) => setFilterCoach(e.target.value)}
            className="flex-1 rounded-xl border border-border bg-white px-3 py-2.5 text-[13px] font-medium text-foreground"
          >
            <option value="all">Por instructor</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.user.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/* ── Class card — matches Siclo's compact rounded card ── */
function ClassCard({ cls }: { cls: ClassWithDetails }) {
  return (
    <Link href={`/class/${cls.id}`}>
      <div className="rounded-2xl border border-border/70 bg-white px-4 py-3.5 transition-shadow hover:shadow-md">
        <p className="text-[13px] text-muted">
          <span className="font-medium text-foreground">
            {formatTime(cls.startsAt)}
          </span>
          {" – "}
          {cls.classType.duration} min
        </p>
        <p className="mt-1.5 text-[14px] font-bold leading-snug text-foreground">
          {cls.classType.name.split(" ")[0]} con{" "}
          {cls.coach.user.name?.split(" ")[0]}
        </p>
        <div className="mt-2">
          <Users className="h-4 w-4 text-muted/30" />
        </div>
      </div>
    </Link>
  );
}

/* ── Sidebar filter dropdown ── */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-white px-3 py-3 text-[14px] font-medium text-foreground focus:border-foreground focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
