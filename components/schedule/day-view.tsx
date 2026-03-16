"use client";

import { useMemo, useRef } from "react";
import { motion, useAnimation, PanInfo } from "framer-motion";
import { format, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn, formatRelativeDay, formatTime } from "@/lib/utils";
import { ClassCard } from "@/components/schedule/class-card";
import type { ClassWithDetails } from "@/types";

interface DayViewProps {
  classes: ClassWithDetails[];
  date: Date;
  onClassClick: (classData: ClassWithDetails) => void;
  onDateChange?: (date: Date) => void;
}

const TIME_SLOTS = Array.from({ length: 14 }, (_, i) => i + 6); // 6 AM – 7 PM

function getSlotPosition(startsAt: Date | string): number {
  const d = new Date(startsAt);
  return d.getHours() + d.getMinutes() / 60 - 6;
}

function getSlotDuration(
  startsAt: Date | string,
  endsAt: Date | string,
): number {
  return (
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000
  );
}

const SWIPE_THRESHOLD = 60;

export function DayView({
  classes,
  date,
  onClassClick,
  onDateChange,
}: DayViewProps) {
  const controls = useAnimation();
  const constraintRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () =>
      [...classes].sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      ),
    [classes],
  );

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (!onDateChange) return;
    if (info.offset.x > SWIPE_THRESHOLD) {
      onDateChange(subDays(date, 1));
    } else if (info.offset.x < -SWIPE_THRESHOLD) {
      onDateChange(addDays(date, 1));
    }
    controls.start({ x: 0, opacity: 1 });
  }

  return (
    <div ref={constraintRef} className="overflow-hidden">
      {/* Day header */}
      <div className="mb-4 text-center">
        <h2 className="font-display text-xl font-bold capitalize text-foreground">
          {formatRelativeDay(date)}
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          {format(date, "d 'de' MMMM, yyyy", { locale: es })}
        </p>
      </div>

      {/* Swipeable timeline */}
      <motion.div
        drag="x"
        dragConstraints={constraintRef}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        animate={controls}
        className="touch-pan-y"
      >
        <div className="relative ml-16 border-l border-border/60">
          {/* Time slot lines */}
          {TIME_SLOTS.map((hour) => (
            <div
              key={hour}
              className="relative flex h-20 items-start border-b border-border/30"
            >
              <span className="absolute -left-16 top-0 w-12 text-right font-mono text-xs text-muted/60">
                {format(new Date(2000, 0, 1, hour), "h a")}
              </span>
            </div>
          ))}

          {/* Class cards overlay */}
          {sorted.map((c, i) => {
            const top = getSlotPosition(c.startsAt) * 80; // 80px per hour slot
            const height = Math.max(getSlotDuration(c.startsAt, c.endsAt) * 80 - 4, 60);

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.06 }}
                className="absolute inset-x-2 z-10"
                style={{ top, height }}
              >
                <ClassCard
                  classData={c}
                  maxCapacity={c.classType.maxCapacity}
                  onClick={() => onClassClick(c)}
                  className="h-full"
                />
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <div className="flex flex-col items-center py-16 text-muted/50">
          <p className="text-sm">Sin clases para este día</p>
        </div>
      )}
    </div>
  );
}
