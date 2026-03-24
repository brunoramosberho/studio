"use client";

import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Package } from "@prisma/client";

interface PurchaseSheetProps {
  open: boolean;
  onClose: () => void;
  pkg: Package;
  onSuccess?: () => void;
}

type Step = "confirm" | "guest" | "processing" | "done";

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

  function resetState() {
    setStep(isLoggedIn ? "confirm" : "guest");
    setGuestName("");
    setGuestEmail("");
    setError(null);
    setLoading(false);
  }

  async function executePurchase() {
    setLoading(true);
    setError(null);
    setStep("processing");

    try {
      const res = await fetch("/api/packages/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          ...(!isLoggedIn && { email: guestEmail, name: guestName }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al procesar la compra");
        setStep(isLoggedIn ? "confirm" : "guest");
        setLoading(false);
        return;
      }

      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      onSuccess?.();
    } catch {
      setError("Error de conexión");
      setStep(isLoggedIn ? "confirm" : "guest");
    } finally {
      setLoading(false);
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
        className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"
        onClick={step !== "processing" ? () => { resetState(); onClose(); } : undefined}
      />

      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white pb-safe shadow-warm-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
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
                      {formatPrice(pkg)}
                    </p>
                  </div>
                </div>

                <Button
                  size="lg"
                  onClick={executePurchase}
                  disabled={loading}
                  className="mt-6 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <CreditCard className="h-4 w-4" />
                  Pagar {formatPrice(pkg)}
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

                  <Button
                    type="submit"
                    size="lg"
                    disabled={loading || !guestName.trim() || !guestEmail.trim()}
                    className="mt-4 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                  >
                    <CreditCard className="h-4 w-4" />
                    Pagar {formatPrice(pkg)}
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
