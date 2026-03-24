"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfWeek,
  addDays,
  isSameDay,
  isToday,
  format,
  addWeeks,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ClassCard } from "@/components/schedule/class-card";
import type { ClassWithDetails } from "@/types";

interface WeekViewProps {
  classes: ClassWithDetails[];
  onClassClick: (classData: ClassWithDetails) => void;
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function WeekView({
  classes,
  onClassClick,
  currentDate,
  onDateChange,
}: WeekViewProps) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const classesByDay = useMemo(() => {
    const map = new Map<string, ClassWithDetails[]>();
    for (const day of days) {
      const key = format(day, "yyyy-MM-dd");
      map.set(
        key,
        classes
          .filter((c) => isSameDay(new Date(c.startsAt), day))
          .sort(
            (a, b) =>
              new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
          ),
      );
    }
    return map;
  }, [classes, days]);

  return (
    <div>
      {/* Week navigation */}
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onDateChange(subWeeks(currentDate, 1))}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <h2 className="font-display text-lg font-bold text-foreground">
          {format(weekStart, "d MMM", { locale: es })} –{" "}
          {format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}
        </h2>

        <button
          type="button"
          onClick={() => onDateChange(addWeeks(currentDate, 1))}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label="Semana siguiente"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile: horizontal day selector */}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1 scrollbar-none md:hidden">
        {days.map((day) => {
          const isSelected = isSameDay(day, currentDate);
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDateChange(day)}
              className={cn(
                "flex min-w-[52px] shrink-0 flex-col items-center rounded-2xl px-3 py-2.5 transition-all",
                isSelected
                  ? "bg-accent text-white shadow-[var(--shadow-warm-md)]"
                  : "text-muted hover:bg-surface",
                today && !isSelected && "ring-2 ring-accent/30",
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-wider">
                {format(day, "EEE", { locale: es })}
              </span>
              <span className="mt-0.5 font-mono text-lg font-bold">
                {format(day, "d")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Mobile: selected day classes */}
      <div className="md:hidden">
        <MobileDayClasses
          classes={
            classesByDay.get(format(currentDate, "yyyy-MM-dd")) ?? []
          }
          onClassClick={onClassClick}
        />
      </div>

      {/* Desktop: 7-column grid */}
      <div className="hidden md:grid md:grid-cols-7 md:gap-3">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayClasses = classesByDay.get(key) ?? [];
          const today = isToday(day);

          return (
            <div key={key} className="min-w-0">
              {/* Day header */}
              <div
                className={cn(
                  "mb-3 flex flex-col items-center rounded-xl py-2 transition-colors",
                  today ? "bg-accent/10" : "bg-surface/60",
                )}
              >
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
                  {format(day, "EEE", { locale: es })}
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-bold",
                    today && "bg-accent text-white",
                  )}
                >
                  {format(day, "d")}
                </span>
              </div>

              {/* Classes */}
              <motion.div
                className="flex flex-col gap-2"
                initial="hidden"
                animate="show"
                variants={{
                  show: {
                    transition: { staggerChildren: 0.06 },
                  },
                }}
              >
                {dayClasses.length > 0 ? (
                  dayClasses.map((c) => (
                    <motion.div key={c.id} variants={staggerItem}>
                      <ClassCard
                        classData={c}
                        maxCapacity={c.room?.maxCapacity ?? 0}
                        onClick={() => onClassClick(c)}
                      />
                    </motion.div>
                  ))
                ) : (
                  <p className="py-6 text-center text-xs text-muted/50">
                    Sin clases
                  </p>
                )}
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MobileDayClasses({
  classes,
  onClassClick,
}: {
  classes: ClassWithDetails[];
  onClassClick: (c: ClassWithDetails) => void;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={classes.length > 0 ? classes[0]?.id : "empty"}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.2 }}
        className="flex flex-col gap-3"
      >
        {classes.length > 0 ? (
          classes.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <ClassCard
                classData={c}
                maxCapacity={c.room?.maxCapacity ?? 0}
                onClick={() => onClassClick(c)}
              />
            </motion.div>
          ))
        ) : (
          <div className="flex flex-col items-center py-12 text-muted/50">
            <p className="text-sm">Sin clases programadas</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
