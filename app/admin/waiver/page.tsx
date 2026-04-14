"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  FileText,
  Users,
  Settings,
  Save,
  Send,
  Download,
  Bell,
  AlertCircle,
  Check,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Tab = "editor" | "signatures" | "settings";

interface WaiverData {
  id: string;
  version: number;
  title: string;
  content: string;
  status: "draft" | "active";
  publishedAt: string | null;
  requirePhone: boolean;
  requireBirthDate: boolean;
  requireScrollRead: boolean;
  triggerOnBooking: boolean;
  triggerOnFirstOpen: boolean;
  triggerOnFirstBooking: boolean;
  triggerReminder24h: boolean;
  blockCheckinWithoutSignature: boolean;
  _count?: { signatures: number };
}

interface SignatureRow {
  id: string;
  member: { id: string; name: string | null; email: string; image: string | null };
  signedAt: string | null;
  waiverVersion: number | null;
  pdfUrl: string | null;
  status: "signed" | "pending" | "needs_resign";
}

interface Stats {
  signed: number;
  pending: number;
  needsResign: number;
  total: number;
}

export default function AdminWaiverPage() {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const [tab, setTab] = useState<Tab>("editor");
  const [waiver, setWaiver] = useState<WaiverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Editor
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Publish modal
  const [showPublish, setShowPublish] = useState(false);
  const [publishMode, setPublishMode] = useState<"keep" | "resign">("keep");
  const [publishing, setPublishing] = useState(false);

  // Signatures
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [stats, setStats] = useState<Stats>({ signed: 0, pending: 0, needsResign: 0, total: 0 });
  const [sigFilter, setSigFilter] = useState<string>("");
  const [sigSearch, setSigSearch] = useState("");
  const [sigLoading, setSigLoading] = useState(false);
  const [reminding, setReminding] = useState(false);

  const fetchWaiver = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/waiver");
      if (!res.ok) {
        toast.error(t("waiverLoadError"));
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.waiver) {
        setWaiver(data.waiver);
        setTitle(data.waiver.title);
        setContent(data.waiver.content);
      }
    } catch {
      toast.error(t("connectionErrorLoading"));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchWaiver();
  }, [fetchWaiver]);

  const fetchSignatures = useCallback(async () => {
    setSigLoading(true);
    try {
      const params = new URLSearchParams();
      if (sigFilter) params.set("status", sigFilter);
      if (sigSearch) params.set("search", sigSearch);
      const res = await fetch(`/api/admin/waiver/signatures?${params}`);
      if (!res.ok) {
        toast.error(t("signaturesError"));
        setSigLoading(false);
        return;
      }
      const data = await res.json();
      setSignatures(data.signatures || []);
      setStats(data.stats || { signed: 0, pending: 0, needsResign: 0, total: 0 });
    } catch {
      toast.error(t("connectionErrorSignatures"));
    }
    setSigLoading(false);
  }, [sigFilter, sigSearch]);

  useEffect(() => {
    if (tab === "signatures") fetchSignatures();
  }, [tab, fetchSignatures]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/waiver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t("liabilityAgreement"), content: "" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || t("waiverCreateError"));
        setSaving(false);
        return;
      }
      if (data.waiver) {
        setWaiver(data.waiver);
        setTitle(data.waiver.title);
        setContent(data.waiver.content);
        toast.success(t("waiverCreated"));
      }
    } catch {
      toast.error(t("connectionErrorGeneric"));
    }
    setSaving(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/waiver", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("waiverSaveError"));
        setSaving(false);
        return;
      }
      const data = await res.json();
      if (data.waiver) setWaiver(data.waiver);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error(t("connectionErrorSaving"));
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/waiver/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requireResign: publishMode === "resign" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("waiverPublishError"));
        setPublishing(false);
        return;
      }
      setShowPublish(false);
      toast.success(t("waiverPublished", { version: data.version }));
      fetchWaiver();
    } catch {
      toast.error(t("connectionErrorPublishing"));
    }
    setPublishing(false);
  };

  const handleSaveSettings = async (updates: Record<string, boolean>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/waiver", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || t("configError"));
        setSaving(false);
        return;
      }
      setWaiver((prev) => (prev ? { ...prev, ...updates } : prev));
    } catch {
      toast.error(t("connectionErrorGeneric"));
    }
    setSaving(false);
  };

  const handleRemindAll = async () => {
    setReminding(true);
    try {
      const res = await fetch("/api/admin/waiver/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || t("remindersError"));
        setReminding(false);
        return;
      }
      toast.success(data.sent ? t("remindersSuccess", { count: data.sent }) : t("remindersGenericSuccess"));
    } catch {
      toast.error(t("connectionErrorGeneric"));
    }
    setReminding(false);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: typeof FileText }[] = [
    { key: "editor", label: "Editor", icon: FileText },
    { key: "signatures", label: "Firmas", icon: Users },
    { key: "settings", label: "Configuración", icon: Settings },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Waiver digital</h1>
          <p className="text-sm text-muted">Acuerdo de responsabilidad para tus clientes</p>
        </div>
        {waiver && (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                waiver.status === "active"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700",
              )}
            >
              {waiver.status === "active" ? "Activo" : "Borrador"}
            </span>
            <span className="text-xs text-muted">v{waiver.version}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-border/60 bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-admin/8 text-admin shadow-sm"
                : "text-muted hover:text-foreground",
            )}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ─── TAB: Editor ─────────────────────────────────── */}
      {tab === "editor" && (
        <>
          {!waiver ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
              <FileText className="mb-4 h-10 w-10 text-muted/40" />
              <h2 className="mb-1 text-base font-semibold text-foreground">
                No hay waiver configurado
              </h2>
              <p className="mb-6 max-w-sm text-sm text-muted">
                Crea un acuerdo de responsabilidad para que tus clientes lo firmen antes de su primera clase.
              </p>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-admin px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Crear waiver
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-card p-5">
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Título
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mb-4 w-full rounded-xl border border-border/60 p-3 text-sm text-foreground outline-none focus:border-admin/40"
                />

                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Contenido del waiver
                </label>
                <p className="mb-2 text-xs text-muted">
                  Puedes usar HTML. Variables disponibles:{" "}
                  <code className="rounded bg-surface px-1 py-0.5 text-[11px]">
                    {"{{nombre_estudio}}"}
                  </code>{" "}
                  <code className="rounded bg-surface px-1 py-0.5 text-[11px]">
                    {"{{nombre_cliente}}"}
                  </code>
                </p>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={16}
                  className="w-full rounded-xl border border-border/60 p-4 font-mono text-sm text-foreground outline-none focus:border-admin/40"
                  placeholder="Escribe o pega el contenido de tu waiver aquí..."
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-card p-4">
                <div className="text-xs text-muted">
                  Versión {waiver.version}
                  {waiver.publishedAt && (
                    <> · Publicado {new Date(waiver.publishedAt).toLocaleDateString("es-ES")}</>
                  )}
                  {waiver._count && <> · {waiver._count.signatures} firmas</>}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-xl border border-border/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : saved ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Guardar borrador
                  </button>
                  <button
                    onClick={() => setShowPublish(true)}
                    disabled={!content.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-admin px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Publicar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Publish modal */}
          {showPublish && waiver && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
              <div className="w-full max-w-md rounded-2xl bg-card p-6">
                <h3 className="mb-1 text-base font-semibold text-foreground">
                  Publicar waiver v{waiver.version}
                </h3>
                {waiver._count && waiver._count.signatures > 0 ? (
                  <>
                    <p className="mb-4 text-sm text-muted">
                      ¿Qué pasa con los {waiver._count.signatures} clientes que ya firmaron?
                    </p>
                    <div className="mb-5 space-y-3">
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:bg-surface">
                        <input
                          type="radio"
                          name="publishMode"
                          checked={publishMode === "keep"}
                          onChange={() => setPublishMode("keep")}
                          className="mt-0.5 accent-admin"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Mantener firmas existentes
                          </p>
                          <p className="text-xs text-muted">
                            Recomendado para cambios menores. Solo los nuevos clientes firman la nueva versión.
                          </p>
                        </div>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 p-3 transition-colors hover:bg-surface">
                        <input
                          type="radio"
                          name="publishMode"
                          checked={publishMode === "resign"}
                          onChange={() => setPublishMode("resign")}
                          className="mt-0.5 accent-admin"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Pedir re-firma a todos
                          </p>
                          <p className="text-xs text-muted">
                            Los clientes existentes recibirán un recordatorio para firmar de nuevo.
                          </p>
                        </div>
                      </label>
                    </div>
                  </>
                ) : (
                  <p className="mb-5 text-sm text-muted">
                    Al publicar, el waiver estará visible para todos tus clientes.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPublish(false)}
                    className="flex-1 rounded-xl border border-border/60 py-2.5 text-sm font-medium text-foreground"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={publishing}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-admin py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {publishing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Publicar v{waiver.version}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── TAB: Signatures ─────────────────────────────── */}
      {tab === "signatures" && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Firmaron", value: stats.signed, color: "text-emerald-600 bg-emerald-50" },
              { label: "Pendientes", value: stats.pending, color: "text-amber-600 bg-amber-50" },
              { label: "Re-firma", value: stats.needsResign, color: "text-red-600 bg-red-50" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-border/60 bg-card p-4 text-center">
                <p className={cn("text-2xl font-bold", s.color.split(" ")[0])}>{s.value}</p>
                <p className="text-xs text-muted">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Filters + search */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1 overflow-x-auto">
              {[
                { key: "", label: "Todos" },
                { key: "signed", label: "Firmados" },
                { key: "pending", label: "Pendientes" },
                { key: "needs_resign", label: "Re-firma" },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setSigFilter(f.key)}
                  className={cn(
                    "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    sigFilter === f.key
                      ? "bg-admin/10 text-admin"
                      : "text-muted hover:bg-surface",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="search"
                placeholder="Buscar miembro..."
                value={sigSearch}
                onChange={(e) => setSigSearch(e.target.value)}
                className="rounded-lg border border-border/60 px-3 py-1.5 text-sm outline-none focus:border-admin/40"
              />
              <button
                onClick={handleRemindAll}
                disabled={reminding || stats.pending === 0}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50"
              >
                {reminding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />}
                Recordar pendientes
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            {sigLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              </div>
            ) : signatures.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted">
                No hay firmas aún
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {signatures.map((sig) => (
                  <div
                    key={sig.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-medium text-muted">
                      {sig.member.image ? (
                        <img
                          src={sig.member.image}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        (sig.member.name?.[0] ?? sig.member.email[0]).toUpperCase()
                      )}
                    </div>

                    {/* Name + email */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {sig.member.name ?? sig.member.email}
                      </p>
                      {sig.member.name && (
                        <p className="truncate text-xs text-muted">
                          {sig.member.email}
                        </p>
                      )}
                    </div>

                    {/* Status badge */}
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                        sig.status === "signed" && "bg-emerald-50 text-emerald-700",
                        sig.status === "pending" && "bg-amber-50 text-amber-700",
                        sig.status === "needs_resign" && "bg-red-50 text-red-700",
                      )}
                    >
                      {sig.status === "signed"
                        ? `Firmado v${sig.waiverVersion}`
                        : sig.status === "pending"
                          ? "Pendiente"
                          : "Re-firma"}
                    </span>

                    {/* Date */}
                    {sig.signedAt && (
                      <span className="hidden shrink-0 text-xs text-muted sm:block">
                        {new Date(sig.signedAt).toLocaleDateString("es-ES")}
                      </span>
                    )}

                    {/* PDF download */}
                    {sig.pdfUrl && (
                      <a
                        href={`/api/admin/waiver/signatures/${sig.id}/pdf`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
                        title="Descargar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: Settings ─────────────────────────────── */}
      {tab === "settings" && waiver && (
        <div className="space-y-4">
          <SettingsSection title="Campos del participante">
            <SettingsToggle
              label="Nombre completo"
              description="Siempre requerido"
              checked={true}
              disabled
            />
            <SettingsToggle
              label="Teléfono"
              checked={waiver.requirePhone}
              onChange={(v) => handleSaveSettings({ requirePhone: v })}
            />
            <SettingsToggle
              label="Fecha de nacimiento"
              checked={waiver.requireBirthDate}
              onChange={(v) => handleSaveSettings({ requireBirthDate: v })}
            />
          </SettingsSection>

          <SettingsSection title="Cuándo mostrar el waiver">
            <SettingsToggle
              label="Al hacer una reserva"
              description="Muestra el waiver justo después de reservar una clase"
              checked={waiver.triggerOnBooking}
              onChange={(v) => handleSaveSettings({ triggerOnBooking: v })}
            />
            <SettingsToggle
              label="Al abrir la app"
              description="Solo si tiene una reserva futura y no ha firmado"
              checked={waiver.triggerOnFirstOpen}
              onChange={(v) => handleSaveSettings({ triggerOnFirstOpen: v })}
            />
            <SettingsToggle
              label="Email 5 min después de reservar"
              description="Si no firmó tras la reserva, se le envía un recordatorio por correo"
              checked={waiver.triggerOnFirstBooking}
              onChange={(v) => handleSaveSettings({ triggerOnFirstBooking: v })}
            />
            <SettingsToggle
              label="Recordatorio 1h antes de la clase"
              description="Correo recordatorio si aún no ha firmado"
              checked={waiver.triggerReminder24h}
              onChange={(v) => handleSaveSettings({ triggerReminder24h: v })}
            />
          </SettingsSection>

          <SettingsSection title="Comportamiento">
            <SettingsToggle
              label="Bloquear check-in sin waiver firmado"
              description="El admin verá un aviso en el roster y puede enviar el link al móvil del cliente"
              checked={waiver.blockCheckinWithoutSignature}
              onChange={(v) =>
                handleSaveSettings({ blockCheckinWithoutSignature: v })
              }
            />
            <SettingsToggle
              label="Requerir scroll completo antes de firmar"
              checked={waiver.requireScrollRead}
              onChange={(v) => handleSaveSettings({ requireScrollRead: v })}
            />
          </SettingsSection>
        </div>
      )}

      {tab === "settings" && !waiver && (
        <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card">
          <AlertCircle className="h-5 w-5 text-muted/40" />
          <p className="text-sm text-muted">Crea un waiver primero para configurarlo</p>
        </div>
      )}
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card">
      <div className="border-b border-border/40 px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="divide-y divide-border/40">{children}</div>
    </div>
  );
}

function SettingsToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between px-5 py-3">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-xs text-muted">{description}</p>
        )}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="h-5 w-5 rounded border-border accent-admin disabled:opacity-50"
      />
    </label>
  );
}
