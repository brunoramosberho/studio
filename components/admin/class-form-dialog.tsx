"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMinutes, addWeeks, format, setDay, startOfDay, isBefore, isAfter } from "date-fns";
import { Loader2, Music, CalendarRange, Repeat, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClassType, CoachProfile, User } from "@prisma/client";
import type { ClassWithDetails } from "@/types";

interface StudioWithRooms {
  id: string;
  name: string;
  rooms: { id: string; name: string; maxCapacity: number; classTypes: { id: string; name: string }[] }[];
}

type CoachProfileWithUser = CoachProfile & { user?: Pick<User, "id" | "name" | "email" | "image"> | null };

const SONG_CRITERIA_OPTIONS = [
  { value: "ALL", label: "Todos los asistentes" },
  { value: "BIRTHDAY_WEEK", label: "Cumpleañeros de la semana" },
  { value: "ANNIVERSARY", label: "Aniversario de su primera clase" },
  { value: "FIRST_CLASS", label: "Primera clase" },
  { value: "CLASS_MILESTONE", label: "Hito de clases (10, 25, 50, 100…)" },
];

const DAY_LABELS = [
  { index: 0, short: "L", full: "Lunes" },
  { index: 1, short: "M", full: "Martes" },
  { index: 2, short: "Mi", full: "Miércoles" },
  { index: 3, short: "J", full: "Jueves" },
  { index: 4, short: "V", full: "Viernes" },
  { index: 5, short: "S", full: "Sábado" },
  { index: 6, short: "D", full: "Domingo" },
];

type ScheduleMode = "single" | "recurring";

interface ClassFormData {
  classTypeId: string;
  coachProfileId: string;
  roomId: string;
  // Single mode
  date: string;
  // Recurring mode
  dateFrom: string;
  dateTo: string;
  days: number[];
  // Shared
  time: string;
  duration: number;
  tag: string;
  songRequestsEnabled: boolean;
  songRequestCriteria: string[];
}

const emptyForm: ClassFormData = {
  classTypeId: "",
  coachProfileId: "",
  roomId: "",
  date: "",
  dateFrom: "",
  dateTo: "",
  days: [],
  time: "",
  duration: 50,
  tag: "",
  songRequestsEnabled: true,
  songRequestCriteria: ["ALL"],
};

interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClass?: ClassWithDetails | null;
  defaultDate?: string;
  defaultTime?: string;
  onSaved?: () => void;
}

