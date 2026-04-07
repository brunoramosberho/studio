"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { format, addDays, subDays, isToday, isTomorrow, isYesterday } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ClassRoster } from "@/components/check-in/ClassRoster";

interface ClassItem {
  id: string;
  className: string;
  classColor: string;
  classIcon: string | null;
  startTime: string;
  endTime: string;
  coachName: string | null;
  coachImage: string | null;
  room: string;
  studioName: string;
  capacity: number;
  enrolledCount: number;
  checkedInCount: number;
  waitlistCount: number;
  isLive: boolean;
  isFinished: boolean;
}

function formatDateLabel(date: Date): string {
  if (isToday(date)) return "Hoy";
  if (isTomorrow(date)) return "Mañana";
  if (isYesterday(date)) return "Ayer";
  return format(date, "EEE d MMM", { locale: es });
}

function formatHeaderDate(date: Date): string {
  const label = formatDateLabel(date);
  const full = format(date, "EEEE, d 'de' MMMM", { locale: es });
  if (label === "Hoy" || label === "Mañana" || label === "Ayer") {
    return `${label} · ${full.charAt(0).toUpperCase() + full.slice(1)}`;
  }
  return full.charAt(0).toUpperCase() + full.slice(1);
}

export default function CheckInPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const dateStr = format(selectedDate, "yyyy-MM-dd");
  const isPastDate = !isToday(selectedDate) && selectedDate < new Date();

  const { data: classes = [], isLoading } = useQuery<ClassItem[]>({
    queryKey: ["check-in-classes", dateStr],
    queryFn: () => fetch(`/api/check-in/classes?date=${dateStr}`).then((r) => r.json()),
  });

  // Auto-select: live class first, then next upcoming, then first class
  useEffect(() => {
    if (classes.length === 0) {
      setSelectedClassId(null);
      return;
    }
    const live = classes.find((c) => c.isLive);
    if (live) {
      setSelectedClassId(live.id);
      return;
    }
    const upcoming = classes.find((c) => !c.isFinished);
    setSelectedClassId(upcoming?.id ?? classes[0].id);
  }, [classes]);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) ?? null,
    [classes, selectedClassId],
  );

  const occupancyPill = (c: ClassItem) => {
    const pct = c.capacity > 0 ? c.enrolledCount / c.capacity : 0;
    if (c.enrolledCount >= c.capacity) return { label: `${c.enrolledCount}/${c.capacity}`, className: "bg-emerald-50 text-emerald-700" };
    if (pct > 0.8) return { label: `${c.enrolledCount}/${c.capacity}`, className: "bg-emerald-50 text-emerald-700" };
    return { label: `${c.enrolledCount}/${c.capacity}`, className: "bg-blue-50 text-blue-700" };
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Check-in</h1>
        <p className="text-xs text-stone-400 mt-0.5">
          Gestiona la asistencia de las clases
        </p>
      </div>

      {/* Date nav */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSelectedDate((d) => subDays(d, 1))}
          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-500"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => setSelectedDate(new Date())}
          className={cn(
            "px-3 py-1 text-xs font-medium rounded-lg border transition-colors",
            isToday(selectedDate)
              ? "bg-[#3730B8] text-white border-[#3730B8]"
              : "border-stone-200 text-stone-600 hover:bg-stone-50",
          )}
        >
          Hoy
        </button>
        <span className="text-sm font-medium text-stone-700">
          {formatHeaderDate(selectedDate)}
        </span>
        <button
          onClick={() => setSelectedDate((d) => addDays(d, 1))}
          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-500"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-[260px_1fr] gap-3" style={{ height: "calc(100vh - 200px)" }}>
        {/* Left: class list */}
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-stone-100">
            <span className="text-xs font-medium text-stone-900">Clases de hoy</span>
            <span className="text-xs text-stone-400">
              {format(selectedDate, "EEE d MMM", { locale: es })}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin text-stone-300" size={20} />
              </div>
            ) : classes.length === 0 ? (
              <div className="text-center py-12 text-xs text-stone-400">
                No hay clases programadas
              </div>
            ) : (
              classes.map((c) => {
                const isSelected = c.id === selectedClassId;
                const pill = occupancyPill(c);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClassId(c.id)}
                    className={cn(
                      "w-full text-left px-3.5 py-2.5 border-b border-stone-50 transition-colors",
                      isSelected
                        ? "border-l-[3px] border-l-[#3730B8] bg-[#EEEDFE]"
                        : "border-l-[3px] border-l-transparent hover:bg-stone-50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] text-stone-500">
                        {format(new Date(c.startTime), "HH:mm")} – {format(new Date(c.endTime), "HH:mm")}
                      </span>
                      {c.isLive && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-red-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          EN CURSO
                        </span>
                      )}
                      {c.isFinished && (
                        <span className="text-[10px] text-stone-400">Terminada</span>
                      )}
                    </div>
                    <p className="text-[13px] font-medium text-stone-900 truncate">
                      {c.className}
                    </p>
                    <p className="text-xs text-stone-500 truncate">{c.coachName}</p>
                    <div className="flex gap-1.5 mt-1">
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", pill.className)}>
                        {pill.label}
                      </span>
                      {c.checkedInCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          ✓ {c.checkedInCount}
                        </span>
                      )}
                      {c.waitlistCount > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">
                          {c.waitlistCount} en espera
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: roster */}
        <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden relative">
          {selectedClass ? (
            <ClassRoster
              classId={selectedClass.id}
              classInfo={{
                className: selectedClass.className,
                startTime: selectedClass.startTime,
                endTime: selectedClass.endTime,
                coachName: selectedClass.coachName,
                room: selectedClass.room,
                capacity: selectedClass.capacity,
                enrolledCount: selectedClass.enrolledCount,
                isFinished: selectedClass.isFinished || isPastDate,
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-stone-400">
              {isLoading ? (
                <Loader2 className="animate-spin text-stone-300" size={20} />
              ) : (
                "Selecciona una clase para ver el roster"
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
