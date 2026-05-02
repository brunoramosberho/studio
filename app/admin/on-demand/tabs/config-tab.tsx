"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface PackageOption {
  id: string;
  name: string;
  type: string;
  price: number;
  currency: string;
  recurringInterval: string | null;
  includesOnDemand: boolean;
}

interface ConfigData {
  config: {
    id: string;
    enabled: boolean;
    description: string | null;
    packageId: string | null;
    package: PackageOption | null;
  } | null;
  packages: PackageOption[];
}

export function OnDemandConfigTab() {
  const { data, isLoading } = useQuery<ConfigData>({
    queryKey: ["admin-on-demand-config"],
    queryFn: async () => {
      const res = await fetch("/api/admin/on-demand/config");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <ConfigForm
      key={data?.config?.id ?? "new"}
      initialConfig={data?.config ?? null}
      packages={data?.packages ?? []}
    />
  );
}

function ConfigForm({
  initialConfig,
  packages,
}: {
  initialConfig: ConfigData["config"];
  packages: PackageOption[];
}) {
  const t = useTranslations("admin.onDemand");
  const tc = useTranslations("common");
  const qc = useQueryClient();

  const [enabled, setEnabled] = useState(initialConfig?.enabled ?? false);
  const [description, setDescription] = useState(initialConfig?.description ?? "");
  const [packageId, setPackageId] = useState<string>(initialConfig?.packageId ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/on-demand/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          description: description.trim() || null,
          packageId: packageId || null,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-on-demand-config"] });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{t("enableTitle")}</h3>
              <p className="mt-1 text-sm text-muted">{t("enableDesc")}</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="od-description">{t("descriptionLabel")}</Label>
            <Textarea
              id="od-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("descriptionPlaceholder")}
            />
            <p className="text-xs text-muted">{t("descriptionHelp")}</p>
          </div>

          <div className="space-y-2">
            <Label>{t("packageLabel")}</Label>
            <Select value={packageId || "__none__"} onValueChange={(v) => setPackageId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder={t("packagePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t("packageNone")}</SelectItem>
                {packages.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {p.price} {p.currency}/{p.recurringInterval ?? "month"}
                    {p.type === "ON_DEMAND_SUBSCRIPTION" ? "" : ` · ${t("bundled")}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted">{t("packageHelp")}</p>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="gap-2"
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {save.isSuccess ? tc("saved") : tc("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-6 text-sm text-muted">
          <p className="font-medium text-foreground">{t("howItWorksTitle")}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t("howItWorks1")}</li>
            <li>{t("howItWorks2")}</li>
            <li>{t("howItWorks3")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
