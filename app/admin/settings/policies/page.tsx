"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("admin.policies");
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
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveError"));
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
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {/* Cancellation policy */}
      <div className="rounded-xl border border-border/50 bg-white p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50">
            <Clock className="h-5 w-5 text-orange-500" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">{t("cancellationTitle")}</h2>
            <p className="text-sm text-muted">{t("cancellationDesc")}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">{t("windowLabel")}</Label>
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
            <span className="text-sm text-muted">{t("hoursBeforeClass")}</span>
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
                {h === 0 ? t("noLimit") : `${h}h`}
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-surface/60 px-3 py-2.5">
            <p className="text-[13px] text-muted">
              {config.cancellationWindowHours === 0
                ? t("windowExplainNoLimit")
                : t("windowExplain", { hours: config.cancellationWindowHours })}
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
            <h2 className="font-display text-lg font-bold">{t("noShowTitle")}</h2>
            <p className="text-sm text-muted">{t("noShowDesc")}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">{t("enableNoShow")}</Label>
            <p className="text-xs text-muted mt-0.5">{t("enableNoShowDesc")}</p>
          </div>
          <Switch
            checked={config.noShowPenaltyEnabled}
            onCheckedChange={(checked) => setConfig({ ...config, noShowPenaltyEnabled: checked })}
          />
        </div>

        {config.noShowPenaltyEnabled && (
          <div className="space-y-4 rounded-lg border border-border/30 bg-surface/20 p-4">
            <div className="rounded-lg bg-surface/60 px-3 py-2.5 space-y-2">
              <p className="text-[13px] font-medium text-foreground">{t("howItWorks")}</p>
              <div className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-muted">
                    <span className="font-medium text-foreground">{t("creditPackages")}</span>{" "}
                    {t("creditPackagesDesc")}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <DollarSign className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-[13px] text-muted">
                    <span className="font-medium text-foreground">{t("unlimitedMemberships")}</span>{" "}
                    {t("unlimitedMembershipsDesc")}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("feeLabel")}</Label>
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
                <span className="text-sm text-muted">{t("feeUnit")}</span>
              </div>
              {config.noShowPenaltyAmount ? (
                <p className="text-[12px] text-muted">
                  {t("feeExplain", { amount: config.noShowPenaltyAmount })}
                </p>
              ) : (
                <p className="text-[12px] text-orange-600">{t("feeRequired")}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2 bg-admin hover:bg-admin/90">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
