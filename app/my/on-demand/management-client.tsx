"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Loader2, Video as VideoIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubscribeOnDemandSheet } from "@/components/on-demand/subscribe-sheet";

interface SubInfo {
  id: string;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  package: {
    id: string;
    name: string;
    type: string;
    price: number;
    currency: string;
    recurringInterval: string | null;
    includesOnDemand: boolean;
  };
}

interface SubscriptionResponse {
  onDemandSubscription: SubInfo | null;
  bundledSubscription: SubInfo | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function OnDemandManagementClient() {
  const t = useTranslations("onDemand");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["on-demand-subscription"],
    queryFn: async () => {
      const res = await fetch("/api/on-demand/subscription");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as SubscriptionResponse;
    },
  });

  const [showSubscribe, setShowSubscribe] = useState(false);

  const action = useMutation({
    mutationFn: async (op: "cancel" | "reactivate") => {
      const res = await fetch("/api/on-demand/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: op }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["on-demand-subscription"] });
      qc.invalidateQueries({ queryKey: ["on-demand-catalog"] });
    },
  });

  const sub = data?.onDemandSubscription;
  const bundled = data?.bundledSubscription;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("manageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("manageSubtitle")}</p>
      </header>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : sub ? (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-foreground">
                  {sub.package.name}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {sub.package.price} {sub.package.currency} /{" "}
                  {sub.package.recurringInterval ?? "month"}
                </p>
              </div>
              <Badge
                variant={sub.status === "active" ? "default" : "outline"}
                className={
                  sub.status === "active"
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                    : ""
                }
              >
                {sub.status === "active"
                  ? t("subActive")
                  : sub.status === "past_due"
                  ? t("subPastDue")
                  : sub.status === "paused"
                  ? t("subPaused")
                  : sub.status === "canceled"
                  ? t("subCanceled")
                  : sub.status}
              </Badge>
            </div>

            <div className="text-sm text-muted">
              {sub.cancelAtPeriodEnd ? (
                <>
                  {t("accessUntil")}{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(sub.currentPeriodEnd)}
                  </span>
                </>
              ) : sub.status === "active" ? (
                <>
                  {t("renewsOn")}{" "}
                  <span className="font-medium text-foreground">
                    {formatDate(sub.currentPeriodEnd)}
                  </span>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/on-demand">
                <Button variant="outline" className="gap-2">
                  <VideoIcon className="h-4 w-4" />
                  {t("openCatalog")}
                </Button>
              </Link>
              {sub.cancelAtPeriodEnd ? (
                <Button
                  onClick={() => action.mutate("reactivate")}
                  disabled={action.isPending}
                  className="gap-2"
                >
                  {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("reactivate")}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (confirm(t("confirmCancel"))) action.mutate("cancel");
                  }}
                  disabled={action.isPending}
                  className="gap-2"
                >
                  {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("cancelSubscription")}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : bundled ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-base font-semibold text-foreground">
              {t("bundledTitle")}
            </p>
            <p className="text-sm text-muted">
              {t("bundledDesc", { packageName: bundled.package.name })}
            </p>
            <Link href="/on-demand">
              <Button className="gap-2">
                <VideoIcon className="h-4 w-4" />
                {t("openCatalog")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-base font-semibold text-foreground">
              {t("noSubscriptionTitle")}
            </p>
            <p className="text-sm text-muted">{t("noSubscriptionDesc")}</p>
            <div className="flex gap-2">
              <Button onClick={() => setShowSubscribe(true)}>
                {t("subscribeCTA")}
              </Button>
              <Link href="/on-demand">
                <Button variant="outline">{t("openCatalog")}</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <SubscribeOnDemandSheet
        open={showSubscribe}
        onOpenChange={setShowSubscribe}
      />
    </div>
  );
}
