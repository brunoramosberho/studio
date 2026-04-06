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
  Globe,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type StudioBranding, DEFAULTS, FONT_PAIRINGS, deriveAccentSoft, withDerivedColors } from "@/lib/branding";
import { useBranding, applyTheme } from "@/components/branding-provider";

const colorFields: { key: keyof StudioBranding; label: string; hint: string }[] = [
  { key: "colorAccent", label: "Color de marca", hint: "Botones, links y elementos destacados" },
  { key: "colorHeroBg", label: "Fondo Landing", hint: "Secciones oscuras de tu landing page" },
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
      .then((data) => setSettings(withDerivedColors({ ...DEFAULTS, ...data })))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (data: StudioBranding) => {
      const derived = withDerivedColors(data);
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(derived),
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
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "colorAccent" && typeof value === "string") {
        next.colorAccentSoft = deriveAccentSoft(value);
      }
      return next;
    });
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
                <Input
                  value={settings.studioName}
                  onChange={(e) => update("studioName", e.target.value)}
                  className="font-medium"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">Tagline</label>
                <Input
                  value={settings.tagline}
                  onChange={(e) => update("tagline", e.target.value)}
                  placeholder="Pilates & Wellness"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted">Slogan</label>
                <Input
                  value={settings.slogan}
                  onChange={(e) => update("slogan", e.target.value)}
                  placeholder="Muévete. Respira. Floréce."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted">Descripción SEO</label>
                <Textarea
                  value={settings.metaDescription}
                  onChange={(e) => update("metaDescription", e.target.value)}
                  rows={2}
                  className="min-h-0 resize-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted">Home Headline</label>
                <Input
                  value={settings.communityHeadline}
                  onChange={(e) => update("communityHeadline", e.target.value)}
                  placeholder="Tu comunidad en movimiento"
                />
                <p className="mt-1.5 text-[11px] text-muted">
                  Aparece debajo del "Hola, nombre" en el home de tus miembros.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  <Globe className="mr-1 inline h-3 w-3" />
                  Landing page
                </label>
                <Input
                  value={settings.landingUrl ?? ""}
                  onChange={(e) => update("landingUrl", e.target.value || null)}
                  placeholder="https://tusitio.com"
                />
                <p className="mt-1.5 text-[11px] text-muted">
                  Si tienes tu propia página web, ponla aquí. El logo del navbar redirigirá a esa URL. Deja vacío para usar la landing integrada.
                </p>
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

            <div className="mt-4 rounded-md border border-border bg-surface/50 p-4">
              <p className="mb-2 text-xs font-medium text-muted">Vista previa</p>
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div
                    className="mx-auto h-[60px] w-[60px] overflow-hidden rounded-md shadow-md"
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
                    className="mx-auto h-[48px] w-[48px] overflow-hidden rounded-md shadow-md"
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
              <div className="mt-4 rounded-md border border-border bg-surface/50 p-4">
                <p className="mb-3 text-xs font-medium text-muted">Vista previa en mapa</p>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-[38px] w-[38px] items-center justify-center rounded-md"
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
              {FONT_PAIRINGS.map((fp) => {
                const selected = settings.fontPairing === fp.id;
                return (
                  <button
                    key={fp.id}
                    onClick={() => update("fontPairing", fp.id)}
                    className={cn(
                      "group relative rounded-md border p-4 text-left shadow-sm transition-colors",
                      selected
                        ? "border-admin bg-admin/5"
                        : "border-border hover:bg-surface/60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-bold leading-tight" style={{ fontFamily: fp.displayVar }}>
                          {fp.label}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-muted" style={{ fontFamily: fp.bodyVar }}>
                          {fp.description}
                        </p>
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md border",
                          selected ? "border-admin bg-admin text-white" : "border-border bg-white text-muted opacity-0 group-hover:opacity-100",
                        )}
                        aria-hidden
                      >
                        <Check className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {(() => {
              const activeFp = FONT_PAIRINGS.find((fp) => fp.id === settings.fontPairing) ?? FONT_PAIRINGS[0];
              return (
                <div className="mt-6 rounded-md border border-border p-4">
                  <p className="mb-3 text-xs font-medium text-muted">Vista previa — {activeFp.label}</p>
                  <div
                    className="overflow-hidden rounded-md p-6"
                    style={{ backgroundColor: settings.colorBg, color: settings.colorFg }}
                  >
                    <h3
                      className="text-2xl font-bold"
                      style={{ fontFamily: activeFp.displayVar }}
                    >
                      {settings.studioName}
                    </h3>
                    <p
                      className="mt-1 text-sm"
                      style={{ fontFamily: activeFp.bodyVar, color: settings.colorMuted }}
                    >
                      {settings.tagline || "Descripción de ejemplo"}
                    </p>
                    <p
                      className="mt-3 text-base leading-relaxed"
                      style={{ fontFamily: activeFp.bodyVar }}
                    >
                      Descubre nuestras clases, reserva tu lugar y transforma tu rutina.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <span
                        className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                        style={{ backgroundColor: settings.colorAccent, fontFamily: activeFp.displayVar }}
                      >
                        Reservar
                      </span>
                      <span
                        className="rounded-md px-3 py-1.5 text-sm font-medium"
                        style={{ backgroundColor: settings.colorAccentSoft, color: settings.colorFg, fontFamily: activeFp.bodyVar }}
                      >
                        Ver horarios
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}
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

            <div className="grid gap-3 sm:grid-cols-2">
              {colorFields.map(({ key, label, hint }) => {
                const hex = (settings[key] as string) ?? (DEFAULTS[key] as string) ?? "#000000";
                return (
                <div key={key} className="flex items-center gap-3 rounded-md border border-border bg-white p-3 shadow-sm">
                  <label className="relative">
                    <input
                      type="color"
                      value={hex}
                      onChange={(e) => update(key, e.target.value)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                      aria-label={label}
                    />
                    <div
                      className="h-10 w-10 shrink-0 rounded-md border border-border shadow-sm"
                      style={{ backgroundColor: hex }}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted">{hint || "Click en el color para cambiarlo"}</p>
                  </div>
                  <Input
                    value={hex.toUpperCase()}
                    onChange={(e) => update(key, e.target.value)}
                    className="h-9 w-[140px] font-mono text-xs"
                    aria-label={`${label} hex`}
                  />
                </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-md border border-border p-4">
              <p className="mb-3 text-xs font-medium text-muted">Vista previa</p>
              <div className="overflow-hidden rounded-md">
                <div className="p-6" style={{ backgroundColor: settings.colorBg, color: settings.colorFg }}>
                  <h3 className="font-display text-xl font-bold">{settings.studioName}</h3>
                  <p className="mt-1 text-sm" style={{ color: settings.colorMuted }}>
                    {settings.tagline || "Tu estudio"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: settings.colorAccent }}
                    >
                      Reservar clase
                    </span>
                    <span
                      className="rounded-md px-3 py-1.5 text-xs font-medium"
                      style={{ backgroundColor: settings.colorAccentSoft, color: settings.colorFg }}
                    >
                      Ver horarios
                    </span>
                  </div>
                  <div
                    className="mt-3 rounded-md border p-3"
                    style={{ borderColor: settings.colorBorder, backgroundColor: settings.colorSurface }}
                  >
                    <p className="text-xs" style={{ color: settings.colorMuted }}>
                      Los colores de fondo, texto, bordes y superficie se ajustan automáticamente.
                    </p>
                  </div>
                </div>
                <div className="p-6" style={{ backgroundColor: settings.colorHeroBg, color: "#FFFFFF" }}>
                  <h3 className="font-display text-lg font-bold">Tu Landing Page</h3>
                  <p className="mt-1 text-sm opacity-70">
                    Así se ven las secciones oscuras
                  </p>
                  <span
                    className="mt-3 inline-block rounded-md px-3 py-1.5 text-xs font-semibold text-white"
                    style={{ backgroundColor: settings.colorAccent }}
                  >
                    Empieza hoy
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
