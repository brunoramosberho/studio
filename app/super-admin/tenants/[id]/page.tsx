"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ExternalLink,
  Users,
  CalendarCheck,
  BookOpen,
  Package,
  Power,
  Save,
  Trash2,
  GraduationCap,
} from "lucide-react";

interface TenantDetail {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  tagline: string;
  slogan: string;
  logoUrl: string | null;
  fontPairing: string;
  colorBg: string;
  colorFg: string;
  colorSurface: string;
  colorAccent: string;
  colorAccentSoft: string;
  colorMuted: string;
  colorBorder: string;
  colorHeroBg: string;
  colorCoach: string;
  colorAdmin: string;
  createdAt: string;
  _count: {
    memberships: number;
    classes: number;
    bookings: number;
    userPackages: number;
  };
  stats: {
    bookingsThisMonth: number;
    totalRevenue: number;
  };
}

const COLOR_FIELDS = [
  { key: "colorBg", label: "Fondo" },
  { key: "colorFg", label: "Texto" },
  { key: "colorSurface", label: "Superficie" },
  { key: "colorAccent", label: "Acento" },
  { key: "colorAccentSoft", label: "Acento suave" },
  { key: "colorMuted", label: "Muted" },
  { key: "colorBorder", label: "Borde" },
  { key: "colorHeroBg", label: "Hero BG" },
  { key: "colorCoach", label: "Coach" },
  { key: "colorAdmin", label: "Admin" },
] as const;

