"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Building2, Users } from "lucide-react";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  _count: {
    memberships: number;
    classes: number;
    bookings: number;
  };
}

export default function TenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTenants();
  }, []);

  async function fetchTenants() {
    const res = await fetch("/api/super-admin/tenants");
    const data = await res.json();
    setTenants(data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");

    const res = await fetch("/api/super-admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Error al crear tenant");
      setCreating(false);
      return;
    }

    setForm({ name: "", slug: "" });
    setOpen(false);
    setCreating(false);
    fetchTenants();
  }

  function autoSlug(name: string) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Tenants
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading ? "Cargando..." : `${tenants.length} tenant${tenants.length !== 1 ? "s" : ""} registrados`}
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700">
              <Plus className="h-4 w-4" />
              Crear Tenant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo Tenant</DialogTitle>
              <DialogDescription>
                Crea un nuevo studio en la plataforma
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Nombre
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm({ name, slug: autoSlug(name) });
                  }}
                  placeholder="Mi Studio"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Slug
                </label>
                <Input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="mi-studio"
                  required
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {form.slug && `${form.slug}.reserva.fit`}
                </p>
              </div>
              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={creating}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {creating ? "Creando..." : "Crear"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-6 space-y-3">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border border-gray-100">
                <CardContent className="flex items-center gap-4 p-5">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </CardContent>
              </Card>
            ))
          : tenants.map((tenant) => (
              <Card
                key={tenant.id}
                className="cursor-pointer border border-gray-100 transition-shadow hover:shadow-md"
                onClick={() => router.push(`/tenants/${tenant.id}`)}
              >
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {tenant.name}
                      </p>
                      <Badge
                        variant={tenant.isActive ? "success" : "danger"}
                        className="text-[10px]"
                      >
                        {tenant.isActive ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">{tenant.slug}.reserva.fit</p>
                  </div>
                  <div className="hidden items-center gap-6 text-sm text-gray-500 sm:flex">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      <span>{tenant._count.memberships}</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      {tenant._count.classes} clases &middot; {tenant._count.bookings} reservas
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>
    </div>
  );
}
