"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import {
  RoomLayoutEditor,
  createEmptyLayout,
  type RoomLayout,
} from "@/components/admin/room-layout-editor";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface City {
  id: string;
  name: string;
  country: { id: string; name: string; code: string };
}

interface RoomData {
  id: string;
  name: string;
  maxCapacity: number;
  classTypes: { id: string; name: string }[];
  layout: RoomLayout | null;
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

  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [cityForm, setCityForm] = useState({ countryId: "", name: "" });

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<(RoomData & { studioId: string }) | null>(null);
  const [roomForStudio, setRoomForStudio] = useState<string>("");
  const [roomForm, setRoomForm] = useState({ name: "", classTypeIds: [] as string[], maxCapacity: "", layout: createEmptyLayout() as RoomLayout });
  const [useLayout, setUseLayout] = useState(true);

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
      const res = await fetch("/api/class-types");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const allCities = locations?.flatMap((c) =>
    c.cities.map((city) => ({ ...city, country: c })),
  ) ?? [];

  const createCityMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryId: cityForm.countryId, name: cityForm.name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo crear la ciudad");
      }
      return res.json() as Promise<City>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      setCityDialogOpen(false);
      setCityForm({ countryId: "", name: "" });
      setStudioForm((f) => ({ ...f, cityId: created.id }));
      toast.success(`Ciudad creada: ${created.name}`);
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo crear la ciudad"),
  });

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
      toast.success("Estudio creado");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo crear el estudio"),
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
      toast.success("Estudio actualizado");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo actualizar el estudio"),
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
      toast.success("Estudio eliminado");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo eliminar el estudio"),
  });

  // Room mutations
  const createRoomMut = useMutation({
    mutationFn: async () => {
      const capacity = useLayout && roomForm.layout.spots.length > 0
        ? roomForm.layout.spots.length
        : parseInt(roomForm.maxCapacity, 10) || 0;
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomForm.name,
          classTypeIds: roomForm.classTypeIds,
          maxCapacity: capacity,
          layout: useLayout && roomForm.layout.spots.length > 0 ? roomForm.layout : null,
          studioId: roomForStudio,
        }),
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
      setRoomForm({ name: "", classTypeIds: [], maxCapacity: "", layout: createEmptyLayout() });
      setRoomForStudio("");
      toast.success("Sala creada");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo crear la sala"),
  });

  const updateRoomMut = useMutation({
    mutationFn: async () => {
      if (!editingRoom) return;
      const capacity = useLayout && roomForm.layout.spots.length > 0
        ? roomForm.layout.spots.length
        : parseInt(roomForm.maxCapacity, 10) || 0;
      const res = await fetch(`/api/rooms/${editingRoom.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: roomForm.name,
          classTypeIds: roomForm.classTypeIds,
          maxCapacity: capacity,
          layout: useLayout && roomForm.layout.spots.length > 0 ? roomForm.layout : null,
        }),
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
      setRoomForm({ name: "", classTypeIds: [], maxCapacity: "", layout: createEmptyLayout() });
      toast.success("Sala actualizada");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo actualizar la sala"),
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
      toast.success("Sala eliminada");
    },
    onError: (err: Error) => toast.error(err.message || "No se pudo eliminar la sala"),
  });

  const studiosByCity = useMemo(() => {
    const list = studios ?? [];
    const map = new Map<string, { city: City; studios: StudioData[] }>();
    for (const s of list) {
      const existing = map.get(s.cityId);
      if (existing) existing.studios.push(s);
      else map.set(s.cityId, { city: s.city, studios: [s] });
    }
    return Array.from(map.values()).sort((a, b) => {
      const c = a.city.country.name.localeCompare(b.city.country.name);
      if (c !== 0) return c;
      return a.city.name.localeCompare(b.city.name);
    });
  }, [studios]);

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
    setRoomForm({ name: "", classTypeIds: [], maxCapacity: "", layout: createEmptyLayout() });
    setUseLayout(true);
    setRoomDialogOpen(true);
  }

  function openEditRoom(room: RoomData, studioId: string) {
    setEditingRoom({ ...room, studioId });
    setRoomForStudio(studioId);
    const hasLayout = room.layout && room.layout.spots.length > 0;
    setUseLayout(!!hasLayout);
    setRoomForm({
      name: room.name,
      classTypeIds: room.classTypes.map((ct) => ct.id),
      maxCapacity: String(room.maxCapacity),
      layout: room.layout ?? createEmptyLayout(),
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
          {studiosByCity.map(({ city, studios }) => (
            <div key={city.id} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <MapPin className="h-4 w-4 text-muted" />
                <p className="text-sm font-semibold text-foreground">
                  {countryFlag(city.country.code)} {city.name}
                </p>
                <p className="text-sm text-muted">{city.country.name}</p>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {studios.length} estudio{studios.length !== 1 ? "s" : ""}
                </Badge>
              </div>

              {studios.map((studio) => {
                const isExpanded = expandedStudio === studio.id;
                const disciplinesForRoom = (room: RoomData) =>
                  room.classTypes.map((ct) => ct.name).join(", ") || "—";

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
                                {studio.address ? studio.address : "Sin dirección"}
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
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-foreground">{room.name}</p>
                                        {room.layout && (
                                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600">
                                            Layout
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted">
                                        {disciplinesForRoom(room)} · {room.maxCapacity} spots
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
          ))}
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
              <div className="pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-xs text-muted hover:text-foreground"
                  onClick={() => {
                    const selected = allCities.find((c) => c.id === studioForm.cityId);
                    const defaultCountryId = selected?.country.id ?? locations?.[0]?.id ?? "";
                    setCityForm({ countryId: defaultCountryId, name: "" });
                    setCityDialogOpen(true);
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Dar de alta nueva ciudad
                </Button>
              </div>
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

      {/* City dialog */}
      <Dialog open={cityDialogOpen} onOpenChange={(open) => { setCityDialogOpen(open); if (!open) createCityMut.reset(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva ciudad</DialogTitle>
            <DialogDescription>
              Esto se usa para organizar estudios por ubicación. Normalmente se configura una sola vez.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">País</label>
              <Select
                value={cityForm.countryId}
                onValueChange={(val) => setCityForm((f) => ({ ...f, countryId: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar país" />
                </SelectTrigger>
                <SelectContent>
                  {(locations ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {countryFlag(c.code)} {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted">Nombre</label>
              <Input
                placeholder="Ej: Monterrey"
                value={cityForm.name}
                onChange={(e) => setCityForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setCityDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-admin text-white hover:bg-admin/90"
                disabled={!cityForm.countryId || !cityForm.name.trim() || createCityMut.isPending}
                onClick={() => createCityMut.mutate()}
              >
                {createCityMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Crear ciudad
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Room dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRoom ? "Editar Sala" : "Nueva Sala"}</DialogTitle>
            <DialogDescription>
              {editingRoom
                ? "Modifica los datos y el layout de la sala"
                : "Configura la sala y diseña la distribución de lugares"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted">Nombre</label>
                <Input
                  placeholder="Ej: Sala Reformer 1"
                  value={roomForm.name}
                  onChange={(e) => setRoomForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted">Disciplinas</label>
                <div className="rounded-lg border border-border bg-white p-2 space-y-1 max-h-40 overflow-y-auto">
                  {classTypes?.length ? classTypes.map((ct) => (
                    <label
                      key={ct.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-surface/70"
                    >
                      <input
                        type="checkbox"
                        checked={roomForm.classTypeIds.includes(ct.id)}
                        onChange={(e) => {
                          setRoomForm((f) => ({
                            ...f,
                            classTypeIds: e.target.checked
                              ? [...f.classTypeIds, ct.id]
                              : f.classTypeIds.filter((id) => id !== ct.id),
                          }));
                        }}
                        className="h-4 w-4 rounded border-border text-admin accent-admin"
                      />
                      {ct.name}
                    </label>
                  )) : (
                    <p className="px-2 py-1 text-xs text-muted">No hay disciplinas</p>
                  )}
                </div>
                {roomForm.classTypeIds.length > 0 && (
                  <p className="text-[11px] text-muted">
                    {roomForm.classTypeIds.length} seleccionada{roomForm.classTypeIds.length !== 1 && "s"}
                  </p>
                )}
              </div>
            </div>

            {/* Layout mode toggle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted">
                  Distribución de la sala
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUseLayout(false)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      !useLayout ? "bg-admin/10 text-admin" : "text-muted hover:text-foreground",
                    )}
                  >
                    Solo capacidad
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseLayout(true)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      useLayout ? "bg-admin/10 text-admin" : "text-muted hover:text-foreground",
                    )}
                  >
                    Con layout
                  </button>
                </div>
              </div>

              {useLayout ? (
                <div className="space-y-2">
                  {roomForm.layout.spots.length > 0 && (
                    <span className="rounded-full bg-admin/10 px-2.5 py-0.5 text-[11px] font-semibold text-admin tabular-nums">
                      {roomForm.layout.spots.length} lugares
                      {!roomForm.layout.coachPosition && " · sin posición de coach"}
                    </span>
                  )}
                  <p className="text-[11px] text-muted">
                    Haz clic en las celdas para colocar lugares y la posición del coach. El lugar del coach no se puede reservar.
                  </p>
                  <RoomLayoutEditor
                    value={roomForm.layout}
                    onChange={(layout) =>
                      setRoomForm((f) => ({
                        ...f,
                        layout,
                        maxCapacity: String(layout.spots.length || f.maxCapacity),
                      }))
                    }
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted">Lugares máximos</label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="Ej: 20"
                    value={roomForm.maxCapacity}
                    onChange={(e) => setRoomForm((f) => ({ ...f, maxCapacity: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted">
                    Sin distribución visual. Los clientes reservan lugar sin seleccionar posición.
                  </p>
                </div>
              )}
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
                  !roomForm.name ||
                  roomForm.classTypeIds.length === 0 ||
                  (useLayout ? roomForm.layout.spots.length === 0 : !roomForm.maxCapacity) ||
                  roomSubmitting
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
