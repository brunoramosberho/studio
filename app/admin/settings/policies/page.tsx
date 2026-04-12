"use client";

import { useEffect, useState } from "react";
import { Loader2, Clock, AlertTriangle, ShieldAlert, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface PoliciesConfig {
  cancellationWindowHours: number;
  noShowPenaltyEnabled: boolean;
  noShowPenaltyType: "CREDIT_LOSS" | "FEE";
  noShowPenaltyAmount: number | null;
}

export default function PoliciesSettingsPage() {
  const [config, setConfig] = useState<PoliciesConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/policies")
      .then((r) => r.json())
      .then((data) => setConfig(data))
      .catch(() =>
        setConfig({
          cancellationWindowHours: 12,
          noShowPenaltyEnabled: false,
          noShowPenaltyType: "CREDIT_LOSS",
          noShowPenaltyAmount: null,
        }),
      );
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setConfig(updated);
      toast.success("Políticas actualizadas");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Políticas de reserva</h1>
        <p className="mt-1 text-sm text-muted">
          Configura las reglas de cancelación y penalización por no-show
        </p>
      </div>

      {/* Cancellation policy */}
      <div className="rounded-xl border border-border/50 bg-white p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
            <Clock className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Política de cancelación</h2>
            <p className="text-sm text-muted">
              Tiempo mínimo antes de la clase para cancelar sin perder el crédito
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Ventana de cancelación (horas)</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={72}
              step={1}
              value={config.cancellationWindowHours}
              onChange={(e) =>
                setConfig({ ...config, cancellationWindowHours: parseInt(e.target.value) || 0 })
              }
              className="w-24"
            />
            <span className="text-sm text-muted">horas antes del inicio de la clase</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[0, 2, 4, 6, 8, 12, 24, 48].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setConfig({ ...config, cancellationWindowHours: h })}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  config.cancellationWindowHours === h
                    ? "bg-admin text-white"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {h === 0 ? "Sin límite" : `${h}h`}
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-surface/60 px-3 py-2.5">
            <p className="text-[13px] text-muted">
              {config.cancellationWindowHours === 0 ? (
                <>Los clientes pueden cancelar en cualquier momento y siempre recuperan su crédito.</>
              ) : (
                <>
                  Si un cliente cancela con menos de{" "}
                  <span className="font-semibold text-foreground">{config.cancellationWindowHours} horas</span>{" "}
                  de anticipación, perderá el crédito usado para la reserva.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* No-show policy */}
      <div className="rounded-xl border border-border/50 bg-white p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
            <ShieldAlert className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">Penalización por no-show</h2>
            <p className="text-sm text-muted">
              Qué sucede cuando un cliente reserva pero no asiste a la clase
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Activar penalización por no-show</Label>
            <p className="text-xs text-muted mt-0.5">
              Al activar, se penalizará a los clientes que reserven y no asistan
            </p>
          </div>
          <Switch
            checked={config.noShowPenaltyEnabled}
            onCheckedChange={(checked) => setConfig({ ...config, noShowPenaltyEnabled: checked })}
          />
        </div>

        {config.noShowPenaltyEnabled && (
          <div className="space-y-4 rounded-lg border border-border/30 bg-surface/20 p-4">
            {/* Explanation of automatic behavior */}
            <div className="rounded-lg bg-surface/60 px-3 py-2.5 space-y-2">
              <p className="text-[13px] font-medium text-foreground">Cómo funciona:</p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-muted">
                    <span className="font-medium text-foreground">Paquetes con créditos:</span>{" "}
                    El crédito se pierde automáticamente. El cliente ya pagó por esa clase.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-muted">
                    <span className="font-medium text-foreground">Membresías ilimitadas:</span>{" "}
                    No hay crédito que perder, así que se aplica un cargo económico como incentivo a cancelar a tiempo.
                  </p>
                </div>
              </div>
            </div>

            {/* Fee amount for unlimited packages */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cargo por no-show (membresías ilimitadas)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={config.noShowPenaltyAmount ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      noShowPenaltyAmount: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className="w-28"
                  placeholder="5.00"
                />
                <span className="text-sm text-muted">EUR por no-show</span>
              </div>
              {config.noShowPenaltyAmount ? (
                <p className="text-[12px] text-muted">
                  Se registrará un cargo de <span className="font-semibold text-foreground">{config.noShowPenaltyAmount}€</span> cuando
                  un cliente con membresía ilimitada no se presente
                </p>
              ) : (
                <p className="text-[12px] text-orange-600">
                  Configura un monto para penalizar a clientes con membresías ilimitadas
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 bg-admin hover:bg-admin/90">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar políticas
        </Button>
      </div>
    </div>
  );
}
