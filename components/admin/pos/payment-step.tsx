"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
  CheckCircle2,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePosStore, type PosPaymentMethod } from "@/store/pos-store";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const PAYMENT_METHODS: {
  key: PosPaymentMethod;
  label: string;
  description: string;
  icon: typeof CreditCard;
}[] = [
  {
    key: "saved_card",
    label: "Tarjeta guardada",
    description: "Cobrar con tarjeta registrada del cliente",
    icon: CreditCard,
  },
  {
    key: "terminal",
    label: "Terminal bancaria",
    description: "Cobrar con terminal física (TPV)",
    icon: Smartphone,
  },
  {
    key: "cash",
    label: "Efectivo",
    description: "Registrar pago en efectivo",
    icon: Banknote,
  },
];

function formatBrand(brand: string): string {
  const brands: Record<string, string> = {
    visa: "Visa",
    mastercard: "Mastercard",
    amex: "Amex",
    discover: "Discover",
  };
  return brands[brand] ?? brand;
}

export function PaymentStep() {
  const {
    customer,
    cart,
    selectedClass,
    cartTotal,
    setStep,
    setSaleResult,
    closePOS,
  } = usePosStore();

  const [selectedMethod, setSelectedMethod] =
    useState<PosPaymentMethod>("saved_card");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const total = cartTotal();
  const currency = cart[0]?.currency ?? "EUR";
  const hasPaidItems = cart.some((i) => i.price > 0);

  const { data: savedCards = [], isLoading: cardsLoading } = useQuery<
    SavedCard[]
  >({
    queryKey: ["pos-saved-cards", customer?.id],
    queryFn: async () => {
      if (!customer) return [];
      const res = await fetch(
        `/api/admin/pos/payment-methods?memberId=${customer.id}`,
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customer && hasPaidItems,
    staleTime: 30_000,
  });

  const hasCards = savedCards.length > 0;
  const cardsReady = !cardsLoading;

  useEffect(() => {
    if (cardsReady && !hasCards && selectedMethod === "saved_card") {
      setSelectedMethod("terminal");
    }
  }, [cardsReady, hasCards, selectedMethod]);

  const saleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/pos/sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer!.id,
          items: cart.map((item) => ({
            type: item.type,
            referenceId: item.referenceId,
            name: item.name,
            price: item.price,
            currency: item.currency,
            quantity: item.quantity,
            metadata: item.metadata,
          })),
          selectedClass: selectedClass
            ? {
                classId: selectedClass.classId,
                classTypeId: selectedClass.classTypeId,
                classTypeName: selectedClass.classTypeName,
                label: selectedClass.label,
                startsAt: selectedClass.startsAt,
                hasCredits: selectedClass.hasCredits,
                packageId: selectedClass.packageId,
                spotNumber: selectedClass.spotNumber,
              }
            : undefined,
          paymentMethod: hasPaidItems ? selectedMethod : "cash",
          paymentMethodId:
            selectedMethod === "saved_card" ? selectedCardId : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Error al procesar la venta");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.requiresConfirmation) {
        toast.info("El pago requiere confirmación adicional del cliente.");
        return;
      }

      const saleTotal = typeof data.total === "number" ? data.total : total;
      setSaleResult({
        id: data.saleId,
        total: saleTotal,
        currency: data.currency ?? currency,
        items: cart,
        selectedClass,
        paymentMethod: hasPaidItems ? selectedMethod : "cash",
        customerName: data.customerName ?? customer?.name ?? "Cliente",
      });
      setStep("confirmation");
      toast.success("Venta procesada correctamente");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const canProcess =
    !hasPaidItems ||
    selectedMethod === "terminal" ||
    selectedMethod === "cash" ||
    (selectedMethod === "saved_card" && selectedCardId);

  return (
    <div className="space-y-5">
      <h3 className="font-display text-base font-bold">Método de pago</h3>

      {/* Order summary */}
      <div className="rounded-lg border border-border/60 bg-surface/30 px-4 py-3 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">
            {cart.length > 0
              ? `${cart.length} artículo${cart.length !== 1 ? "s" : ""} para `
              : "Venta para "}
            <span className="font-medium text-foreground">
              {customer?.name ?? "Cliente"}
            </span>
          </span>
          <span className="text-lg font-bold">
            {total > 0 ? formatCurrency(total, currency) : "Gratis"}
          </span>
        </div>
        {selectedClass && (
          <p className="text-xs text-muted">
            + Reserva: {selectedClass.label}
          </p>
        )}
      </div>

      {/* Only show payment methods if there are paid items */}
      {hasPaidItems ? (
        <>
          {/* Payment method selection */}
          <div className="space-y-2">
            {PAYMENT_METHODS.map((method) => {
              const isCardOption = method.key === "saved_card";
              const cardDisabled = isCardOption && cardsReady && !hasCards;
              const isSelected = selectedMethod === method.key;

              return (
                <div key={method.key}>
                  <button
                    onClick={() => !cardDisabled && setSelectedMethod(method.key)}
                    disabled={cardDisabled}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-all",
                      cardDisabled
                        ? "cursor-not-allowed border-border/40 bg-surface/30 opacity-60"
                        : isSelected
                          ? "border-admin/30 bg-admin/5 ring-1 ring-admin/10"
                          : "border-border/60 bg-white hover:bg-surface/50",
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        isSelected ? "bg-admin/10" : "bg-surface",
                      )}
                    >
                      <method.icon
                        className={cn(
                          "h-4.5 w-4.5",
                          isSelected ? "text-admin" : "text-muted",
                        )}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          isSelected && "text-admin",
                        )}
                      >
                        {method.label}
                      </p>
                      {cardDisabled ? (
                        <p className="text-xs text-orange-600">
                          Este cliente no tiene tarjetas guardadas
                        </p>
                      ) : isCardOption && cardsLoading ? (
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Verificando tarjetas...
                        </p>
                      ) : (
                        <p className="text-xs text-muted">{method.description}</p>
                      )}
                    </div>
                    <div
                      className={cn(
                        "h-4 w-4 shrink-0 rounded-full border-2 transition-colors",
                        cardDisabled
                          ? "border-border/40"
                          : isSelected
                            ? "border-admin bg-admin"
                            : "border-border",
                      )}
                    >
                      {isSelected && !cardDisabled && (
                        <div className="flex h-full items-center justify-center">
                          <div className="h-1.5 w-1.5 rounded-full bg-white" />
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Saved cards list — shown inline under the option when selected */}
                  {isCardOption && isSelected && hasCards && (
                    <div className="mt-2 ml-12 space-y-1">
                      {savedCards.map((card) => (
                        <button
                          key={card.id}
                          onClick={() => setSelectedCardId(card.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                            selectedCardId === card.id
                              ? "border-admin/30 bg-admin/5"
                              : "border-border/50 bg-white hover:bg-surface/50",
                          )}
                        >
                          <CreditCard
                            className={cn(
                              "h-4 w-4 shrink-0",
                              selectedCardId === card.id
                                ? "text-admin"
                                : "text-muted",
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {formatBrand(card.brand)} •••• {card.last4}
                            </p>
                            <p className="text-xs text-muted">
                              Expira {card.expMonth}/{card.expYear}
                            </p>
                          </div>
                          {selectedCardId === card.id && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-admin" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/60 px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
          <p className="text-xs text-green-700">
            Todos los artículos son reservas con créditos. No se requiere pago.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => setStep("cart")}>
          Volver al carrito
        </Button>
        <Button
          size="sm"
          className="bg-admin text-white hover:bg-admin/90"
          onClick={() => saleMutation.mutate()}
          disabled={!canProcess || saleMutation.isPending}
        >
          {saleMutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          {hasPaidItems
            ? `Cobrar ${formatCurrency(total, currency)}`
            : "Confirmar reserva"}
        </Button>
      </div>
    </div>
  );
}