export default function TenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [form, setForm] = useState({ name: "", slug: "" });
  const [colors, setColors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savingColors, setSavingColors] = useState(false);
  const [savedColors, setSavedColors] = useState(false);
  const [nukeConfirm, setNukeConfirm] = useState("");
  const [nuking, setNuking] = useState(false);
  const [graduating, setGraduating] = useState(false);

  useEffect(() => {
    fetch(`/api/super-admin/tenants/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setTenant(data);
        setForm({ name: data.name, slug: data.slug });
        const c: Record<string, string> = {};
        for (const cf of COLOR_FIELDS) c[cf.key] = data[cf.key] ?? "";
        setColors(c);
      });
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/super-admin/tenants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const updated = await res.json();
      setTenant((prev) => (prev ? { ...prev, ...updated } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  async function handleSaveColors() {
    setSavingColors(true);
    const res = await fetch(`/api/super-admin/tenants/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(colors),
    });
    if (res.ok) {
      const updated = await res.json();
      setTenant((prev) => (prev ? { ...prev, ...updated } : prev));
      setSavedColors(true);
      setTimeout(() => setSavedColors(false), 2000);
    }
    setSavingColors(false);
  }

  async function toggleActive() {
    if (!tenant) return;
    const res = await fetch(`/api/super-admin/tenants/${id}`, {
      method: tenant.isActive ? "DELETE" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !tenant.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTenant((prev) => (prev ? { ...prev, isActive: updated.isActive } : prev));
    }
  }

  async function handleImpersonate() {
    if (!tenant) return;
    const res = await fetch("/api/super-admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantSlug: tenant.slug }),
    });
    if (res.ok) {
      const { url } = await res.json();
      window.open(url, "_blank");
    }
  }

  async function handleNuke() {
    if (!tenant || nukeConfirm !== tenant.slug) return;
    setNuking(true);
    const res = await fetch(`/api/super-admin/tenants/${id}/nuke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmSlug: nukeConfirm }),
    });
    if (res.ok) {
      router.push("/tenants");
    } else {
      const data = await res.json();
      alert(data.error || "Error al eliminar");
      setNuking(false);
    }
  }

  async function handleGraduate() {
    if (!tenant) return;
    setGraduating(true);
    const res = await fetch("/api/super-admin/onboarding/graduate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: id }),
    });
    if (res.ok) {
      const result = await res.json();
      alert(
        `Limpiado: ${result.demoUsersDeleted} usuarios demo, ${result.classesDeleted} clases, ${result.feedEventsDeleted} eventos. Config preservada.`,
      );
      // Refresh tenant data
      const r = await fetch(`/api/super-admin/tenants/${id}`);
      const data = await r.json();
      setTenant(data);
    } else {
      const data = await res.json();
      alert(data.error || "Error al graduar");
    }
    setGraduating(false);
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const statCards = [
    { label: "Miembros", value: tenant._count.memberships, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "Clases", value: tenant._count.classes, icon: BookOpen, color: "text-emerald-600 bg-emerald-50" },
    { label: "Reservas", value: tenant._count.bookings, icon: CalendarCheck, color: "text-amber-600 bg-amber-50" },
    { label: "Paquetes vendidos", value: tenant._count.userPackages, icon: Package, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/tenants")}
          className="shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {tenant.name}
            </h1>
            <Badge
              variant={tenant.isActive ? "success" : "danger"}
              className="text-[10px]"
            >
              {tenant.isActive ? "Activo" : "Inactivo"}
            </Badge>
          </div>
          <p className="text-sm text-gray-500">{tenant.slug}.mgic.app</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleActive}
            className="gap-1.5"
          >
            <Power className="h-3.5 w-3.5" />
            {tenant.isActive ? "Desactivar" : "Activar"}
          </Button>
          <Button
            size="sm"
            onClick={handleImpersonate}
            className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Impersonar
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="border border-gray-100">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.color}`}>
                <s.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className="text-xl font-bold text-gray-900">
                  {s.value.toLocaleString("es-MX")}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit form */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="text-base">Información básica</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Nombre
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                  required
                  pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {form.slug}.mgic.app
                </p>
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                size="sm"
              >
                <Save className="h-3.5 w-3.5" />
                {saved ? "Guardado" : saving ? "Guardando..." : "Guardar cambios"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Branding colors */}
        <Card className="border border-gray-100">
          <CardHeader>
            <CardTitle className="text-base">Branding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <p className="mb-2 text-xs font-medium text-gray-500">
                  Colores
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {COLOR_FIELDS.map((cf) => (
                    <label key={cf.key} className="flex items-center gap-2">
                      <input
                        type="color"
                        value={colors[cf.key] || "#000000"}
                        onChange={(e) =>
                          setColors((prev) => ({ ...prev, [cf.key]: e.target.value }))
                        }
                        className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-gray-200 bg-transparent p-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] text-gray-500">
                          {cf.label}
                        </p>
                        <input
                          type="text"
                          value={colors[cf.key] || ""}
                          onChange={(e) =>
                            setColors((prev) => ({ ...prev, [cf.key]: e.target.value }))
                          }
                          className="w-full rounded border border-transparent bg-transparent font-mono text-[10px] text-gray-600 transition-colors hover:border-gray-200 focus:border-gray-300 focus:outline-none"
                          spellCheck={false}
                        />
                      </div>
                    </label>
                  ))}
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveColors}
                  disabled={savingColors}
                  className="mt-3 gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                >
                  <Save className="h-3.5 w-3.5" />
                  {savedColors ? "Guardado" : savingColors ? "Guardando..." : "Guardar colores"}
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">Tipografía</p>
                  <p className="text-sm text-gray-900">{tenant.fontPairing}</p>
                </div>
                {tenant.logoUrl && (
                  <div>
                    <p className="text-xs font-medium text-gray-500">Logo</p>
                    <img
                      src={tenant.logoUrl}
                      alt="Logo"
                      className="mt-1 h-8 object-contain"
                    />
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <p className="text-xs font-medium text-gray-500">Tagline</p>
                <p className="text-sm text-gray-900">{tenant.tagline}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500">Slogan</p>
                <p className="text-sm text-gray-900">{tenant.slogan}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Danger zone */}
      <Card className="border border-red-200 bg-red-50/30">
        <CardHeader>
          <CardTitle className="text-base text-red-700">Zona peligrosa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Graduate */}
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-card p-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Graduar a producción</p>
              <p className="text-xs text-gray-500">
                Elimina usuarios demo, clases y feed. Preserva config, disciplinas, paquetes y salas.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGraduate}
              disabled={graduating}
              className="shrink-0 gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <GraduationCap className="h-3.5 w-3.5" />
              {graduating ? "Limpiando..." : "Graduar"}
            </Button>
          </div>

          {/* Nuke */}
          <div className="rounded-lg border border-red-200 bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700">Eliminar permanentemente</p>
                <p className="text-xs text-gray-500">
                  Borra el tenant y TODOS sus datos. No se puede deshacer.
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Input
                placeholder={`Escribe "${tenant.slug}" para confirmar`}
                value={nukeConfirm}
                onChange={(e) => setNukeConfirm(e.target.value)}
                className="flex-1 text-sm"
              />
              <Button
                variant="destructive"
                size="sm"
                onClick={handleNuke}
                disabled={nuking || nukeConfirm !== tenant.slug}
                className="shrink-0 gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {nuking ? "Eliminando..." : "Eliminar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
