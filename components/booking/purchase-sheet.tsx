"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  CreditCard,
  LogIn,
  Ticket,
  X,
  Plus,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaymentForm } from "@/components/checkout/PaymentForm";
import type { Package } from "@prisma/client";

interface PurchaseSheetProps {
  open: boolean;
  onClose: () => void;
  pkg: Package;
  onSuccess?: () => void;
}

interface PaymentData {
  clientSecret: string;
  stripeAccountId: string;
  amount: number;
}

interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

const brandLabels: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "Amex",
  discover: "Discover",
};

type Step = "confirm" | "guest" | "processing" | "select-card" | "payment" | "done";

export function PurchaseSheet({
  open,
  onClose,
  pkg,
  onSuccess,
}: PurchaseSheetProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isLoggedIn = !!session?.user;

  const [step, setStep] = useState<Step>(isLoggedIn ? "confirm" : "guest");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [savedCards, setSavedCards] = useState<SavedCard[]>([]);
  const [payingWithCard, setPayingWithCard] = useState<string | null>(null);
  const purchaseInFlight = useRef(false);
  const [discountCode, setDiscountCode] = useState("");
  const [discountValidating, setDiscountValidating] = useState(false);
  const [discountResult, setDiscountResult] = useState<{
    valid: boolean;
    discountAmount?: number;
    finalAmount?: number;
    code?: string;
    type?: string;
    value?: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (open && isLoggedIn) {
      fetch("/api/stripe/payment-methods")
        .then((r) => (r.ok ? r.json() : []))
        .then(setSavedCards)
        .catch(() => setSavedCards([]));
    }
  }, [open, isLoggedIn]);

  function resetState() {
    setStep(isLoggedIn ? "confirm" : "guest");
    setGuestName("");
    setGuestEmail("");
    setError(null);
    setPaymentData(null);
    setPayingWithCard(null);
    setLoading(false);
    purchaseInFlight.current = false;
    setDiscountCode("");
    setDiscountResult(null);
    setDiscountValidating(false);
  }

  async function validateDiscount() {
    if (!discountCode.trim()) return;
    setDiscountValidating(true);
    setDiscountResult(null);
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: discountCode, packageId: pkg.id }),
      });
      const data = await res.json();
      setDiscountResult(data);
    } catch {
      setDiscountResult({ valid: false, error: "Error al validar" });
    } finally {
      setDiscountValidating(false);
    }
  }

  async function executePurchase() {
    if (purchaseInFlight.current) return;
    purchaseInFlight.current = true;
    setLoading(true);
    setError(null);
    setStep("processing");

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          ...(!isLoggedIn && { email: guestEmail, name: guestName }),
          ...(discountResult?.valid && discountCode && { discountCode }),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al procesar la compra");
        setStep(isLoggedIn ? "confirm" : "guest");
        setLoading(false);
        return;
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (data.requiresPayment && data.clientSecret && data.stripeAccountId) {
        setPaymentData({
          clientSecret: data.clientSecret,
          stripeAccountId: data.stripeAccountId,
          amount: data.amount ?? pkg.price,
        });
        if (savedCards.length > 0) {
          setStep("select-card");
        } else {
          setStep("payment");
        }
        setLoading(false);
        return;
      }

      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "AbortError"
        ? "La solicitud tardó demasiado. Intenta de nuevo."
        : "Error de conexión";
      setError(msg);
      setStep(isLoggedIn ? "confirm" : "guest");
    } finally {
      setLoading(false);
      purchaseInFlight.current = false;
    }
  }

  async function payWithSavedCard(paymentMethodId: string) {
    if (!paymentData) return;
    setPayingWithCard(paymentMethodId);
    setError(null);

    try {
      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          paymentMethodId,
          ...(discountResult?.valid && discountCode && { discountCode }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al procesar el pago");
        setPayingWithCard(null);
        return;
      }

      if (data.requiresPayment) {
        setPaymentData({
          clientSecret: data.clientSecret,
          stripeAccountId: data.stripeAccountId,
          amount: data.amount ?? pkg.price,
        });
        setStep("payment");
        setPayingWithCard(null);
        return;
      }

      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      onSuccess?.();
    } catch {
      setError("Error de conexión");
    } finally {
      setPayingWithCard(null);
    }
  }

  function formatPrice(p: Package) {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency: p.currency,
      minimumFractionDigits: 0,
    }).format(p.price);
  }

  if (!open) return null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-foreground/40 backdrop-blur-sm"
        onClick={step !== "processing" ? () => { resetState(); onClose(); } : undefined}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-[70] max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white shadow-warm-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag indicator (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Close button */}
        {step !== "processing" && (
          <button
            onClick={() => { resetState(); onClose(); }}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground sm:top-5"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="px-6 pb-8 pt-5">
          <AnimatePresence mode="wait">
            {/* ── Step: Confirm (logged in) ── */}
            {step === "confirm" && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="font-display text-xl font-bold text-foreground">
                  Confirmar compra
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Revisa los detalles de tu paquete
                </p>

                {error && (
                  <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="mt-5 rounded-2xl border border-accent/20 bg-accent/5 p-5">
                  <p className="font-display text-lg font-bold text-foreground">
                    {pkg.name}
                  </p>
                  {pkg.description && (
                    <p className="mt-1 text-xs text-muted">{pkg.description}</p>
                  )}
                  <div className="mt-4 flex items-end justify-between">
                    <div className="flex items-center gap-3 text-sm text-muted">
                      <span className="flex items-center gap-1">
                        <Ticket className="h-3.5 w-3.5" />
                        {pkg.credits === null
                          ? "Ilimitado"
                          : `${pkg.credits} clase${pkg.credits !== 1 ? "s" : ""}`}
                      </span>
                      <span>{pkg.validDays} días</span>
                    </div>
                    <p className="font-display text-2xl font-bold text-foreground">
                      {discountResult?.valid && discountResult.finalAmount != null ? (
                        <span className="flex items-center gap-2">
                          <span className="text-base line-through text-muted">{formatPrice(pkg)}</span>
                          {new Intl.NumberFormat("es", { style: "currency", currency: pkg.currency, minimumFractionDigits: 0 }).format(discountResult.finalAmount)}
                        </span>
                      ) : formatPrice(pkg)}
                    </p>
                  </div>
                </div>

                {/* Discount code */}
                <div className="mt-4">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Tag className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                      <Input
                        value={discountCode}
                        onChange={(e) => {
                          setDiscountCode(e.target.value.toUpperCase());
                          if (discountResult) setDiscountResult(null);
                        }}
                        placeholder="Codigo de descuento"
                        className="pl-9 font-mono text-sm"
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={validateDiscount}
                      disabled={!discountCode.trim() || discountValidating}
                    >
                      {discountValidating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Aplicar"
                      )}
                    </Button>
                  </div>
                  {discountResult && (
                    <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${discountResult.valid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                      {discountResult.valid ? (
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          {discountResult.type === "PERCENTAGE"
                            ? `${discountResult.value}% de descuento aplicado`
                            : `${new Intl.NumberFormat("es", { style: "currency", currency: pkg.currency, minimumFractionDigits: 0 }).format(discountResult.discountAmount || 0)} de descuento aplicado`}
                        </span>
                      ) : (
                        discountResult.error
                      )}
                    </div>
                  )}
                </div>

                <Button
                  size="lg"
                  onClick={executePurchase}
                  disabled={loading}
                  className="mt-6 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <CreditCard className="h-4 w-4" />
                  Pagar {discountResult?.valid && discountResult.finalAmount != null
                    ? new Intl.NumberFormat("es", { style: "currency", currency: pkg.currency, minimumFractionDigits: 0 }).format(discountResult.finalAmount)
                    : formatPrice(pkg)}
                </Button>
                <p className="mt-2 text-center text-[10px] text-muted/60">
                  Pago seguro · Los créditos se activan al instante
                </p>
              </motion.div>
            )}

            {/* ── Step: Guest info ── */}
            {step === "guest" && (
              <motion.div
                key="guest"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="font-display text-xl font-bold text-foreground">
                  Comprar {pkg.name}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  {formatPrice(pkg)} · {pkg.credits === null ? "Ilimitado" : `${pkg.credits} clase${pkg.credits !== 1 ? "s" : ""}`} · {pkg.validDays} días
                </p>

                {error && (
                  <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    executePurchase();
                  }}
                  className="mt-5 space-y-3"
                >
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Nombre</label>
                    <Input
                      placeholder="Tu nombre"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">Email</label>
                    <Input
                      type="email"
                      placeholder="tu@correo.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      required
                    />
                  </div>

                  {/* Discount code (guest step) */}
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Tag className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                        <Input
                          value={discountCode}
                          onChange={(e) => {
                            setDiscountCode(e.target.value.toUpperCase());
                            if (discountResult) setDiscountResult(null);
                          }}
                          placeholder="Codigo de descuento"
                          className="pl-9 font-mono text-sm"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={validateDiscount}
                        disabled={!discountCode.trim() || discountValidating}
                      >
                        {discountValidating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Aplicar"
                        )}
                      </Button>
                    </div>
                    {discountResult && (
                      <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${discountResult.valid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {discountResult.valid ? (
                          <span className="flex items-center gap-1">
                            <Check className="h-3 w-3" />
                            {discountResult.type === "PERCENTAGE"
                              ? `${discountResult.value}% de descuento aplicado`
                              : `Descuento aplicado`}
                          </span>
                        ) : (
                          discountResult.error
                        )}
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading || !guestName.trim() || !guestEmail.trim()}
                    className="mt-4 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    <CreditCard className="h-4 w-4" />
                    Pagar {discountResult?.valid && discountResult.finalAmount != null
                      ? new Intl.NumberFormat("es", { style: "currency", currency: pkg.currency, minimumFractionDigits: 0 }).format(discountResult.finalAmount)
                      : formatPrice(pkg)}
                  </Button>
                  <p className="text-center text-[10px] text-muted/60">
                    Pago seguro · Podrás iniciar sesión después con este email
                  </p>
                </form>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => signIn("google", { callbackUrl: "/packages" })}
                    className="inline-flex items-center gap-1.5 text-xs text-accent transition-colors hover:text-accent/80"
                  >
                    <LogIn className="h-3.5 w-3.5" />
                    Ya tengo cuenta · Iniciar sesión
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Step: Processing ── */}
            {step === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="mt-4 text-sm font-medium text-muted">
                  Procesando tu compra...
                </p>
              </motion.div>
            )}

            {/* ── Step: Select saved card ── */}
            {step === "select-card" && paymentData && (
              <motion.div
                key="select-card"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="font-display text-xl font-bold text-foreground">
                  Método de pago
                </h2>
                <p className="mt-1 mb-5 text-sm text-muted">
                  {pkg.name} · {new Intl.NumberFormat("es", {
                    style: "currency",
                    currency: pkg.currency,
                    minimumFractionDigits: 0,
                  }).format(paymentData.amount)}
                </p>

                {error && (
                  <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  {savedCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => payWithSavedCard(card.id)}
                      disabled={!!payingWithCard}
                      className="flex w-full items-center gap-3 rounded-2xl border border-border/40 bg-white px-4 py-3.5 text-left transition-colors active:bg-surface disabled:opacity-60"
                    >
                      <div className="flex h-9 w-12 items-center justify-center rounded-lg border border-border/30 bg-surface text-[10px] font-bold uppercase tracking-wider text-muted">
                        {brandLabels[card.brand] ?? card.brand}
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-medium text-foreground">
                          ····  {card.last4}
                        </p>
                        <p className="text-[11px] text-muted">
                          {String(card.expMonth).padStart(2, "0")}/{String(card.expYear).slice(-2)}
                        </p>
                      </div>
                      {payingWithCard === card.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted" />
                      ) : (
                        <CreditCard className="h-4 w-4 text-muted" />
                      )}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setStep("payment")}
                  disabled={!!payingWithCard}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border/60 py-3.5 text-[13px] font-medium text-muted transition-colors active:bg-surface"
                >
                  <Plus className="h-4 w-4" />
                  Usar otra tarjeta
                </button>
              </motion.div>
            )}

            {/* ── Step: Payment (Stripe Elements) ── */}
            {step === "payment" && paymentData && (
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
                  {pkg.name} · {new Intl.NumberFormat("es", {
                    style: "currency",
                    currency: pkg.currency,
                    minimumFractionDigits: 0,
                  }).format(paymentData.amount)}
                </p>

                <PaymentForm
                  clientSecret={paymentData.clientSecret}
                  stripeAccountId={paymentData.stripeAccountId}
                  amount={paymentData.amount}
                  currency={pkg.currency}
                  onSuccess={() => {
                    setStep("done");
                    queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
                    onSuccess?.();
                  }}
                />
              </motion.div>
            )}

            {/* ── Step: Done ── */}
            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="flex flex-col items-center py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1, damping: 12 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100"
                >
                  <Check className="h-8 w-8 text-green-600" />
                </motion.div>

                <h2 className="mt-5 font-display text-xl font-bold text-foreground">
                  ¡Paquete activado!
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Tus créditos ya están disponibles
                </p>

                <div className="mt-4 flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2">
                  <Ticket className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-accent">
                    {pkg.name} · {pkg.credits === null ? "Ilimitado" : `${pkg.credits} créditos`}
                  </span>
                </div>

                {isLoggedIn ? (
                  <Button
                    onClick={() => router.push("/schedule")}
                    className="mt-8 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                    size="lg"
                  >
                    Reservar una clase
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => signIn("google", { callbackUrl: "/schedule" })}
                      className="mt-8 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                      size="lg"
                    >
                      <LogIn className="h-4 w-4" />
                      Iniciar sesión y reservar
                    </Button>
                    <button
                      onClick={() => { resetState(); onClose(); }}
                      className="mt-3 text-xs text-muted transition-colors hover:text-foreground"
                    >
                      Cerrar
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
