"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, Users } from "lucide-react";
import {
  format,
  addDays,
  startOfDay,
  isSameDay,
  isToday,
  isPast,
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

  const rangeStart = startOfDay(currentDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(rangeStart, i));

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
              onClick={() => setCurrentDate(addDays(currentDate, -7))}
              className="mr-auto rounded-full p-1.5 text-muted hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium uppercase tracking-widest text-muted">
              {format(rangeStart, "d MMM", { locale: es })}
              {" – "}
              {format(addDays(rangeStart, 6), "d MMM yyyy", { locale: es })}
            </span>
            <button
              onClick={() => setCurrentDate(addDays(currentDate, 7))}
              className="ml-auto rounded-full p-1.5 text-muted hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* ── Desktop: 7-col week ── */}
          <div className="hidden lg:block">
            {/* Day headers */}
            <div className="mb-4 grid grid-cols-7 gap-4">
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
            <div className="grid grid-cols-7 items-start gap-4">
              {weekDays.map((day) => {
                const dayClasses = getClassesForDay(day);
                return (
                  <div key={day.toISOString()} className="space-y-4">
                    {dayClasses.map((cls) => (
                      <ClassCard key={cls.id} cls={cls} />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Mobile: horizontal scroll showing all 7 days ── */}
          <div className="-mx-4 lg:hidden">
            <div className="flex overflow-x-auto scroll-smooth snap-x snap-mandatory px-4" style={{ WebkitOverflowScrolling: "touch" }}>
              {weekDays.map((day) => {
                const dayClasses = getClassesForDay(day);
                const today = isToday(day);
                return (
                  <div
                    key={day.toISOString()}
                    className="w-[calc(50%-6px)] shrink-0 snap-start pr-3"
                  >
                    {/* Day header */}
                    <div className="mb-3 text-center">
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

                    {/* Day classes */}
                    <div className="space-y-4">
                      {dayClasses.map((cls) => (
                        <ClassCard key={cls.id} cls={cls} />
                      ))}
                      {dayClasses.length === 0 && (
                        <p className="py-10 text-center text-[11px] text-muted/30">
                          Sin clases
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom filter bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white px-4 py-3 safe-bottom lg:hidden">
        <div className="flex gap-2">
          <MobileFilterSelect
            value={filterType}
            onChange={setFilterType}
            placeholder="Por disciplina"
            options={classTypes.map((t) => ({ value: t.id, label: t.name }))}
          />
          <MobileFilterSelect
            value={filterCoach}
            onChange={setFilterCoach}
            placeholder="Por instructor"
            options={coaches.map((c) => ({ value: c.id, label: c.user.name || "" }))}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Class card — matches Siclo's compact rounded card ── */
function ClassCard({ cls }: { cls: ClassWithDetails }) {
  const past = isPast(new Date(cls.startsAt));

  return (
    <Link href={`/class/${cls.id}`} className={past ? "pointer-events-none" : ""}>
      <div
        className={cn(
          "flex h-[140px] flex-col justify-between rounded-2xl border px-4 py-3.5 transition-shadow",
          past
            ? "border-border/30 bg-surface/60"
            : "border-border/70 bg-white hover:shadow-md"
        )}
      >
        <div>
          <p className={cn("text-[13px] font-medium", past ? "text-muted/50" : "text-foreground")}>
            {formatTime(cls.startsAt)}
          </p>
          <p className={cn("text-[11px]", past ? "text-muted/40" : "text-muted")}>
            {cls.classType.duration} min
          </p>
          <p className={cn("mt-1.5 truncate text-[14px] font-bold", past ? "text-muted/50" : "text-foreground")}>
            {cls.classType.name}
          </p>
          <p className={cn("mt-0.5 truncate text-[12px]", past ? "text-muted/40" : "text-muted")}>
            con {cls.coach.user.name?.split(" ")[0]}
          </p>
        </div>
        <Users className={cn("h-3.5 w-3.5", past ? "text-muted/20" : "text-muted/30")} />
      </div>
    </Link>
  );
}

/* ── Sidebar filter dropdown (overlay pattern for Safari compat) ── */
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
  const selectedLabel = options.find((o) => o.value === value)?.label || label;
  return (
    <div className="relative">
      <div className="pointer-events-none flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2.5">
        <span className="text-[14px] font-medium text-foreground">{selectedLabel}</span>
        <ChevronDown className="h-4 w-4 text-muted" />
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
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

/* ── Mobile filter dropdown (same overlay pattern) ── */
function MobileFilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  const allOptions = [{ value: "all", label: placeholder }, ...options];
  const selectedLabel = allOptions.find((o) => o.value === value)?.label || placeholder;
  return (
    <div className="relative flex-1">
      <div className="pointer-events-none flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
        <span className="truncate text-[13px] font-medium text-foreground">{selectedLabel}</span>
        <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted" />
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {allOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
