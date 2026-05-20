"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ScheduleVisibilityConfig,
  type ScheduleVisibilityValue,
} from "@/components/admin/schedule-visibility-config";
import type { ScheduleVisibilityMode } from "@/hooks/usePolicies";

interface ApiResponse {
  scheduleVisibilityMode: ScheduleVisibilityMode;
  visibleScheduleDays: number;
  scheduleReleaseDayOfWeek: number | null;
  scheduleReleaseHour: number | null;
  scheduleReleaseWeeksAhead: number | null;
  scheduleEffectiveTimezone?: string;
  visibleUntilIso?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ScheduleVisibilityDialog({ open, onOpenChange }: Props) {
  const t = useTranslations("admin.policiesPage");
  const queryClient = useQueryClient();
  const [value, setValue] = useState<ScheduleVisibilityValue | null>(null);
  const [meta, setMeta] = useState<{
    visibleUntilIso: string | null;
    effectiveTimezone?: string;
  }>({ visibleUntilIso: null });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/admin/policies")
      .then((r) => r.json())
      .then((data: ApiResponse) => {
        setValue({
          scheduleVisibilityMode: data.scheduleVisibilityMode,
          visibleScheduleDays: data.visibleScheduleDays,
          scheduleReleaseDayOfWeek: data.scheduleReleaseDayOfWeek,
          scheduleReleaseHour: data.scheduleReleaseHour,
          scheduleReleaseWeeksAhead: data.scheduleReleaseWeeksAhead,
        });
        setMeta({
          visibleUntilIso: data.visibleUntilIso ?? null,
          effectiveTimezone: data.scheduleEffectiveTimezone,
        });
      })
      .catch(() => toast.error(t("loadError")))
      .finally(() => setLoading(false));
  }, [open, t]);

  async function handleSave() {
    if (!value) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed");
      }
      toast.success(t("saved"));
      queryClient.invalidateQueries({ queryKey: ["tenant-policies"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("visibleDaysTitle")}</DialogTitle>
          <DialogDescription>{t("visibleDaysDesc")}</DialogDescription>
        </DialogHeader>

        {loading || !value ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <ScheduleVisibilityConfig
            value={value}
            onChange={setValue}
            visibleUntilIso={meta.visibleUntilIso}
            effectiveTimezone={meta.effectiveTimezone}
            bare
          />
        )}

        <DialogFooter className="mt-2 flex-row items-center justify-between sm:justify-between gap-2">
          <Link
            href="/admin/settings/policies"
            className="text-xs text-muted underline-offset-4 hover:underline"
          >
            {t("morePolicies")}
          </Link>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !value}
            className="gap-2 bg-admin hover:bg-admin/90"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
