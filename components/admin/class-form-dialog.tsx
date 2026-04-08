"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMinutes, format } from "date-fns";
import { Loader2, Music } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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

interface ClassFormData {
  classTypeId: string;
  coachProfileId: string;
  roomId: string;
  date: string;
  time: string;
  duration: number;
  recurring: boolean;
  tag: string;
  songRequestsEnabled: boolean;
  songRequestCriteria: string[];
}

const emptyForm: ClassFormData = {
  classTypeId: "",
  coachProfileId: "",
  roomId: "",
  date: "",
  time: "",
  duration: 50,
  recurring: false,
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
      const start = new Date(editingClass.startsAt);
      const end = new Date(editingClass.endsAt);
      const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
      setFormData({
        classTypeId: editingClass.classType.id,
        coachProfileId: editingClass.coach.id,
        roomId: editingClass.room?.id ?? "",
        date: format(start, "yyyy-MM-dd"),
        time: format(start, "HH:mm"),
        duration: durationMin,
        recurring: editingClass.isRecurring,
        tag: editingClass.tag ?? "",
        songRequestsEnabled: editingClass.songRequestsEnabled ?? false,
        songRequestCriteria: editingClass.songRequestCriteria?.length
          ? editingClass.songRequestCriteria
          : ["ALL"],
      });
    } else {
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

  const saveMutation = useMutation({
    mutationFn: async () => {
      const startsAt = new Date(`${formData.date}T${formData.time}`);
      const endsAt = addMinutes(startsAt, formData.duration);
      const payload = {
        classTypeId: formData.classTypeId,
        coachId: formData.coachProfileId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        roomId: formData.roomId,
        isRecurring: formData.recurring,
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

  const isFormValid = formData.classTypeId && formData.coachProfileId && formData.roomId && formData.date && formData.time;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editingClass ? "Editar clase" : "Crear nueva clase"}</DialogTitle>
          <DialogDescription>
            {editingClass ? "Modifica los datos de la clase" : "Programa una nueva clase para el estudio"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
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

          {!editingClass && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="recurring"
                checked={formData.recurring}
                onCheckedChange={(checked) => setFormData({ ...formData, recurring: checked === true })}
              />
              <Label htmlFor="recurring" className="text-sm font-normal">
                Repetir semanalmente
              </Label>
            </div>
          )}

          {saveMutation.isError && (
            <p className="text-sm text-destructive">
              {saveMutation.error?.message || "Error al guardar la clase"}
            </p>
          )}

          <Separator />

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !isFormValid}
              className="gap-2 bg-admin hover:bg-admin/90"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingClass ? "Guardar cambios" : "Crear clase"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
