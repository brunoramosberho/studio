"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime } from "@/lib/utils";
import type { ClassWithDetails } from "@/types";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function CoachSchedulePage() {
  const { data: session } = useSession();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(new Date());

  const from = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const to = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const { data: classes, isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["coach-schedule", from, to, session?.user?.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/classes?from=${from}&to=${to}&coachId=${session?.user?.id}`,
      );
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!session?.user?.id,
  });

  const classesByDay = useMemo(() => {
    const map = new Map<string, ClassWithDetails[]>();
    classes?.forEach((c) => {
      const key = format(new Date(c.startsAt), "yyyy-MM-dd");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [classes]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const selectedDayClasses = selectedDay
    ? classesByDay.get(format(selectedDay, "yyyy-MM-dd")) ?? []
    : [];

  const classTypeColors: Record<string, string> = {};
  const palette = [
    "bg-coach/20",
    "bg-amber-200/60",
    "bg-blue-200/60",
    "bg-rose-200/60",
    "bg-violet-200/60",
    "bg-teal-200/60",
  ];
  let colorIdx = 0;
  classes?.forEach((c) => {
    if (!classTypeColors[c.classType.id]) {
      classTypeColors[c.classType.id] = palette[colorIdx % palette.length];
      colorIdx++;
    }
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">Mi Horario</h1>
        <p className="mt-1 text-muted">Tu calendario mensual de clases</p>
      </motion.div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-display text-lg font-bold capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: es })}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Calendar grid */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div
                key={d}
                className="py-2 text-center text-xs font-semibold text-muted"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-px">
            {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const dayClasses = classesByDay.get(key) ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const selected = selectedDay && isSameDay(day, selectedDay);
              const today = isToday(day);

              return (
                <button
                  key={key}
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    "relative flex min-h-[60px] flex-col items-center gap-0.5 rounded-xl p-1.5 transition-colors sm:min-h-[72px]",
                    inMonth ? "text-foreground" : "text-muted/40",
                    selected && "bg-coach/10 ring-1 ring-coach/30",
                    !selected && "hover:bg-surface",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                      today && !selected && "bg-coach text-white",
                      today && selected && "bg-coach text-white",
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {dayClasses.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-0.5">
                      {dayClasses.slice(0, 3).map((c) => (
                        <div
                          key={c.id}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            classTypeColors[c.classType.id] || "bg-coach/40",
                          )}
                        />
                      ))}
                      {dayClasses.length > 3 && (
                        <span className="text-[9px] text-muted">
                          +{dayClasses.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected day detail */}
      {selectedDay && (
        <motion.div
          key={format(selectedDay, "yyyy-MM-dd")}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h3 className="font-display text-lg font-bold capitalize">
            {format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}
          </h3>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : selectedDayClasses.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <CalendarDays className="h-8 w-8 text-muted/30" />
                <p className="text-sm text-muted">Sin clases este día</p>
              </CardContent>
            </Card>
          ) : (
            <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
              {selectedDayClasses
                .sort(
                  (a, b) =>
                    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
                )
                .map((cls) => {
                  const enrolled = cls._count?.bookings ?? cls.bookings.length;
                  return (
                    <motion.div key={cls.id} variants={fadeUp}>
                      <Link href={`/coach/class/${cls.id}`}>
                        <Card className="transition-shadow hover:shadow-warm-md">
                          <CardContent className="flex items-center gap-4 p-4">
                            <div
                              className="h-10 w-1 rounded-full"
                              style={{
                                backgroundColor: cls.classType.color || "#2D5016",
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-display text-base font-bold">
                                {cls.classType.name}
                              </p>
                              <p className="text-sm text-muted">
                                {formatTime(cls.startsAt)} – {formatTime(cls.endsAt)}
                              </p>
                            </div>
                            <Badge variant="secondary">
                              {enrolled}/{cls.classType.maxCapacity}
                            </Badge>
                          </CardContent>
                        </Card>
                      </Link>
                    </motion.div>
                  );
                })}
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
}
