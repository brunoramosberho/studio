"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Filter,
  CalendarDays,
  Users,
  Pencil,
  XCircle,
  Loader2,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatTime, formatDate } from "@/lib/utils";
import type { ClassWithDetails, ClassType, CoachProfileWithUser } from "@/types";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminClassesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [formData, setFormData] = useState({
    classTypeId: "",
    coachProfileId: "",
    roomId: "",
    date: "",
    time: "",
    recurring: false,
    tag: "",
  });

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
      const res = await fetch("/api/classes?types=true");
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

  interface StudioWithRooms {
    id: string;
    name: string;
    rooms: { id: string; name: string; maxCapacity: number; classTypeId: string }[];
  }

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
      .filter((r) => !formData.classTypeId || r.classTypeId === formData.classTypeId)
      .map((r) => ({ ...r, studioName: s.name })),
  ) ?? [];

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
      setDialogOpen(false);
      setFormData({ classTypeId: "", coachProfileId: "", roomId: "", date: "", time: "", recurring: false, tag: "" });
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-classes"] }),
  });

  const filtered = classes
    ?.filter((c) => statusFilter === "all" || c.status === statusFilter)
    .filter(
      (c) =>
        !searchQuery ||
        c.classType.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.coach.user.name?.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());

  const statusBadge = (status: string) => {
    switch (status) {
      case "SCHEDULED":
        return <Badge variant="success">Programada</Badge>;
      case "CANCELLED":
        return <Badge variant="danger">Cancelada</Badge>;
      case "COMPLETED":
        return <Badge variant="secondary">Completada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Clases</h1>
          <p className="mt-1 text-muted">Gestiona todas las clases del estudio</p>
        </motion.div>

        <Button
          onClick={() => setDialogOpen(true)}
          className="gap-2 bg-admin hover:bg-admin/90"
        >
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
            placeholder="Buscar por tipo o coach..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="SCHEDULED">Programadas</SelectItem>
            <SelectItem value="COMPLETED">Completadas</SelectItem>
            <SelectItem value="CANCELLED">Canceladas</SelectItem>
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
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
          {filtered.map((cls) => {
            const enrolled = cls._count?.bookings ?? cls.bookings.length;
            return (
              <motion.div key={cls.id} variants={fadeUp}>
                <Card className="transition-shadow hover:shadow-warm">
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                    <div
                      className="hidden h-12 w-1 shrink-0 rounded-full sm:block"
                      style={{ backgroundColor: cls.classType.color || "#1A2C4E" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-display text-base font-bold">
                          {cls.classType.name}
                        </p>
                        {cls.tag && (
                          <Badge variant="outline" className="text-[10px]">
                            {cls.tag}
                          </Badge>
                        )}
                        {statusBadge(cls.status)}
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        {format(new Date(cls.startsAt), "EEE d MMM", { locale: es })} ·{" "}
                        {formatTime(cls.startsAt)} – {formatTime(cls.endsAt)} ·{" "}
                        {cls.coach.user.name}
                        {cls.room?.studio && (
                          <span className="text-muted/60"> · {cls.room.studio.name} — {cls.room.name}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-sm text-muted">
                        <Users className="h-4 w-4" />
                        <span className="font-mono">
                          {enrolled}/{cls.room?.maxCapacity ?? "?"}
                        </span>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                      {cls.status === "SCHEDULED" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-destructive hover:text-destructive"
                          onClick={() => cancelMutation.mutate(cls.id)}
                          disabled={cancelMutation.isPending}
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

      {/* Create class dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nueva clase</DialogTitle>
            <DialogDescription>
              Programa una nueva clase para el estudio
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Tipo de clase</label>
              <Select
                value={formData.classTypeId}
                onValueChange={(v) => setFormData({ ...formData, classTypeId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  {classTypes?.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>
                      {ct.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Coach</label>
              <Select
                value={formData.coachProfileId}
                onValueChange={(v) => setFormData({ ...formData, coachProfileId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar coach" />
                </SelectTrigger>
                <SelectContent>
                  {coaches?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Sala</label>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Fecha</label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Hora</label>
                <Input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">
                Tag especial <span className="text-muted font-normal">(opcional)</span>
              </label>
              <Input
                placeholder="Ej: Halloween Special, Black Friday..."
                value={formData.tag}
                onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.recurring}
                onChange={(e) =>
                  setFormData({ ...formData, recurring: e.target.checked })
                }
                className="rounded border-input-border"
              />
              Repetir semanalmente
            </label>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="gap-2 bg-admin hover:bg-admin/90"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear clase
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
