"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Building2,
  DoorOpen,
  Pencil,
  Trash2,
  Loader2,
  MapPin,
  Users,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

interface City {
  id: string;
  name: string;
  country: { id: string; name: string; code: string };
}

interface RoomData {
  id: string;
  name: string;
  maxCapacity: number;
  classTypeId: string;
}

interface StudioData {
  id: string;
  name: string;
  address: string | null;
  cityId: string;
  city: City;
  rooms: RoomData[];
}

interface ClassType {
  id: string;
  name: string;
}

interface LocCountry {
  id: string;
  name: string;
  code: string;
  cities: { id: string; name: string }[];
}

function countryFlag(code: string) {
  return code
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminStudiosPage() {
  const queryClient = useQueryClient();

  const [studioDialogOpen, setStudioDialogOpen] = useState(false);
  const [editingStudio, setEditingStudio] = useState<StudioData | null>(null);
  const [studioForm, setStudioForm] = useState({ name: "", address: "", cityId: "" });

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<(RoomData & { studioId: string }) | null>(null);
  const [roomForStudio, setRoomForStudio] = useState<string>("");
  const [roomForm, setRoomForm] = useState({ name: "", classTypeId: "", maxCapacity: "" });

  const [expandedStudio, setExpandedStudio] = useState<string | null>(null);

  const { data: studios, isLoading } = useQuery<StudioData[]>({
    queryKey: ["admin-studios"],
    queryFn: async () => {
      const res = await fetch("/api/studios");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const { data: locations } = useQuery<LocCountry[]>({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await fetch("/api/locations");
      if (!res.ok) return [];
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

  const allCities = locations?.flatMap((c) =>
    c.cities.map((city) => ({ ...city, country: c })),
  ) ?? [];

  // Studio mutations
  const createStudioMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studioForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
      setStudioDialogOpen(false);
      setStudioForm({ name: "", address: "", cityId: "" });
    },
  });

  const updateStudioMut = useMutation({
    mutationFn: async () => {
      if (!editingStudio) return;
      const res = await fetch(`/api/studios/${editingStudio.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studioForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
      setStudioDialogOpen(false);
      setEditingStudio(null);
      setStudioForm({ name: "", address: "", cityId: "" });
    },
  });

  const deleteStudioMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/studios/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
    },
  });

  // Room mutations
  const createRoomMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...roomForm, studioId: roomForStudio }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
      setRoomDialogOpen(false);
      setRoomForm({ name: "", classTypeId: "", maxCapacity: "" });
      setRoomForStudio("");
    },
  });

  const updateRoomMut = useMutation({
    mutationFn: async () => {
      if (!editingRoom) return;
      const res = await fetch(`/api/rooms/${editingRoom.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roomForm),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
      setRoomDialogOpen(false);
      setEditingRoom(null);
      setRoomForm({ name: "", classTypeId: "", maxCapacity: "" });
    },
  });

  const deleteRoomMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/rooms/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-studios"] });
    },
  });

  function openCreateStudio() {
    setEditingStudio(null);
    setStudioForm({ name: "", address: "", cityId: "" });
    setStudioDialogOpen(true);
  }

  function openEditStudio(studio: StudioData) {
    setEditingStudio(studio);
    setStudioForm({ name: studio.name, address: studio.address ?? "", cityId: studio.cityId });
    setStudioDialogOpen(true);
  }

  function openCreateRoom(studioId: string) {
    setEditingRoom(null);
    setRoomForStudio(studioId);
    setRoomForm({ name: "", classTypeId: "", maxCapacity: "" });
    setRoomDialogOpen(true);
  }

  function openEditRoom(room: RoomData, studioId: string) {
    setEditingRoom({ ...room, studioId });
    setRoomForStudio(studioId);
    setRoomForm({
      name: room.name,
      classTypeId: room.classTypeId,
      maxCapacity: String(room.maxCapacity),
    });
    setRoomDialogOpen(true);
  }

  function handleStudioSubmit() {
    if (editingStudio) updateStudioMut.mutate();
    else createStudioMut.mutate();
  }

  function handleRoomSubmit() {
    if (editingRoom) updateRoomMut.mutate();
    else createRoomMut.mutate();
  }

  const studioSubmitting = createStudioMut.isPending || updateStudioMut.isPending;
  const roomSubmitting = createRoomMut.isPending || updateRoomMut.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Estudios y Salas</h1>
          <p className="mt-1 text-sm text-muted">
            Administra tus estudios, ubicaciones y salas
          </p>
        </div>
        <Button
          onClick={openCreateStudio}
          className="gap-2 bg-admin text-white hover:bg-admin/90"
        >
          <Plus className="h-4 w-4" />
          Nuevo Estudio
        </Button>
      </div>

      {/* Studios list */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : !studios?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted/30" />
            <p className="mt-4 font-display text-lg font-semibold text-foreground">
              No hay estudios
            </p>
            <p className="mt-1 text-sm text-muted">
              Crea tu primer estudio para empezar
            </p>
            <Button
              onClick={openCreateStudio}
              className="mt-6 gap-2 bg-admin text-white hover:bg-admin/90"
            >
              <Plus className="h-4 w-4" />
              Crear Estudio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {studios.map((studio) => {
            const isExpanded = expandedStudio === studio.id;
            const classTypeForRoom = (ctId: string) =>
              classTypes?.find((ct) => ct.id === ctId)?.name ?? "—";

            return (
              <motion.div key={studio.id} variants={fadeUp} initial="hidden" animate="show">
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    {/* Studio header */}
                    <div
                      className="flex cursor-pointer items-center gap-4 p-5 transition-colors hover:bg-surface/50"
                      onClick={() => setExpandedStudio(isExpanded ? null : studio.id)}
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-admin/10">
                        <Building2 className="h-5 w-5 text-admin" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-base font-bold text-foreground">
                            {studio.name}
                          </h3>
                          <Badge variant="secondary" className="text-[10px]">
                            {studio.rooms.length} {studio.rooms.length === 1 ? "sala" : "salas"}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <MapPin className="h-3 w-3" />
                          <span>
                            {countryFlag(studio.city.country.code)} {studio.city.name}
                            {studio.address && ` · ${studio.address}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEditStudio(studio); }}
                          className="rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm("¿Eliminar este estudio?")) deleteStudioMut.mutate(studio.id);
                          }}
                          className="rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-muted" />
                          : <ChevronRight className="h-4 w-4 text-muted" />
                        }
                      </div>
                    </div>

                    {/* Rooms (expanded) */}
                    {isExpanded && (
                      <div className="border-t border-border/50 bg-surface/30">
                        {studio.rooms.length === 0 ? (
                          <div className="flex flex-col items-center py-8">
                            <DoorOpen className="h-8 w-8 text-muted/30" />
                            <p className="mt-2 text-sm text-muted">Sin salas aún</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-border/30">
                            {studio.rooms.map((room) => (
                              <div
                                key={room.id}
                                className="flex items-center gap-4 px-5 py-3"
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white">
                                  <DoorOpen className="h-4 w-4 text-muted" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground">{room.name}</p>
                                  <p className="text-xs text-muted">
                                    {classTypeForRoom(room.classTypeId)} · {room.maxCapacity} spots
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px] gap-1">
                                    <Users className="h-2.5 w-2.5" />
                                    {room.maxCapacity}
                                  </Badge>
                                  <button
                                    onClick={() => openEditRoom(room, studio.id)}
                                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white hover:text-foreground"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm("¿Eliminar esta sala?")) deleteRoomMut.mutate(room.id);
                                    }}
                                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="px-5 py-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full gap-2 text-xs"
                            onClick={() => openCreateRoom(studio.id)}
                          >
                            <Plus className="h-3 w-3" />
                            Agregar Sala
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Error messages */}
      {deleteStudioMut.isError && (
        <p className="text-sm text-red-600">{(deleteStudioMut.error as Error).message}</p>
      )}
      {deleteRoomMut.isError && (
        <p className="text-sm text-red-600">{(deleteRoomMut.error as Error).message}</p>
      )}

      {/* Studio dialog */}
      <Dialog open={studioDialogOpen} onOpenChange={setStudioDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingStudio ? "Editar Estudio" : "Nuevo Estudio"}</DialogTitle>
            <DialogDescription>
              {editingStudio
                ? "Modifica los datos del estudio"
                : "Ingresa los datos del nuevo estudio"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Nombre</label>
              <Input
                placeholder="Ej: Flō Polanco"
                value={studioForm.name}
                onChange={(e) => setStudioForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Ciudad</label>
              <Select
                value={studioForm.cityId}
                onValueChange={(val) => setStudioForm((f) => ({ ...f, cityId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar ciudad" />
                </SelectTrigger>
                <SelectContent>
                  {allCities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {countryFlag(city.country.code)} {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Dirección (opcional)</label>
              <Input
                placeholder="Ej: Av. Presidente Masaryk 123"
                value={studioForm.address}
                onChange={(e) => setStudioForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStudioDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-admin text-white hover:bg-admin/90"
                disabled={!studioForm.name || !studioForm.cityId || studioSubmitting}
                onClick={handleStudioSubmit}
              >
                {studioSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingStudio ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRoom ? "Editar Sala" : "Nueva Sala"}</DialogTitle>
            <DialogDescription>
              {editingRoom
                ? "Modifica los datos de la sala"
                : "Agrega una nueva sala al estudio"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Nombre</label>
              <Input
                placeholder="Ej: Sala Reformer 1"
                value={roomForm.name}
                onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Disciplina</label>
              <Select
                value={roomForm.classTypeId}
                onValueChange={(val) => setRoomForm((f) => ({ ...f, classTypeId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar disciplina" />
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

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Capacidad máxima</label>
              <Input
                type="number"
                min={1}
                placeholder="Ej: 12"
                value={roomForm.maxCapacity}
                onChange={(e) => setRoomForm((f) => ({ ...f, maxCapacity: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setRoomDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-admin text-white hover:bg-admin/90"
                disabled={
                  !roomForm.name || !roomForm.classTypeId || !roomForm.maxCapacity || roomSubmitting
                }
                onClick={handleRoomSubmit}
              >
                {roomSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingRoom ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
