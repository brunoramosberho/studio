"use client";

import {
  CheckCircle2,
  Receipt,
  CreditCard,
  Banknote,
  Smartphone,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePosStore } from "@/store/pos-store";
import { formatCurrency } from "@/lib/utils";
import { useTranslations } from "next-intl";

const paymentMethodLabelKeys: Record<string, { labelKey: "savedCard" | "bankTerminal" | "cashPayment"; icon: typeof CreditCard }> = {
  saved_card: { labelKey: "savedCard", icon: CreditCard },
  terminal: { labelKey: "bankTerminal", icon: Smartphone },
  cash: { labelKey: "cashPayment", icon: Banknote },
};

export function ConfirmationStep() {
  const t = useTranslations("pos");
  const tc = useTranslations("common");
  const { saleResult, closePOS, openPOS } = usePosStore();

  if (!saleResult) return null;

  const methodDef = paymentMethodLabelKeys[saleResult.paymentMethod] ?? {
    labelKey: saleResult.paymentMethod as "savedCard",
    icon: Receipt,
  };
  const MethodIcon = methodDef.icon;

  const displayTotal =
    saleResult.total > 0
      ? saleResult.total
      : saleResult.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="space-y-5">
      {/* Success header */}
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <div className="text-center">
          <h3 className="font-display text-lg font-bold text-foreground">
            {t("saleCompleted")}
          </h3>
          <p className="text-sm text-muted">
            {t("saleFor")}{" "}
            <span className="font-medium text-foreground">
              {saleResult.customerName}
            </span>
          </p>
        </div>
      </div>

      {/* Class reservation banner */}
      {saleResult.selectedClass && (
        <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50/60 px-4 py-3">
          <CalendarDays className="h-4 w-4 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-green-800">
              {saleResult.selectedClass.label}
            </p>
            <p className="text-xs text-green-600">
              {t("classReserved")}
            </p>
          </div>
        </div>
      )}

      {/* Items */}
      {saleResult.items.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-surface/30 divide-y divide-border/40">
          {saleResult.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-muted">
                  {item.type === "product" && item.quantity > 1
                    ? `${item.quantity} x ${formatCurrency(item.price, item.currency)}`
                    : formatCurrency(item.price, item.currency)}
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {formatCurrency(item.price * item.quantity, item.currency)}
              </span>
            </div>
          ))}

          {/* Total */}
          <div className="flex items-center justify-between px-4 py-3 bg-foreground/[0.02]">
            <span className="text-sm font-bold">{t("total")}</span>
            <span className="text-lg font-bold">
              {displayTotal > 0
                ? formatCurrency(displayTotal, saleResult.currency)
                : tc("free")}
            </span>
          </div>
        </div>
      )}

      {/* Payment method */}
      {displayTotal > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-card px-4 py-3">
          <MethodIcon className="h-4 w-4 text-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{t("paymentMethod")}</p>
            <p className="text-sm font-medium">{t(methodDef.labelKey)}</p>
          </div>
        </div>
      )}

      {/* Note about email */}
      {displayTotal > 0 && (
        <p className="text-center text-xs text-muted">
          {t("receiptSentEmail")}
        </p>
      )}

      {/* Actions */}
      <div className="flex justify-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={closePOS}>
          {tc("close")}
        </Button>
        <Button
          size="sm"
          className="bg-admin text-white hover:bg-admin/90"
          onClick={() => {
            closePOS();
            setTimeout(() => openPOS(), 100);
          }}
        >
          {t("newSale")}
        </Button>
      </div>
    </div>
  );
}
