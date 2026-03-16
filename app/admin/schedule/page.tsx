"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Palette,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  eachHourOfInterval,
  isSameDay,
  set,
} from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime } from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

type ColorMode = "coach" | "classType";

export default function AdminSchedulePage() {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [colorMode, setColorMode] = useState<ColorMode>("classType");

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(weekEnd, "yyyy-MM-dd");

  const { data: classes, isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["admin-schedule", from, to],
    queryFn: async () => {
      const res = await fetch(`/api/classes?from=${from}&to=${to}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const hours = Array.from({ length: 14 }, (_, i) => i + 6); // 6am to 7pm

  const coachColors: Record<string, string> = {};
  const typeColors: Record<string, string> = {};
  const palette = [
    "#1A2C4E", "#2D5016", "#C9A96E", "#7C3AED", "#DC2626",
    "#0891B2", "#D97706", "#059669",
  ];
  let cIdx = 0;
  let tIdx = 0;
  classes?.forEach((c) => {
    if (!coachColors[c.coach.id]) {
      coachColors[c.coach.id] = palette[cIdx % palette.length];
      cIdx++;
    }
    if (!typeColors[c.classType.id]) {
      typeColors[c.classType.id] = c.classType.color || palette[tIdx % palette.length];
      tIdx++;
    }
  });

  const getColor = (cls: ClassWithDetails) =>
    colorMode === "coach" ? coachColors[cls.coach.id] : typeColors[cls.classType.id];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Horario</h1>
          <p className="mt-1 text-muted">Vista semanal de todas las clases</p>
        </motion.div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() =>
              setColorMode(colorMode === "coach" ? "classType" : "coach")
            }
          >
            <Palette className="h-4 w-4" />
            {colorMode === "coach" ? "Por coach" : "Por tipo"}
          </Button>
        </div>
      </div>

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display text-base font-bold sm:text-lg">
          {format(weekStart, "d MMM", { locale: es })} – {format(weekEnd, "d MMM yyyy", { locale: es })}
        </h2>
        <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Week grid */}
      {isLoading ? (
        <Skeleton className="h-[600px] rounded-2xl" />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <div className="min-w-[700px]">
              {/* Day headers */}
              <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
                <div className="p-2" />
                {days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "border-l p-2 text-center",
                      isSameDay(day, new Date()) && "bg-admin/5",
                    )}
                  >
                    <p className="text-xs font-medium text-muted capitalize">
                      {format(day, "EEE", { locale: es })}
                    </p>
                    <p
                      className={cn(
                        "text-sm font-bold",
                        isSameDay(day, new Date()) && "text-admin",
                      )}
                    >
                      {format(day, "d")}
                    </p>
                  </div>
                ))}
              </div>

              {/* Hour rows */}
              {hours.map((hour) => (
                <div
                  key={hour}
                  className="grid grid-cols-[60px_repeat(7,1fr)] border-b last:border-b-0"
                >
                  <div className="flex items-start justify-end p-1 pr-2">
                    <span className="font-mono text-[10px] text-muted">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  </div>
                  {days.map((day) => {
                    const dayClasses =
                      classes?.filter((c) => {
                        const start = new Date(c.startsAt);
                        return isSameDay(start, day) && start.getHours() === hour;
                      }) ?? [];
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          "relative min-h-[48px] border-l p-0.5",
                          isSameDay(day, new Date()) && "bg-admin/[0.02]",
                        )}
                      >
                        {dayClasses.map((cls) => (
                          <div
                            key={cls.id}
                            className="mb-0.5 rounded-md px-1.5 py-1 text-white"
                            style={{ backgroundColor: getColor(cls) }}
                          >
                            <p className="truncate text-[10px] font-semibold leading-tight">
                              {cls.classType.name}
                            </p>
                            <p className="truncate text-[9px] opacity-80">
                              {cls.coach.user.name} · {formatTime(cls.startsAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
