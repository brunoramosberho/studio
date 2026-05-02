"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PaymentForm } from "@/components/checkout/PaymentForm";

interface SubscribeOnDemandSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

interface CatalogConfig {
  config: {
    enabled: boolean;
    description: string | null;
    package: {
      id: string;
      name: string;
      price: number;
      currency: string;
      recurringInterval: string | null;
    } | null;
  } | null;
}

interface SubscribeResponse {
  stripeSubscriptionId: string;
  status: string;
  clientSecret?: string;
  stripeAccountId: string | null;
}

type Step = "confirm" | "processing" | "payment" | "done" | "error";

export function SubscribeOnDemandSheet({
  open,
  onOpenChange,
}: SubscribeOnDemandSheetProps) {
  const t = useTranslations("onDemand");
  const tc = useTranslations("common");
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["on-demand-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/on-demand/catalog");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as CatalogConfig;
    },
    enabled: open,
  });

  const [step, setStep] = useState<Step>("confirm");
  const [error, setError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{
    clientSecret: string;
    stripeAccountId: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("confirm");
      setError(null);
      setPaymentInfo(null);
    }
  }, [open]);

  async function startSubscription() {
    setStep("processing");
    setError(null);
    try {
      const res = await fetch("/api/on-demand/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "subscription_failed");
      }
      const json = (await res.json()) as SubscribeResponse;
      if (json.clientSecret && json.stripeAccountId) {
        setPaymentInfo({
          clientSecret: json.clientSecret,
          stripeAccountId: json.stripeAccountId,
        });
        setStep("payment");
      } else {
        setStep("done");
        qc.invalidateQueries({ queryKey: ["on-demand-catalog"] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "subscription_failed");
      setStep("error");
    }
  }

  const pkg = data?.config?.package ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("subscribeTitle")}</DialogTitle>
          <DialogDescription>
            {data?.config?.description ?? t("subscribeDesc")}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !pkg ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : step === "confirm" ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-surface p-4">
              <p className="text-sm font-medium text-foreground">{pkg.name}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {pkg.price} {pkg.currency}
                <span className="ml-1 text-sm font-normal text-muted">
                  / {pkg.recurringInterval ?? "month"}
                </span>
              </p>
            </div>
            <Button onClick={startSubscription} className="w-full">
              {t("subscribeCTA")}
            </Button>
          </div>
        ) : step === "processing" ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted" />
          </div>
        ) : step === "payment" && paymentInfo ? (
          <PaymentForm
            clientSecret={paymentInfo.clientSecret}
            stripeAccountId={paymentInfo.stripeAccountId}
            amount={pkg.price}
            currency={pkg.currency}
            onSuccess={() => {
              setStep("done");
              qc.invalidateQueries({ queryKey: ["on-demand-catalog"] });
              qc.invalidateQueries({ queryKey: ["on-demand-subscription"] });
              setTimeout(() => onOpenChange(false), 1500);
            }}
          />
        ) : step === "done" ? (
          <div className="space-y-3 py-4 text-center">
            <p className="text-base font-semibold text-foreground">{t("subscribeSuccess")}</p>
            <p className="text-sm text-muted">{t("subscribeSuccessDesc")}</p>
          </div>
        ) : (
          <div className="space-y-3 py-4 text-center">
            <p className="text-base font-semibold text-red-600">{t("subscribeError")}</p>
            <p className="text-sm text-muted">{error}</p>
            <Button variant="outline" onClick={() => setStep("confirm")}>
              {tc("tryAgain")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