export function ClassFormDialog({
  open,
  onOpenChange,
  editingClass,
  defaultDate,
  defaultTime,
  onSaved,
}: ClassFormDialogProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);
  const [mode, setMode] = useState<ScheduleMode>("single");

  const { data: classTypes } = useQuery<ClassType[]>({
    queryKey: ["class-types"],
    queryFn: async () => {
      const res = await fetch("/api/class-types");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: coaches } = useQuery<CoachProfileWithUser[]>({
    queryKey: ["coaches-list"],
    queryFn: async () => {
      const res = await fetch("/api/coaches");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: studios } = useQuery<StudioWithRooms[]>({
    queryKey: ["studios-list"],
    queryFn: async () => {
      const res = await fetch("/api/studios");
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editingClass) {
      setMode("single");
      const start = new Date(editingClass.startsAt);
      const end = new Date(editingClass.endsAt);
      const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
      setFormData({
        classTypeId: editingClass.classType.id,
        coachProfileId: editingClass.coach.id,
        roomId: editingClass.room?.id ?? "",
        date: format(start, "yyyy-MM-dd"),
        dateFrom: "",
        dateTo: "",
        days: [],
        time: format(start, "HH:mm"),
        duration: durationMin,
        tag: editingClass.tag ?? "",
        songRequestsEnabled: editingClass.songRequestsEnabled ?? false,
        songRequestCriteria: editingClass.songRequestCriteria?.length
          ? editingClass.songRequestCriteria
          : ["ALL"],
      });
    } else {
      setMode("single");
      setFormData({
        ...emptyForm,
        date: defaultDate ?? "",
        time: defaultTime ?? "",
      });
    }
  }, [open, editingClass, defaultDate, defaultTime]);

  const availableRooms = studios?.flatMap((s) =>
    s.rooms
      .filter((r) => !formData.classTypeId || r.classTypes.some((ct) => ct.id === formData.classTypeId))
      .map((r) => ({ ...r, studioName: s.name })),
  ) ?? [];

  // Preview class count for recurring mode
  const previewCount = useMemo(() => {
    if (mode !== "recurring" || !formData.dateFrom || !formData.dateTo || formData.days.length === 0) return 0;

    const dateFnsDayMap: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 };
    const startDate = startOfDay(new Date(formData.dateFrom));
    const endDate = startOfDay(new Date(formData.dateTo));

    if (isAfter(startDate, endDate)) return 0;

    let count = 0;
    for (const dayIndex of formData.days) {
      const dateFnsDay = dateFnsDayMap[dayIndex];
      if (dateFnsDay === undefined) continue;
      let current = setDay(startDate, dateFnsDay, { weekStartsOn: 1 });
      if (isBefore(current, startDate)) current = addWeeks(current, 1);
      while (!isAfter(current, endDate)) {
        count++;
        current = addWeeks(current, 1);
      }
    }
    return count;
  }, [mode, formData.dateFrom, formData.dateTo, formData.days]);

  const saveSingleMutation = useMutation({
    mutationFn: async () => {
      const startsAt = new Date(`${formData.date}T${formData.time}`);
      const endsAt = addMinutes(startsAt, formData.duration);
      const payload = {
        classTypeId: formData.classTypeId,
        coachId: formData.coachProfileId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        roomId: formData.roomId,
        tag: formData.tag || null,
        songRequestsEnabled: formData.songRequestsEnabled,
        songRequestCriteria: formData.songRequestsEnabled ? formData.songRequestCriteria : [],
      };
      const url = editingClass ? `/api/classes/${editingClass.id}` : "/api/classes";
      const method = editingClass ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      onOpenChange(false);
      toast.success(editingClass ? "Clase actualizada" : "Clase creada");
      onSaved?.();
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo guardar"),
  });

  const saveBulkMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        classTypeId: formData.classTypeId,
        coachId: formData.coachProfileId,
        roomId: formData.roomId,
        time: formData.time,
        duration: formData.duration,
        days: formData.days,
        dateFrom: formData.dateFrom,
        dateTo: formData.dateTo,
        tag: formData.tag || null,
        songRequestsEnabled: formData.songRequestsEnabled,
        songRequestCriteria: formData.songRequestsEnabled ? formData.songRequestCriteria : [],
      };
      const res = await fetch("/api/classes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["admin-schedule"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      onOpenChange(false);
      toast.success(`${data.count} clases creadas`);
      onSaved?.();
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo crear la serie"),
  });

  const isPending = saveSingleMutation.isPending || saveBulkMutation.isPending;

  const isFormValid = useMemo(() => {
    const base = formData.classTypeId && formData.coachProfileId && formData.roomId && formData.time;
    if (mode === "single") return base && formData.date;
    return base && formData.dateFrom && formData.dateTo && formData.days.length > 0;
  }, [formData, mode]);

  function handleSave() {
    if (mode === "single") saveSingleMutation.mutate();
    else saveBulkMutation.mutate();
  }

  function toggleDay(dayIndex: number) {
    setFormData((prev) => ({
      ...prev,
      days: prev.days.includes(dayIndex)
        ? prev.days.filter((d) => d !== dayIndex)
        : [...prev.days, dayIndex].sort(),
    }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingClass ? "Editar clase" : "Programar clases"}</DialogTitle>
          <DialogDescription>
            {editingClass ? "Modifica los datos de la clase" : "Crea una clase o programa una serie recurrente"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Mode selector - only for create */}
          {!editingClass && (
            <div className="flex gap-1 rounded-xl bg-surface p-1">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all ${
                  mode === "single"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Clase única
              </button>
              <button
                type="button"
                onClick={() => setMode("recurring")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all ${
                  mode === "recurring"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                Serie recurrente
              </button>
            </div>
          )}

          {/* Class type + Coach */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Tipo de clase</label>
              <Select
                value={formData.classTypeId}
                onValueChange={(v) => setFormData({ ...formData, classTypeId: v, roomId: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {classTypes?.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Coach</label>
              <Select
                value={formData.coachProfileId}
                onValueChange={(v) => setFormData({ ...formData, coachProfileId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {coaches?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Room */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Sala</label>
            <Select
              value={formData.roomId}
              onValueChange={(v) => setFormData({ ...formData, roomId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar sala" />
              </SelectTrigger>
              <SelectContent>
                {availableRooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.studioName} — {r.name} ({r.maxCapacity} lugares)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Schedule section */}
          {mode === "single" ? (
            /* Single: date + time + duration */
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Fecha</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Hora</label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Duración (min)</label>
                <Input
                  type="number"
                  min={15}
                  max={120}
                  step={5}
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 50 })}
                />
              </div>
            </div>
          ) : (
            /* Recurring: days selector + date range + time + duration */
            <div className="space-y-3">
              {/* Day-of-week selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Días de la semana</label>
                <div className="flex gap-1.5">
                  {DAY_LABELS.map((day) => (
                    <button
                      key={day.index}
                      type="button"
                      onClick={() => toggleDay(day.index)}
                      title={day.full}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                        formData.days.includes(day.index)
                          ? "bg-admin text-white shadow-sm"
                          : "bg-surface text-muted hover:bg-surface/80 hover:text-foreground"
                      }`}
                    >
                      {day.short}
                    </button>
                  ))}
                </div>
                {formData.days.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted">
                    {formData.days.map((d) => DAY_LABELS[d].full).join(", ")}
                  </p>
                )}
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Desde</label>
                  <Input
                    type="date"
                    value={formData.dateFrom}
                    onChange={(e) => setFormData({ ...formData, dateFrom: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Hasta</label>
                  <Input
                    type="date"
                    value={formData.dateTo}
                    onChange={(e) => setFormData({ ...formData, dateTo: e.target.value })}
                  />
                </div>
              </div>

              {/* Time + Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Hora</label>
                  <Input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Duración (min)</label>
                  <Input
                    type="number"
                    min={15}
                    max={120}
                    step={5}
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 50 })}
                  />
                </div>
              </div>

              {/* Preview */}
              {previewCount > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-admin/5 px-3 py-2">
                  <CalendarRange className="h-4 w-4 text-admin" />
                  <span className="text-sm font-medium text-admin">
                    Se crearán {previewCount} clases
                  </span>
                  <span className="text-xs text-muted">
                    ({formData.days.map((d) => DAY_LABELS[d].short).join(", ")} · {formData.dateFrom} → {formData.dateTo})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tag */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Tag especial <span className="font-normal">(opcional)</span>
            </label>
            <Input
              placeholder="Ej: Halloween Special, Black Friday..."
              value={formData.tag}
              onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
            />
          </div>

          {/* Song requests */}
          <div className="space-y-3 rounded-md border border-border/50 bg-surface/20 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="songRequestsEnabled"
                checked={formData.songRequestsEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, songRequestsEnabled: checked === true })
                }
              />
              <Music className="h-3.5 w-3.5 text-muted" />
              <Label htmlFor="songRequestsEnabled" className="text-sm font-normal">
                Permitir sugerencias de canciones
              </Label>
            </div>
            {formData.songRequestsEnabled && (
              <div className="space-y-2 pl-6">
                <p className="text-xs text-muted">¿Quién puede sugerir?</p>
                {SONG_CRITERIA_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`songCriteria-${opt.value}`}
                      checked={formData.songRequestCriteria.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        const current = new Set(formData.songRequestCriteria);
                        if (opt.value === "ALL") {
                          setFormData({ ...formData, songRequestCriteria: checked === true ? ["ALL"] : [] });
                        } else {
                          current.delete("ALL");
                          if (checked === true) current.add(opt.value);
                          else current.delete(opt.value);
                          setFormData({ ...formData, songRequestCriteria: Array.from(current) });
                        }
                      }}
                    />
                    <Label htmlFor={`songCriteria-${opt.value}`} className="text-[13px] font-normal text-foreground">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(saveSingleMutation.isError || saveBulkMutation.isError) && (
            <p className="text-sm text-destructive">
              {saveSingleMutation.error?.message || saveBulkMutation.error?.message || "Error al guardar"}
            </p>
          )}

          <Separator />

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending || !isFormValid}
              className="gap-2 bg-admin hover:bg-admin/90"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingClass
                ? "Guardar cambios"
                : mode === "single"
                  ? "Crear clase"
                  : `Crear ${previewCount || ""} clases`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
