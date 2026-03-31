"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  Dumbbell,
  AlertTriangle,
} from "lucide-react";
import { IconPicker, getIconComponent } from "@/components/admin/icon-picker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const LEVEL_LABELS: Record<string, string> = {
  ALL: "Todos los niveles",
  BEGINNER: "Principiante",
  INTERMEDIATE: "Intermedio",
  ADVANCED: "Avanzado",
};

const PRESET_COLORS = [
  "#1A2C4E", "#C9A96E", "#8B5E3C", "#2D6A4F", "#6B21A8",
  "#0369A1", "#B91C1C", "#D97706", "#059669", "#DB2777",
  "#4338CA", "#475569",
];

interface ClassTypeData {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  level: string;
  color: string;
  icon: string | null;
  mediaUrl: string | null;
  tags: string[];
  _count: { classes: number; rooms: number };
}

interface FormData {
  name: string;
  description: string;
  duration: number;
  level: string;
  color: string;
  icon: string | null;
  mediaUrl: string;
  tags: string[];
}

const emptyForm: FormData = {
  name: "",
  description: "",
  duration: 50,
  level: "ALL",
  color: PRESET_COLORS[0],
  icon: null,
  mediaUrl: "",
  tags: [],
};

export default function AdminClassTypesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClassTypeData | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<ClassTypeData | null>(null);
  const [tagInput, setTagInput] = useState("");

  const { data: classTypes, isLoading } = useQuery<ClassTypeData[]>({
    queryKey: ["admin", "class-types"],
    queryFn: async () => {
      const res = await fetch("/api/class-types");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  function openCreate() {
    setEditing(null);
    setFormData(emptyForm);
    setTagInput("");
    setDialogOpen(true);
  }

  function openEdit(ct: ClassTypeData) {
    setEditing(ct);
    setFormData({
      name: ct.name,
      description: ct.description ?? "",
      duration: ct.duration,
      level: ct.level,
      color: ct.color,
      icon: ct.icon,
      mediaUrl: ct.mediaUrl ?? "",
      tags: ct.tags ?? [],
    });
    setTagInput("");
    setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const url = editing ? `/api/class-types/${editing.id}` : "/api/class-types";
      const method = editing ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al guardar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "class-types"] });
      queryClient.invalidateQueries({ queryKey: ["class-types"] });
      setDialogOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/class-types/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al eliminar");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "class-types"] });
      queryClient.invalidateQueries({ queryKey: ["class-types"] });
      setDeleteTarget(null);
    },
  });

  const isFormValid = formData.name.trim() && formData.duration > 0 && formData.color;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Disciplinas</h1>
          <p className="mt-1 text-sm text-muted">
            Tipos de clase disponibles en el estudio
          </p>
        </motion.div>

        <Button onClick={openCreate} className="gap-2 bg-admin hover:bg-admin/90">
          <Plus className="h-4 w-4" />
          Nueva disciplina
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : !classTypes?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Dumbbell className="h-10 w-10 text-muted/30" />
            <div>
              <p className="font-medium text-muted">No hay disciplinas configuradas</p>
              <p className="mt-1 text-sm text-muted/70">
                Crea tu primera disciplina para poder programar clases
              </p>
            </div>
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-2 gap-2">
              <Plus className="h-3.5 w-3.5" />
              Crear disciplina
            </Button>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="show"
          className="grid gap-3 sm:grid-cols-2"
        >
          {classTypes.map((ct) => (
            <motion.div key={ct.id} variants={fadeUp}>
              <Card className="group transition-shadow hover:shadow-warm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: ct.color }}
                      >
                        {(() => {
                          const Icon = ct.icon ? getIconComponent(ct.icon) : null;
                          return Icon ? <Icon className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />;
                        })()}
                      </div>
                      <div>
                        <p className="font-display text-base font-bold">{ct.name}</p>
                        {ct.description && (
                          <p className="mt-0.5 text-xs text-muted line-clamp-1">
                            {ct.description}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEdit(ct)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(ct)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Clock className="h-3 w-3" />
                      {ct.duration} min
                    </Badge>
                    <Badge variant="outline">{LEVEL_LABELS[ct.level] ?? ct.level}</Badge>
                    {ct._count.classes > 0 && (
                      <span className="text-xs text-muted">
                        {ct._count.classes} clase{ct._count.classes !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {ct.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {ct.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ backgroundColor: `${ct.color}12`, color: ct.color }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditing(null); saveMutation.reset(); } }}>
        <DialogContent className="max-h-[min(90vh,820px)] overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar disciplina" : "Nueva disciplina"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Modifica los datos de la disciplina"
                : "Define un nuevo tipo de clase para el estudio"}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Básico</TabsTrigger>
              <TabsTrigger value="style">Estilo</TabsTrigger>
              <TabsTrigger value="content">Contenido</TabsTrigger>
            </TabsList>

            <div className="mt-3 max-h-[min(58vh,520px)] overflow-y-auto pr-1">
              <TabsContent value="basic" className="m-0">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-muted">Nombre</label>
                    <Input
                      placeholder="Ej: Reformer, Mat Flow, Barre..."
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-muted">
                      Descripción <span className="font-normal">(opcional)</span>
                    </label>
                    <Textarea
                      placeholder="Breve descripción de la clase"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Duración (min)</label>
                    <Input
                      type="number"
                      min={15}
                      max={180}
                      step={5}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 50 })}
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Nivel</label>
                    <Select value={formData.level} onValueChange={(v) => setFormData({ ...formData, level: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Todos los niveles</SelectItem>
                        <SelectItem value="BEGINNER">Principiante</SelectItem>
                        <SelectItem value="INTERMEDIATE">Intermedio</SelectItem>
                        <SelectItem value="ADVANCED">Avanzado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="style" className="m-0">
                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted">Color</label>
                      <div className="grid grid-cols-10 gap-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFormData({ ...formData, color: c })}
                            className={cn(
                              "h-7 w-7 rounded-full transition-all",
                              formData.color === c
                                ? "ring-2 ring-admin ring-offset-2"
                                : "hover:scale-105",
                            )}
                            style={{ backgroundColor: c }}
                            aria-label={`Color ${c}`}
                          />
                        ))}
                      </div>
                      <Input
                        className="mt-2"
                        placeholder="#hex color"
                        value={formData.color}
                        onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted">Icono</label>
                      <div className="rounded-md border border-border bg-surface/20 p-3">
                        <IconPicker
                          value={formData.icon}
                          onChange={(icon) => setFormData({ ...formData, icon })}
                          accentColor={formData.color}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="hidden lg:block">
                    <div className="rounded-md border border-border bg-white p-4 shadow-sm">
                      <p className="text-xs font-medium text-muted">Preview</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-md text-white"
                          style={{ backgroundColor: formData.color }}
                        >
                          {(() => {
                            const Icon = formData.icon ? getIconComponent(formData.icon) : null;
                            return Icon ? <Icon className="h-6 w-6" /> : <Dumbbell className="h-6 w-6" />;
                          })()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-display text-base font-bold">
                            {formData.name?.trim() ? formData.name : "Nombre de disciplina"}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {LEVEL_LABELS[formData.level] ?? formData.level} · {formData.duration} min
                          </p>
                        </div>
                      </div>
                      {formData.description?.trim() ? (
                        <p className="mt-3 text-sm text-muted line-clamp-3">{formData.description}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="content" className="m-0">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-muted">
                      Video o imagen <span className="font-normal">(URL, opcional)</span>
                    </label>
                    <Input
                      placeholder="https://cdn.example.com/video.mp4"
                      value={formData.mediaUrl}
                      onChange={(e) => setFormData({ ...formData, mediaUrl: e.target.value })}
                    />
                    <p className="mt-1 text-[11px] text-muted">Se muestra al tocar la disciplina en el feed</p>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-xs font-medium text-muted">
                      Tags <span className="font-normal">(Enter para agregar)</span>
                    </label>
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {formData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                          style={{ borderColor: `${formData.color}30`, color: formData.color, backgroundColor: `${formData.color}08` }}
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, tags: formData.tags.filter((t) => t !== tag) })}
                            className="ml-0.5 hover:opacity-60"
                            aria-label={`Quitar ${tag}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <Input
                      placeholder="Ej: HIIT, Cardio, Fuerza..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = tagInput.trim();
                          if (val && !formData.tags.includes(val)) {
                            setFormData({ ...formData, tags: [...formData.tags, val] });
                          }
                          setTagInput("");
                        }
                      }}
                    />
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          {saveMutation.isError && (
            <p className="mt-3 text-sm text-destructive">
              {saveMutation.error?.message || "Error al guardar"}
            </p>
          )}

          <Separator className="my-3" />

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !isFormValid}
              className="gap-2 bg-admin hover:bg-admin/90"
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Guardar" : "Crear disciplina"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); deleteMutation.reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Eliminar disciplina
            </DialogTitle>
            <DialogDescription>
              ¿Estás seguro de eliminar{" "}
              <span className="font-medium text-foreground">{deleteTarget?.name}</span>?
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError && (
            <p className="text-sm text-destructive">
              {deleteMutation.error?.message || "Error al eliminar"}
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
