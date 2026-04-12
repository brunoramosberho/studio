"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePosStore } from "@/store/pos-store";
import { CustomerStep } from "./customer-step";
import { CartStep } from "./cart-step";
import { PaymentStep } from "./payment-step";
import { ConfirmationStep } from "./confirmation-step";
import { cn } from "@/lib/utils";

export function PosDialog() {
  const { isOpen, closePOS, step, customer, setStep } = usePosStore();

  const title =
    step === "customer"
      ? "Punto de venta"
      : step === "cart"
        ? "Punto de venta"
        : step === "payment"
          ? "Punto de venta"
          : "Punto de venta";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && closePOS()}>
      <DialogContent
        className={cn(
          "p-8",
          step === "customer"
            ? "sm:max-w-3xl overflow-visible"
            : "max-h-[90vh] overflow-y-auto",
          step === "cart"
            ? "sm:max-w-4xl"
            : step === "confirmation"
              ? "sm:max-w-lg"
              : "sm:max-w-3xl",
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        {step !== "confirmation" && (
          <div className="flex items-center gap-1.5 py-1">
            <StepDot
              label="Cliente"
              active={step === "customer"}
              completed={step !== "customer" && !!customer}
              onClick={() => step !== "customer" && setStep("customer")}
            />
            <div className="h-px flex-1 bg-border/50" />
            <StepDot
              label="Carrito"
              active={step === "cart"}
              completed={step === "payment"}
              onClick={() => step === "payment" && setStep("cart")}
            />
            <div className="h-px flex-1 bg-border/50" />
            <StepDot
              label="Pago"
              active={step === "payment"}
              completed={false}
            />
          </div>
        )}

        {/* Steps */}
        <div className="min-h-0">
          {step === "customer" && (
            <div className="min-h-[420px] space-y-4">
              <CustomerStep />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="bg-admin text-white hover:bg-admin/90"
                  onClick={() => setStep("cart")}
                  disabled={!customer}
                >
                  Continuar
                </Button>
              </div>
            </div>
          )}

          {step === "cart" && <CartStep />}
          {step === "payment" && <PaymentStep />}
          {step === "confirmation" && <ConfirmationStep />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StepDot({
  label,
  active,
  completed,
  onClick,
}: {
  label: string;
  active: boolean;
  completed: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-admin/10 text-admin"
          : completed
            ? "text-admin/60 hover:text-admin cursor-pointer"
            : "text-muted cursor-default",
      )}
    >
      <div
        className={cn(
          "h-2 w-2 rounded-full transition-colors",
          active
            ? "bg-admin"
            : completed
              ? "bg-admin/40"
              : "bg-border",
        )}
      />
      {label}
    </button>
  );
}
