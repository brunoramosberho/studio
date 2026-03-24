"use client";

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Save,
  Upload,
  X,
  Check,
  Type,
  Palette,
  Image as ImageIcon,
  FileText,
  Loader2,
  Smartphone,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type StudioBranding, DEFAULTS, FONT_PAIRINGS } from "@/lib/branding";
import { useBranding, applyTheme } from "@/components/branding-provider";

const colorFields: { key: keyof StudioBranding; label: string }[] = [
  { key: "colorBg", label: "Fondo" },
  { key: "colorFg", label: "Texto" },
  { key: "colorSurface", label: "Superficie" },
  { key: "colorAccent", label: "Acento" },
  { key: "colorAccentSoft", label: "Acento suave" },
  { key: "colorMuted", label: "Texto secundario" },
  { key: "colorBorder", label: "Bordes" },
  { key: "colorCoach", label: "Portal Coach" },
  { key: "colorAdmin", label: "Portal Admin" },
];

export default function BrandingPage() {
  const brandingCtx = useBranding();
  const [settings, setSettings] = useState<StudioBranding>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const appIconInputRef = useRef<HTMLInputElement>(null);
  const coachIconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (data: StudioBranding) => {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      brandingCtx.update(data);
    },
  });

  function update(key: keyof StudioBranding, value: string | null) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function readAsDataUrl(file: File, key: keyof StudioBranding) {
    const reader = new FileReader();
    reader.onload = () => update(key, reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "logos");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      update("logoUrl", url);
    } catch {
      readAsDataUrl(file, "logoUrl");
    }
  }

  async function handleAppIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bucket", "icons");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      update("appIconUrl", url);
    } catch {
      readAsDataUrl(file, "appIconUrl");
    }
  }

  function handleCoachIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.name.endsWith(".svg")) return;
    const reader = new FileReader();
    reader.onload = () => {
      let svg = reader.result as string;
      svg = svg
        .replace(/<svg([^>]*)>/, (_match, attrs: string) => {
          let cleaned = attrs
            .replace(/\s*width="[^"]*"/g, "")
            .replace(/\s*height="[^"]*"/g, "");
          return `<svg${cleaned} width="100%" height="100%">`;
        })
        .replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"')
        .replace(/stroke="(?!none)[^"]*"/g, 'stroke="currentColor"')
        .replace(/style="[^"]*"/g, "");
      update("coachIconSvg", svg);
    };
    reader.readAsText(file);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold sm:text-3xl">Marca</h1>
            <p className="mt-1 text-sm text-muted">
              Personaliza la identidad visual de tu estudio
            </p>
          </div>
          <Button
            onClick={() => saveMutation.mutate(settings)}
            disabled={saveMutation.isPending}
            className="gap-2 bg-admin text-white hover:bg-admin/90"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? "Guardado" : saveMutation.isError ? "Error al guardar" : "Guardar cambios"}
          </Button>
        </div>
      </motion.div>

      {saveMutation.isError && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {saveMutation.error?.message || "No se pudieron guardar los cambios. Verifica que tengas permisos de admin."}
        </div>
      )}

      {/* Identity */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-admin" />
              Identidad
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Nombre del estudio</label>
                <input
                  type="text"
                  value={settings.studioName}
                  onChange={(e) => update("studioName", e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-admin/20"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Tagline</label>
                <input
                  type="text"
                  value={settings.tagline}
                  onChange={(e) => update("tagline", e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-admin/20"
                  placeholder="Pilates & Wellness"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted">Slogan</label>
                <input
                  type="text"
                  value={settings.slogan}
                  onChange={(e) => update("slogan", e.target.value)}
                  className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-admin/20"
                  placeholder="Muévete. Respira. Floréce."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted">Descripción SEO</label>
                <textarea
                  value={settings.metaDescription}
                  onChange={(e) => update("metaDescription", e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-admin/20"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logo */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ImageIcon className="h-4 w-4 text-admin" />
              Logo
            </div>

            <div className="flex items-center gap-6">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-border bg-surface">
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="h-full w-full object-contain p-2" />
                ) : (
                  <span className="font-display text-2xl font-bold text-muted/30">
                    {settings.studioName.charAt(0)}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Subir logo
                </Button>
                {settings.logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update("logoUrl", null)}
                    className="gap-2 text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                )}
                <p className="text-xs text-muted">PNG, SVG o JPG. Se recomienda fondo transparente.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* App Icon */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Smartphone className="h-4 w-4 text-admin" />
              Ícono de App
            </div>

            <div className="flex items-center gap-6">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[18px] border-2 border-dashed border-border bg-surface shadow-sm">
                {settings.appIconUrl ? (
                  <img src={settings.appIconUrl} alt="App Icon" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-2xl font-bold text-muted/30">
                    {settings.studioName.charAt(0)}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <input
                  ref={appIconInputRef}
                  type="file"
                  accept="image/png,image/jpg,image/jpeg"
                  onChange={handleAppIconUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => appIconInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Subir ícono
                </Button>
                {settings.appIconUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update("appIconUrl", null)}
                    className="gap-2 text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                )}
                <p className="text-xs text-muted">
                  PNG cuadrado, mínimo 512×512px. Aparece al instalar como app.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-surface/50 p-4">
              <p className="mb-2 text-xs font-medium text-muted">Vista previa</p>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div
                    className="mx-auto h-[60px] w-[60px] overflow-hidden rounded-[14px] shadow-md"
                    style={{ backgroundColor: settings.colorBg }}
                  >
                    {settings.appIconUrl ? (
                      <img src={settings.appIconUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="font-display text-xl font-bold" style={{ color: settings.colorAccent }}>
                          {settings.studioName.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-[10px] font-medium text-foreground">{settings.studioName}</p>
                  <p className="text-[9px] text-muted">iPhone</p>
                </div>
                <div className="text-center">
                  <div
                    className="mx-auto h-[48px] w-[48px] overflow-hidden rounded-full shadow-md"
                    style={{ backgroundColor: settings.colorBg }}
                  >
                    {settings.appIconUrl ? (
                      <img src={settings.appIconUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="font-display text-lg font-bold" style={{ color: settings.colorAccent }}>
                          {settings.studioName.charAt(0)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-1.5 text-[10px] font-medium text-foreground">{settings.studioName}</p>
                  <p className="text-[9px] text-muted">Android</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Coach Icon */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.13 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <ImageIcon className="h-4 w-4 text-admin" />
              Ícono de Coach (Mapa de clase)
            </div>

            <div className="flex items-center gap-6">
              <div
                className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border"
                style={{ color: settings.colorAccent }}
              >
                {settings.coachIconSvg ? (
                  <div
                    className="h-6 w-6 [&>svg]:h-full [&>svg]:w-full"
                    dangerouslySetInnerHTML={{ __html: settings.coachIconSvg }}
                  />
                ) : (
                  <span className="text-xs font-medium text-muted/40">SVG</span>
                )}
              </div>

              <div className="space-y-2">
                <input
                  ref={coachIconInputRef}
                  type="file"
                  accept=".svg"
                  onChange={handleCoachIconUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => coachIconInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Subir SVG
                </Button>
                {settings.coachIconSvg && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => update("coachIconSvg", null)}
                    className="gap-2 text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                    Eliminar
                  </Button>
                )}
                <p className="text-xs text-muted">
                  SVG monocromático. Se usa en el lugar del coach dentro del mapa de clase. Toma el color automáticamente.
                </p>
              </div>
            </div>

            {settings.coachIconSvg && (
              <div className="mt-4 rounded-xl border border-border bg-surface/50 p-4">
                <p className="mb-3 text-xs font-medium text-muted">Vista previa en mapa</p>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-full"
                    style={{ backgroundColor: `${settings.colorAccent}20`, color: settings.colorAccent }}
                  >
                    <div
                      className="h-4 w-4 [&>svg]:h-full [&>svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: settings.coachIconSvg }}
                    />
                  </div>
                  <span className="text-xs text-muted">Así se verá en el mapa de clase</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Fonts */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Type className="h-4 w-4 text-admin" />
              Tipografía
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {FONT_PAIRINGS.map((fp) => (
                <button
                  key={fp.id}
                  onClick={() => update("fontPairing", fp.id)}
                  className={cn(
                    "rounded-xl border-2 p-4 text-left transition-all",
                    settings.fontPairing === fp.id
                      ? "border-admin bg-admin/5"
                      : "border-border hover:border-admin/30",
                  )}
                >
                  <p
                    className="text-lg font-bold leading-tight"
                    style={{ fontFamily: `${fp.displayVar}` }}
                  >
                    {fp.displayFont}
                  </p>
                  <p
                    className="mt-1 text-sm text-muted"
                    style={{ fontFamily: `${fp.bodyVar}` }}
                  >
                    {fp.bodyFont} — Texto de ejemplo para ver cómo se ve
                  </p>
                  {settings.fontPairing === fp.id && (
                    <div className="mt-2 flex items-center gap-1 text-xs font-medium text-admin">
                      <Check className="h-3 w-3" />
                      Seleccionada
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Colors */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card>
          <CardContent className="p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Palette className="h-4 w-4 text-admin" />
              Colores
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {colorFields.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <label className="relative">
                    <input
                      type="color"
                      value={settings[key] as string}
                      onChange={(e) => update(key, e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    <div
                      className="h-10 w-10 shrink-0 rounded-xl border border-border shadow-sm transition-transform hover:scale-105"
                      style={{ backgroundColor: settings[key] as string }}
                    />
                  </label>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="font-mono text-xs text-muted">{(settings[key] as string).toUpperCase()}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-border p-4">
              <p className="mb-2 text-xs font-medium text-muted">Vista previa</p>
              <div
                className="overflow-hidden rounded-lg p-6"
                style={{ backgroundColor: settings.colorBg, color: settings.colorFg }}
              >
                <h3 className="font-display text-xl font-bold">{settings.studioName} Studio</h3>
                <p className="mt-1 text-sm" style={{ color: settings.colorMuted }}>
                  {settings.tagline}
                </p>
                <div className="mt-3 flex gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: settings.colorAccent }}
                  >
                    Acento
                  </span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-medium"
                    style={{ backgroundColor: settings.colorAccentSoft, color: settings.colorFg }}
                  >
                    Acento suave
                  </span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-medium"
                    style={{ backgroundColor: settings.colorSurface, color: settings.colorMuted }}
                  >
                    Superficie
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: settings.colorCoach }}
                  >
                    Coach
                  </span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: settings.colorAdmin }}
                  >
                    Admin
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
