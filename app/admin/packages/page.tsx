"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Package,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Loader2,
} from "lucide-react";
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
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import type { Package as PackageType } from "@/types";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminPackagesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    credits: "",
    validDays: "",
  });

  const { data: packages, isLoading } = useQuery<PackageType[]>({
    queryKey: ["admin-packages"],
    queryFn: async () => {
      const res = await fetch("/api/packages");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-packages"] }),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        credits: parseInt(formData.credits),
        validDays: parseInt(formData.validDays),
      };
      const url = editingId ? `/api/packages/${editingId}` : "/api/packages";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-packages"] });
      closeDialog();
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "", description: "", price: "", credits: "", validDays: "" });
    setDialogOpen(true);
  };

  const openEdit = (pkg: PackageType) => {
    setEditingId(pkg.id);
    setFormData({
      name: pkg.name,
      description: pkg.description || "",
      price: String(pkg.price),
      credits: String(pkg.credits),
      validDays: String(pkg.validDays),
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setFormData({ name: "", description: "", price: "", credits: "", validDays: "" });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-display text-2xl font-bold sm:text-3xl">Paquetes</h1>
          <p className="mt-1 text-muted">Gestiona los paquetes de clases</p>
        </motion.div>

        <Button onClick={openCreate} className="gap-2 bg-admin hover:bg-admin/90">
          <Plus className="h-4 w-4" />
          Nuevo paquete
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : !packages?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Package className="h-10 w-10 text-muted/30" />
            <p className="font-medium text-muted">No hay paquetes creados</p>
          </CardContent>
        </Card>
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
          {packages.map((pkg) => (
            <motion.div key={pkg.id} variants={fadeUp}>
              <Card className={!pkg.isActive ? "opacity-60" : undefined}>
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-bold">{pkg.name}</h3>
                      <Badge variant={pkg.isActive ? "success" : "secondary"}>
                        {pkg.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    {pkg.description && (
                      <p className="mt-1 text-sm text-muted">{pkg.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
                      <span>
                        <strong className="font-mono text-foreground">
                          {formatCurrency(pkg.price)}
                        </strong>
                      </span>
                      <span>
                        <strong className="font-mono text-foreground">{pkg.credits}</strong>{" "}
                        créditos
                      </span>
                      <span>
                        <strong className="font-mono text-foreground">{pkg.validDays}</strong>{" "}
                        días
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() =>
                        toggleMutation.mutate({ id: pkg.id, isActive: !pkg.isActive })
                      }
                      disabled={toggleMutation.isPending}
                    >
                      {pkg.isActive ? (
                        <ToggleRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted" />
                      )}
                      {pkg.isActive ? "Desactivar" : "Activar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => openEdit(pkg)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar paquete" : "Nuevo paquete"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Modifica los detalles del paquete"
                : "Crea un nuevo paquete de clases"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Nombre</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Paquete 10 clases"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium">Descripción</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción breve..."
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Precio (EUR)</label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Créditos</label>
                <Input
                  type="number"
                  value={formData.credits}
                  onChange={(e) => setFormData({ ...formData, credits: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Días validez</label>
                <Input
                  type="number"
                  value={formData.validDays}
                  onChange={(e) => setFormData({ ...formData, validDays: e.target.value })}
                  placeholder="30"
                />
              </div>
            </div>

            <Separator />

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="gap-2 bg-admin hover:bg-admin/90"
              >
                {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Guardar" : "Crear"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
