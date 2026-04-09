"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Save, Eye } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type RewardType = "class_credit" | "discount" | "days_free" | "manual";
type TriggerStage = "installed" | "purchased" | "booked" | "attended" | "member";

interface ReferralConfigForm {
  isEnabled: boolean;
  triggerStage: TriggerStage;
  referrerRewardType: RewardType;
  referrerRewardValue: number | null;
  referrerRewardText: string;
  referrerRewardWhen: string;
  refereeRewardType: RewardType;
  refereeRewardValue: number | null;
  refereeRewardText: string;
  refereeRewardWhen: string;
}

const TRIGGER_STAGES: { key: TriggerStage; label: string }[] = [
  { key: "installed", label: "App instalada" },
  { key: "purchased", label: "Primera compra" },
  { key: "booked", label: "Primera reserva" },
  { key: "attended", label: "Fue a una clase" },
  { key: "member", label: "Membresía activa" },
];

const REWARD_TYPES: { key: RewardType; label: string }[] = [
  { key: "class_credit", label: "Créditos de clase" },
  { key: "discount", label: "Descuento %" },
  { key: "days_free", label: "Días gratis de membresía" },
  { key: "manual", label: "Manual (texto libre)" },
];

const DEFAULTS: ReferralConfigForm = {
  isEnabled: true,
  triggerStage: "attended",
  referrerRewardType: "manual",
  referrerRewardValue: null,
  referrerRewardText: "",
  referrerRewardWhen: "",
  refereeRewardType: "manual",
  refereeRewardValue: null,
  refereeRewardText: "",
  refereeRewardWhen: "",
};

