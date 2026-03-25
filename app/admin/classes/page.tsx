"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  CalendarDays,
  Users,
  Pencil,
  XCircle,
  Loader2,
  Search,
  Clock,
  MapPin,
} from "lucide-react";
import { format, isPast, addMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn, formatTime } from "@/lib/utils";
import type { ClassWithDetails, ClassType, CoachProfileWithUser } from "@/types";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

interface StudioWithRooms {
  id: string;
  name: string;
  rooms: { id: string; name: string; maxCapacity: number; classTypes: { id: string; name: string }[] }[];
}

interface ClassFormData {
  classTypeId: string;
  coachProfileId: string;
  roomId: string;
  date: string;
  time: string;
  duration: number;
  recurring: boolean;
  tag: string;
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
};

export default function AdminClassesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassWithDetails | null>(null);
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);
  const [statusFilter, setStatusFilter] = useState<string>("upcoming");
  const [searchQuery, setSearchQuery] = useState("");
  const [cancelTarget, setCancelTarget] = useState<ClassWithDetails | null>(null);

  const { data: classes, isLoading } = useQuery<ClassWithDetails[]>({
    queryKey: ["admin-classes"],
    queryFn: async () => {
      const res = await fetch("/api/classes");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

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

  const availableRooms = studios?.flatMap((s) =>
    s.rooms
      .filter((r) => !formData.classTypeId || r.classTypes.some((ct) => ct.id === formData.classTypeId))
      .map((r) => ({ ...r, studioName: s.name })),
  ) ?? [];

  function openCreateDialog() {
    setEditingClass(null);
    setFormData(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(cls: ClassWithDetails) {
    setEditingClass(cls);
    const start = new Date(cls.startsAt);
    const end = new Date(cls.endsAt);
    const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
    setFormData({
      classTypeId: cls.classType.id,
      coachProfileId: cls.coach.id,
      roomId: cls.room?.id ?? "",
      date: format(start, "yyyy-MM-dd"),
      time: format(start, "HH:mm"),
      duration: durationMin,
      recurring: cls.isRecurring,
      tag: cls.tag ?? "",
    });
    setDialogOpen(true);
  }

  function buildPayload() {
    const startsAt = new Date(`${formData.date}T${formData.time}`);
    const endsAt = addMinutes(startsAt, formData.duration);
    return {
      classTypeId: formData.classTypeId,
      coachId: formData.coachProfileId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      roomId: formData.roomId,
      isRecurring: formData.recurring,
      tag: formData.tag || null,
    };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
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
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setDialogOpen(false);
      setEditingClass(null);
      setFormData(emptyForm);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (classId: string) => {
      const res = await fetch(`/api/classes/${classId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      setCancelTarget(null);
    },
  });

  const filtered = classes
    ?.filter((c) => {
      if (statusFilter === "upcoming") return c.status === "SCHEDULED" && !isPast(new Date(c.endsAt));
      if (statusFilter === "past") return c.status !== "CANCELLED" && isPast(new Date(c.endsAt));
      if (statusFilter === "CANCELLED") return c.status === "CANCELLED";
      return true;
    })
    .filter(
      (c) =>
        !searchQuery ||
        c.classType.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.coach.user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.tag?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => {
      if (statusFilter === "past") return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });

  const upcomingCount = classes?.filter((c) => c.status === "SCHEDULED" && !isPast(new Date(c.endsAt))).length ?? 0;

  const isFormValid = formData.classTypeId && formData.coachProfileId && formData.roomId && formData.date && formData.time;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Clases</h1>
          <p className="mt-1 text-sm text-muted">
            {upcomingCount} clase{upcomingCount !== 1 ? "s" : ""} programada{upcomingCount !== 1 ? "s" : ""}
          </p>
        </motion.div>

        <Button onClick={openCreateDialog} className="gap-2 bg-admin hover:bg-admin/90">
          <Plus className="h-4 w-4" />
          Crear clase
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-10"
            placeholder="Buscar por tipo, coach o tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">Próximas</SelectItem>
            <SelectItem value="past">Pasadas</SelectItem>
            <SelectItem value="CANCELLED">Canceladas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Classes list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : !filtered?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <CalendarDays className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">No se encontraron clases</p>
            {statusFilter === "upcoming" && (
              <Button onClick={openCreateDialog} variant="outline" size="sm" className="mt-2 gap-2">
                <Plus className="h-3.5 w-3.5" />
                Crear primera clase
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
          {filtered.map((cls) => {
            const enrolled = cls._count?.bookings ?? 0;
            const maxCap = cls.room?.maxCapacity ?? 0;
            const past = isPast(new Date(cls.endsAt));
            const isCancelled = cls.status === "CANCELLED";

            return (
              <motion.div key={cls.id} variants={fadeUp}>
                <Card className={cn(
                  "transition-shadow",
                  !past && !isCancelled && "hover:shadow-warm",
                  (past || isCancelled) && "opacity-60",
                )}>
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div
                      className="hidden h-12 w-1 shrink-0 rounded-full sm:block"
                      style={{ backgroundColor: cls.classType.color || "#1A2C4E" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-display text-base font-bold">
                          {cls.classType.name}
                        </p>
                        {cls.tag && (
                          <Badge variant="outline" className="text-[10px]">
                            {cls.tag}
                          </Badge>
                        )}
                        {isCancelled && <Badge variant="danger">Cancelada</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span className="flex items-center gap-1 capitalize">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {format(new Date(cls.startsAt), "EEE d MMM", { locale: es })}
                        </span>
                        <span className="flex items-center gap-1 font-mono text-foreground">
                          <Clock className="h-3.5 w-3.5 text-muted" />
                          {formatTime(cls.startsAt)} – {formatTime(cls.endsAt)}
                        </span>
                        <span>{cls.coach.user.name}</span>
                        {cls.room?.studio && (
                          <span className="flex items-center gap-1 text-muted/70">
                            <MapPin className="h-3 w-3" />
                            {cls.room.studio.name} · {cls.room.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm",
                        enrolled >= maxCap ? "bg-red-50 text-red-600" : "bg-surface text-muted",
                      )}>
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-mono text-[13px]">
                          {enrolled}/{maxCap}
                        </span>
                      </div>
                      {!isCancelled && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => openEditDialog(cls)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Editar</span>
                        </Button>
                      )}
                      {cls.status === "SCHEDULED" && !past && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => setCancelTarget(cls)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Cancelar</span>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Create / Edit class dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingClass(null); }}>
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
                      <SelectItem key={c.id} value={c.id}>{c.user.name}</SelectItem>
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

            {!editingClass && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={formData.recurring}
                  onChange={(e) => setFormData({ ...formData, recurring: e.target.checked })}
                  className="rounded border-input-border"
                />
                Repetir semanalmente
              </label>
            )}

            {saveMutation.isError && (
              <p className="text-sm text-destructive">
                {saveMutation.error?.message || "Error al guardar la clase"}
              </p>
            )}

            <Separator />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
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
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar clase</DialogTitle>
            <DialogDescription>
              ¿Estás seguro de cancelar{" "}
              <span className="font-medium text-foreground">
                {cancelTarget?.classType.name}
              </span>{" "}
              del{" "}
              <span className="font-medium text-foreground">
                {cancelTarget && format(new Date(cancelTarget.startsAt), "EEE d MMM", { locale: es })}
              </span>
              ? Los alumnos inscritos serán notificados y sus créditos devueltos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar cancelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
