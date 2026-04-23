"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  Clock,
  AlertTriangle,
  ShieldAlert,
  DollarSign,
  CalendarDays,
  Hourglass,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface PoliciesConfig {
  cancellationWindowHours: number;
  noShowPenaltyEnabled: boolean;
  noShowLoseCredit: boolean;
  noShowChargeFee: boolean;
  noShowPenaltyAmount: number | null;
  noShowFeeAmountUnlimited: number | null;
  noShowPenaltyGraceHours: number;
  visibleScheduleDays: number;
}

const DEFAULT_CONFIG: PoliciesConfig = {
  cancellationWindowHours: 12,
  noShowPenaltyEnabled: false,
  noShowLoseCredit: true,
  noShowChargeFee: false,
  noShowPenaltyAmount: null,
  noShowFeeAmountUnlimited: null,
  noShowPenaltyGraceHours: 24,
  visibleScheduleDays: 7,
};

export default function PoliciesSettingsPage() {
  const t = useTranslations("admin.policiesPage");
  const [config, setConfig] = useState<PoliciesConfig | null>(null);
  const [separateUnlimitedFee, setSeparateUnlimitedFee] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/policies")
      .then((r) => r.json())
      .then((data: PoliciesConfig) => {
        setConfig({ ...DEFAULT_CONFIG, ...data });
        setSeparateUnlimitedFee(data.noShowFeeAmountUnlimited !== null);
      })
      .catch(() => setConfig(DEFAULT_CONFIG));
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    try {
      const payload = {
        ...config,
        noShowFeeAmountUnlimited: separateUnlimitedFee
          ? config.noShowFeeAmountUnlimited
          : null,
      };
      const res = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setConfig({ ...DEFAULT_CONFIG, ...updated });
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

  const feeMissing =
    config.noShowPenaltyEnabled &&
    config.noShowChargeFee &&
    (config.noShowPenaltyAmount === null || config.noShowPenaltyAmount <= 0);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </div>

      {/* Cancellation policy */}
      <div className="rounded-xl border border-border/50 bg-card p-6 space-y-5">
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
      <div className="rounded-xl border border-border/50 bg-card p-6 space-y-5">
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
          <div className="space-y-5 rounded-lg border border-border/30 bg-surface/20 p-4">
            {/* Penalty kind: lose credit + charge fee */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">{t("penaltyKindLabel")}</Label>

              <div className="flex items-start justify-between gap-4 rounded-lg bg-surface/60 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      {t("loseCreditTitle")}
                    </p>
                    <p className="text-[12px] text-muted mt-0.5">{t("loseCreditDesc")}</p>
                  </div>
                </div>
                <Switch
                  checked={config.noShowLoseCredit}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, noShowLoseCredit: checked })
                  }
                />
              </div>

              <div className="flex items-start justify-between gap-4 rounded-lg bg-surface/60 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <DollarSign className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      {t("chargeFeeTitle")}
                    </p>
                    <p className="text-[12px] text-muted mt-0.5">{t("chargeFeeDesc")}</p>
                  </div>
                </div>
                <Switch
                  checked={config.noShowChargeFee}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, noShowChargeFee: checked })
                  }
                />
              </div>
            </div>

            {/* Fee amount inputs — only when chargeFee is on */}
            {config.noShowChargeFee && (
              <div className="space-y-4 border-t border-border/30 pt-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("feeLabelDefault")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={config.noShowPenaltyAmount ?? ""}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          noShowPenaltyAmount: e.target.value
                            ? parseFloat(e.target.value)
                            : null,
                        })
                      }
                      className="w-28"
                      placeholder="5.00"
                    />
                    <span className="text-sm text-muted">{t("feeUnit")}</span>
                  </div>
                  <p className="text-[12px] text-muted">{t("feeLabelDefaultHelp")}</p>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-lg bg-surface/60 px-3 py-2.5">
                  <div>
                    <p className="text-[13px] font-medium text-foreground">
                      {t("differentUnlimitedFeeTitle")}
                    </p>
                    <p className="text-[12px] text-muted mt-0.5">
                      {t("differentUnlimitedFeeDesc")}
                    </p>
                  </div>
                  <Switch
                    checked={separateUnlimitedFee}
                    onCheckedChange={setSeparateUnlimitedFee}
                  />
                </div>

                {separateUnlimitedFee && (
                  <div className="space-y-2 pl-4 border-l-2 border-red-200">
                    <Label className="text-sm font-medium">{t("feeLabelUnlimited")}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        value={config.noShowFeeAmountUnlimited ?? ""}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            noShowFeeAmountUnlimited: e.target.value
                              ? parseFloat(e.target.value)
                              : null,
                          })
                        }
                        className="w-28"
                        placeholder="15.00"
                      />
                      <span className="text-sm text-muted">{t("feeUnit")}</span>
                    </div>
                  </div>
                )}

                {feeMissing && (
                  <p className="text-[12px] text-orange-600">{t("feeRequired")}</p>
                )}
              </div>
            )}

            {/* Grace window */}
            <div className="space-y-3 border-t border-border/30 pt-4">
              <div className="flex items-center gap-2">
                <Hourglass className="h-4 w-4 text-muted" />
                <Label className="text-sm font-medium">{t("graceLabel")}</Label>
              </div>
              <p className="text-[12px] text-muted">{t("graceDesc")}</p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={168}
                  step={1}
                  value={config.noShowPenaltyGraceHours}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      noShowPenaltyGraceHours: Math.max(
                        0,
                        Math.min(168, parseInt(e.target.value) || 0),
                      ),
                    })
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted">{t("graceUnit")}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[0, 12, 24, 48, 72, 168].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() =>
                      setConfig({ ...config, noShowPenaltyGraceHours: h })
                    }
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      config.noShowPenaltyGraceHours === h
                        ? "bg-admin text-white"
                        : "bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    {h === 0 ? t("graceImmediate") : `${h}h`}
                  </button>
                ))}
              </div>
              <div className="rounded-lg bg-surface/60 px-3 py-2.5">
                <p className="text-[13px] text-muted">
                  {config.noShowPenaltyGraceHours === 0
                    ? t("graceExplainImmediate")
                    : t("graceExplain", { hours: config.noShowPenaltyGraceHours })}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Schedule visibility */}
      <div className="rounded-xl border border-border/50 bg-card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
            <CalendarDays className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold">{t("visibleDaysTitle")}</h2>
            <p className="text-sm text-muted">{t("visibleDaysDesc")}</p>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">{t("visibleDaysLabel")}</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={60}
              step={1}
              value={config.visibleScheduleDays}
              onChange={(e) =>
                setConfig({
                  ...config,
                  visibleScheduleDays: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)),
                })
              }
              className="w-24"
            />
            <span className="text-sm text-muted">{t("daysUnit")}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[7, 14, 21, 30].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setConfig({ ...config, visibleScheduleDays: d })}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  config.visibleScheduleDays === d
                    ? "bg-admin text-white"
                    : "bg-surface text-muted hover:text-foreground"
                }`}
              >
                {t("daysShort", { days: d })}
              </button>
            ))}
          </div>
          <div className="rounded-lg bg-surface/60 px-3 py-2.5">
            <p className="text-[13px] text-muted">
              {t("visibleDaysExplain", { days: config.visibleScheduleDays })}
            </p>
          </div>
        </div>
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