export default function ReferralSettingsPage() {
  const [form, setForm] = useState<ReferralConfigForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/referrals/config")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        if (data.config) {
          setForm({
            isEnabled: data.config.isEnabled ?? true,
            triggerStage: data.config.triggerStage ?? "attended",
            referrerRewardType: data.config.referrerRewardType ?? "manual",
            referrerRewardValue: data.config.referrerRewardValue ?? null,
            referrerRewardText: data.config.referrerRewardText ?? "",
            referrerRewardWhen: data.config.referrerRewardWhen ?? "",
            refereeRewardType: data.config.refereeRewardType ?? "manual",
            refereeRewardValue: data.config.refereeRewardValue ?? null,
            refereeRewardText: data.config.refereeRewardText ?? "",
            refereeRewardWhen: data.config.refereeRewardWhen ?? "",
          });
        }
      })
      .catch(() => toast.error("Error al cargar configuración"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/referrals/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      if (data.config) {
        setForm({
          isEnabled: data.config.isEnabled ?? true,
          triggerStage: data.config.triggerStage ?? "attended",
          referrerRewardType: data.config.referrerRewardType ?? "manual",
          referrerRewardValue: data.config.referrerRewardValue ?? null,
          referrerRewardText: data.config.referrerRewardText ?? "",
          referrerRewardWhen: data.config.referrerRewardWhen ?? "",
          refereeRewardType: data.config.refereeRewardType ?? "manual",
          refereeRewardValue: data.config.refereeRewardValue ?? null,
          refereeRewardText: data.config.refereeRewardText ?? "",
          refereeRewardWhen: data.config.refereeRewardWhen ?? "",
        });
      }
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }, [form]);

  const update = <K extends keyof ReferralConfigForm>(
    key: K,
    value: ReferralConfigForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Programa de referidos</h1>
          <p className="mt-1 text-sm text-muted">
            Configura cómo tus miembros invitan amigos y qué reciben a cambio.
          </p>
        </div>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="bg-admin hover:bg-admin/90"
        >
          {saving ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-2 h-3.5 w-3.5" />
          )}
          Guardar
        </Button>
      </div>

      {/* Toggle */}
      <section className="rounded-xl border border-border bg-white p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">Programa activo</h3>
            <p className="text-xs text-muted">
              Tus miembros podrán compartir su link de invitación
            </p>
          </div>
          <Switch
            checked={form.isEnabled}
            onCheckedChange={(v) => update("isEnabled", v)}
          />
        </div>
      </section>

      {/* Trigger stage */}
      <section className="rounded-xl border border-border bg-white p-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          ¿Cuándo se desbloquea el premio?
        </h2>
        <p className="mb-4 text-xs text-muted">
          Cuando el invitado alcance esta etapa, ambas partes reciben su reward.
        </p>
        <div className="space-y-2">
          {TRIGGER_STAGES.map(({ key, label }) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                form.triggerStage === key
                  ? "border-admin bg-admin/5"
                  : "border-border/60 hover:bg-surface",
              )}
            >
              <input
                type="radio"
                name="triggerStage"
                value={key}
                checked={form.triggerStage === key}
                onChange={() => update("triggerStage", key)}
                className="accent-admin"
              />
              <span className="text-sm text-foreground">{label}</span>
              {key === "attended" && (
                <span className="ml-auto text-[11px] font-medium text-admin">Recomendado</span>
              )}
            </label>
          ))}
        </div>
      </section>

      {/* Referrer reward */}
      <RewardSection
        title="Reward para quien invita"
        subtitle="Lo que recibe el miembro por cada amigo que traiga."
        rewardType={form.referrerRewardType}
        rewardValue={form.referrerRewardValue}
        rewardText={form.referrerRewardText}
        rewardWhen={form.referrerRewardWhen}
        onTypeChange={(v) => update("referrerRewardType", v)}
        onValueChange={(v) => update("referrerRewardValue", v)}
        onTextChange={(v) => update("referrerRewardText", v)}
        onWhenChange={(v) => update("referrerRewardWhen", v)}
      />

      {/* Referee reward */}
      <RewardSection
        title="Reward para el invitado"
        subtitle="Lo que recibe la persona que llega por invitación."
        rewardType={form.refereeRewardType}
        rewardValue={form.refereeRewardValue}
        rewardText={form.refereeRewardText}
        rewardWhen={form.refereeRewardWhen}
        onTypeChange={(v) => update("refereeRewardType", v)}
        onValueChange={(v) => update("refereeRewardValue", v)}
        onTextChange={(v) => update("refereeRewardText", v)}
        onWhenChange={(v) => update("refereeRewardWhen", v)}
      />

      {/* Preview */}
      <section className="pb-8">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye className="h-4 w-4 text-muted" />
          Preview — así lo verá el invitado
        </div>
        <div className="rounded-2xl p-4 px-5" style={{ background: "#1C1917" }}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">
            Regalo de bienvenida
          </p>
          <p className="mt-0.5 text-base font-bold text-white">
            {form.refereeRewardText || "Descripción del reward..."}
          </p>
          {form.refereeRewardWhen && (
            <p className="mt-0.5 text-[12px] text-white/50">
              {form.refereeRewardWhen}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function RewardSection({
  title,
  subtitle,
  rewardType,
  rewardValue,
  rewardText,
  rewardWhen,
  onTypeChange,
  onValueChange,
  onTextChange,
  onWhenChange,
}: {
  title: string;
  subtitle: string;
  rewardType: RewardType;
  rewardValue: number | null;
  rewardText: string;
  rewardWhen: string;
  onTypeChange: (v: RewardType) => void;
  onValueChange: (v: number | null) => void;
  onTextChange: (v: string) => void;
  onWhenChange: (v: string) => void;
}) {
  const valueLabel =
    rewardType === "class_credit"
      ? "clases"
      : rewardType === "discount"
        ? "% de descuento"
        : rewardType === "days_free"
          ? "días"
          : null;

  return (
    <section className="rounded-xl border border-border bg-white p-6">
      <h2 className="mb-1 text-sm font-semibold text-foreground">{title}</h2>
      <p className="mb-4 text-xs text-muted">{subtitle}</p>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-muted">
            Tipo de reward
          </label>
          <select
            value={rewardType}
            onChange={(e) => {
              onTypeChange(e.target.value as RewardType);
              onValueChange(null);
            }}
            className="h-10 w-full rounded-lg border border-border/60 bg-white px-3 text-sm text-foreground focus:border-admin focus:outline-none"
          >
            {REWARD_TYPES.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {valueLabel && (
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-muted">
              Cantidad
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={rewardValue ?? ""}
                onChange={(e) =>
                  onValueChange(e.target.value ? Number(e.target.value) : null)
                }
                className="h-10 w-24 rounded-lg border border-border/60 bg-white px-3 text-sm text-foreground focus:border-admin focus:outline-none"
                placeholder="0"
              />
              <span className="text-sm text-muted">{valueLabel}</span>
            </div>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-muted">
            Descripción del reward *
          </label>
          <textarea
            value={rewardText}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="ej. 1 clase gratis por cada amigo que traigas"
            rows={2}
            className="w-full resize-none rounded-lg border border-border/60 bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-admin focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[12px] font-medium text-muted">
            Cuándo se entrega
          </label>
          <input
            type="text"
            value={rewardWhen}
            onChange={(e) => onWhenChange(e.target.value)}
            placeholder="ej. cuando tu amigo vaya a su primera clase"
            className="h-10 w-full rounded-lg border border-border/60 bg-white px-3 text-sm text-foreground placeholder:text-muted/50 focus:border-admin focus:outline-none"
          />
        </div>
      </div>
    </section>
  );
}
