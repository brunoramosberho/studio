"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Repeat, ShieldCheck, CalendarClock } from "lucide-react";
import { PaymentForm } from "@/components/checkout/PaymentForm";
import type { Package } from "@prisma/client";

interface SubscribeSheetProps {
  open: boolean;
  onClose: () => void;
  pkg: Package;
  classId: string;
  spotNumber?: number | null;
  privacy: "PUBLIC" | "PRIVATE";
  /** Guest identity collected upstream in the booking sheet (omitted when logged in). */
  guest?: { name: string; email: string; phone?: string };
}

type Step = "info" | "payment" | "processing";

interface InitData {
  clientSecret: string;
  stripeAccountId: string;
  amount: number;
  currency: string;
  subscriptionId: string;
}

const INTERVAL_LABEL: Record<string, string> = {
  day: "día",
  week: "semana",
  month: "mes",
  year: "año",
};

/**
 * Inline subscribe-and-book for the (guest) booking flow. Mirrors PurchaseSheet:
 * shows the plan + commitment, creates the Stripe subscription via
 * /api/book-and-subscribe, then confirms the first invoice through PaymentForm.
 * On success Stripe redirects to /payment/success?subscribe=1… which finalizes
 * the membership and books the class — so the member never leaves /class/[id].
 */
export function SubscribeSheet({
  open,
  onClose,
  pkg,
  classId,
  spotNumber,
  privacy,
  guest,
}: SubscribeSheetProps) {
  const [step, setStep] = useState<Step>("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initData, setInitData] = useState<InitData | null>(null);

  const interval = INTERVAL_LABEL[pkg.recurringInterval ?? "month"] ?? "mes";
  const commitment =
    (pkg as { minCommitmentMonths?: number | null }).minCommitmentMonths ?? 0;
  const priceLabel = new Intl.NumberFormat("es", {
    style: "currency",
    currency: pkg.currency,
    minimumFractionDigits: 0,
  }).format(pkg.price);

  function close() {
    setStep("info");
    setError(null);
    setInitData(null);
    setLoading(false);
    onClose();
  }

  async function startSubscription() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/book-and-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          classId,
          ...(guest
            ? { email: guest.email, name: guest.name, phone: guest.phone }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo iniciar la suscripción.");
        setLoading(false);
        return;
      }

      // Free / trial plan — already active, no payment. Book directly.
      if (data.status === "active") {
        setStep("processing");
        const fin = await fetch("/api/book-and-subscribe/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscriptionId: data.subscriptionId,
            classId,
            privacy,
            ...(spotNumber != null && { spotNumber }),
          }),
        });
        const finData = await fin.json();
        if (!fin.ok) {
          setError(finData.error || "No se pudo confirmar la reserva.");
          setStep("info");
          setLoading(false);
          return;
        }
        const url = new URL(`/class/${classId}`, window.location.origin);
        url.searchParams.set("bookedAfterPayment", "1");
        const bookedSpot = finData.spotNumber ?? spotNumber;
        if (bookedSpot != null) url.searchParams.set("spot", String(bookedSpot));
        if (guest?.email) url.searchParams.set("email", guest.email);
        window.location.href = `${url.pathname}${url.search}`;
        return;
      }

      if (data.clientSecret && data.stripeAccountId) {
        setInitData({
          clientSecret: data.clientSecret,
          stripeAccountId: data.stripeAccountId,
          amount: data.amount,
          currency: data.currency ?? pkg.currency,
          subscriptionId: data.subscriptionId,
        });
        setStep("payment");
        setLoading(false);
        return;
      }

      setError("No se pudo iniciar el pago. Intenta de nuevo.");
      setLoading(false);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
      setLoading(false);
    }
  }

  if (!open) return null;

  const returnUrl = initData
    ? `${window.location.origin}/payment/success?subscribe=1&subscriptionId=${encodeURIComponent(
        initData.subscriptionId,
      )}&classId=${encodeURIComponent(classId)}&privacy=${privacy}${
        spotNumber != null ? `&spotNumber=${spotNumber}` : ""
      }`
    : undefined;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-foreground/40 backdrop-blur-sm"
        onClick={step !== "processing" ? close : undefined}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-card shadow-warm-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag indicator (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {step !== "processing" && (
          <button
            onClick={close}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground sm:top-5"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="px-6 pb-8 pt-5">
          <AnimatePresence mode="wait">
            {/* ── Step: Plan + commitment ── */}
            {step === "info" && (
              <motion.div
                key="info"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="font-display text-xl font-bold text-foreground">
                  {pkg.name}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {priceLabel} <span className="text-muted">/ {interval}</span>
                </p>

                {pkg.description && (
                  <p className="mt-4 text-sm text-foreground/80">
                    {pkg.description}
                  </p>
                )}

                <div className="mt-5 space-y-2.5 rounded-2xl bg-surface p-4 text-sm">
                  <div className="flex items-start gap-2.5">
                    <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <span className="text-foreground/80">
                      Se renueva automáticamente cada {interval}
                      {commitment > 0 ? "; cancela tras la permanencia" : "; cancela cuando quieras"}.
                    </span>
                  </div>
                  {commitment > 0 && (
                    <div className="flex items-start gap-2.5">
                      <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                      <span className="text-foreground/80">
                        Permanencia mínima de {commitment}{" "}
                        {commitment === 1 ? "mes" : "meses"}.
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                    <span className="text-foreground/80">
                      Tu lugar se reserva en cuanto se confirme el primer pago.
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <button
                  onClick={startSubscription}
                  disabled={loading}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground py-4 text-[15px] font-semibold text-background transition-opacity disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Un momento…
                    </>
                  ) : (
                    "Continuar al pago"
                  )}
                </button>
              </motion.div>
            )}

            {/* ── Step: Payment ── */}
            {step === "payment" && initData && (
              <motion.div
                key="payment"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="font-display text-xl font-bold text-foreground">
                  Datos de pago
                </h2>
                <p className="mt-1 mb-5 text-sm text-muted">
                  {pkg.name} · {priceLabel} / {interval}
                </p>
                <PaymentForm
                  clientSecret={initData.clientSecret}
                  stripeAccountId={initData.stripeAccountId}
                  amount={initData.amount}
                  currency={initData.currency}
                  returnUrl={returnUrl}
                />
              </motion.div>
            )}

            {/* ── Step: Processing (free/trial direct book) ── */}
            {step === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-3 py-12"
              >
                <Loader2 className="h-8 w-8 animate-spin text-muted" />
                <p className="text-sm text-muted">Confirmando tu reserva…</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
