"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ConfidenceBadge } from "@/components/onboarding/ConfidenceBadge";
import type { ExtractedScheduleSlot, ExtractedDiscipline, ExtractedCoach } from "@/lib/onboarding/types";
import { CalendarDays, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const DAY_NAMES: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

interface Props {
  data: ExtractedScheduleSlot[];
  disciplines: ExtractedDiscipline[];
  coaches: ExtractedCoach[];
  onChange: (data: ExtractedScheduleSlot[]) => void;
}

export function ScheduleCard({ data, disciplines, coaches, onChange }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const update = (i: number, partial: Partial<ExtractedScheduleSlot>) =>
    onChange(data.map((d, j) => (j === i ? { ...d, ...partial } : d)));

  const remove = (i: number) => {
    onChange(data.filter((_, j) => j !== i));
    if (expanded === i) setExpanded(null);
  };

  const add = () => {
    onChange([
      ...data,
      {
        dayOfWeek: 1,
        startTime: "09:00",
        disciplineName: disciplines[0]?.name || "",
        coachName: coaches[0]?.name || null,
        durationMinutes: 50,
        confidence: "low",
      },
    ]);
    setExpanded(data.length);
  };

  // Group by day for display
  const sorted = [...data].map((slot, idx) => ({ ...slot, _idx: idx }));
  sorted.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

  const grouped = new Map<number, typeof sorted>();
  for (const slot of sorted) {
    const list = grouped.get(slot.dayOfWeek) ?? [];
    list.push(slot);
    grouped.set(slot.dayOfWeek, list);
  }

  return (
    <Card className="border border-gray-100">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-indigo-500" />
            Horario semanal
            <span className="text-xs font-normal text-gray-400">({data.length} clases)</span>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={add} className="gap-1 text-xs text-indigo-600">
            <Plus className="h-3.5 w-3.5" /> Añadir
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.length === 0 && (
          <p className="text-sm text-gray-400">
            No se detectaron horarios. Se generarán clases con horarios estándar.
          </p>
        )}
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const slots = grouped.get(day);
          if (!slots || slots.length === 0) return null;
          return (
            <div key={day}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {DAY_NAMES[day]}
              </p>
              <div className="space-y-1">
                {slots.map((slot) => {
                  const i = slot._idx;
                  return (
                    <div key={i} className="rounded-lg border border-gray-100 bg-gray-50/50">
                      <div
                        className="flex cursor-pointer items-center gap-2 px-3 py-2"
                        onClick={() => setExpanded(expanded === i ? null : i)}
                      >
                        <span className="w-12 font-mono text-xs text-gray-600">
                          {slot.startTime}
                        </span>
                        <span className="flex-1 text-sm font-medium text-gray-900">
                          {slot.disciplineName || "—"}
                        </span>
                        {slot.coachName && (
                          <span className="text-xs text-gray-500">{slot.coachName}</span>
                        )}
                        <ConfidenceBadge level={slot.confidence} />
                        {expanded === i ? (
                          <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                        )}
                      </div>

                      {expanded === i && (
                        <div className="space-y-2 border-t border-gray-100 p-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="mb-1 block text-xs text-gray-500">Día</Label>
                              <select
                                value={slot.dayOfWeek}
                                onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })}
                                className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                              >
                                {Object.entries(DAY_NAMES).map(([val, name]) => (
                                  <option key={val} value={val}>{name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label className="mb-1 block text-xs text-gray-500">Hora</Label>
                              <Input
                                type="time"
                                value={slot.startTime}
                                onChange={(e) => update(i, { startTime: e.target.value })}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="mb-1 block text-xs text-gray-500">Duración</Label>
                              <Input
                                type="number"
                                value={slot.durationMinutes ?? ""}
                                onChange={(e) =>
                                  update(i, {
                                    durationMinutes: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                placeholder="min"
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <Label className="mb-1 block text-xs text-gray-500">Disciplina</Label>
                              <select
                                value={slot.disciplineName}
                                onChange={(e) => update(i, { disciplineName: e.target.value })}
                                className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                              >
                                <option value="">— seleccionar —</option>
                                {disciplines.map((d) => (
                                  <option key={d.name} value={d.name}>{d.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label className="mb-1 block text-xs text-gray-500">Coach</Label>
                              <select
                                value={slot.coachName || ""}
                                onChange={(e) => update(i, { coachName: e.target.value || null })}
                                className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                              >
                                <option value="">— sin asignar —</option>
                                {coaches.map((c) => (
                                  <option key={c.name} value={c.name}>{c.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => remove(i)}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                            >
                              <Trash2 className="h-3 w-3" /> Eliminar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
