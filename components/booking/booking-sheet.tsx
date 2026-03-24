"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Check,
  ChevronLeft,
  Ticket,
  Sparkles,
  CreditCard,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatTime } from "@/lib/utils";
import type { Package } from "@prisma/client";

type Step = "package" | "pay" | "booking" | "done";

interface BookingSheetProps {
  open: boolean;
  onClose: () => void;
  classId: string;
  spotNumber: number;
  className: string;
  classTime: string;
  privacy: "PUBLIC" | "PRIVATE";
  onSuccess: () => void;
}

export function BookingSheet({
  open,
  onClose,
  classId,
  spotNumber,
  className,
  classTime,
  privacy,
  onSuccess,
}: BookingSheetProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const isLoggedIn = !!session?.user;

  const [step, setStep] = useState<Step>("package");
  const [selectedPkg, setSelectedPkg] = useState<Package | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    bookingId: string;
    spotNumber: number;
    packageName: string;
  } | null>(null);

  const { data: allPackages = [] } = useQuery<Package[]>({
    queryKey: ["packages-catalog"],
    queryFn: async () => {
      const res = await fetch("/api/packages");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open,
  });

  const { data: myPackages = [] } = useQuery<{ id: string }[]>({
    queryKey: ["packages", "mine"],
    queryFn: async () => {
      const res = await fetch("/api/packages/mine");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && isLoggedIn,
  });

  const isReturningUser = isLoggedIn && myPackages.length > 0;
  const packages = allPackages.filter((p) => !(p.isPromo && isReturningUser));

  useEffect(() => {
    if (open) {
      setStep("package");
      setSelectedPkg(null);
      setGuestName("");
      setGuestEmail("");
      setError(null);
      setResult(null);
      setLoading(false);
    }
  }, [open]);

  function handleSelectPackage(pkg: Package) {
    setSelectedPkg(pkg);
    setError(null);
    if (isLoggedIn) {
      executeBooking(pkg);
    } else {
      setStep("pay");
    }
  }

  async function handlePaySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPkg) return;
    executeBooking(selectedPkg);
  }

  async function executeBooking(pkg: Package) {
    setLoading(true);
    setError(null);
    setStep("booking");

    try {
      const payload: Record<string, unknown> = {
        classId,
        packageId: pkg.id,
        spotNumber,
        privacy,
      };

      if (!isLoggedIn) {
        payload.email = guestEmail;
        payload.name = guestName;
      }

      const res = await fetch("/api/book-and-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al reservar");
        setStep(isLoggedIn ? "package" : "pay");
        setLoading(false);
        return;
      }

      setResult({
        bookingId: data.bookingId,
        spotNumber: data.spotNumber,
        packageName: data.packageName,
      });
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["classes"] });
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      onSuccess();
    } catch {
      setError("Error de conexión");
      setStep(isLoggedIn ? "package" : "pay");
    } finally {
      setLoading(false);
    }
  }

  function formatPrice(pkg: Package) {
    return new Intl.NumberFormat("es", {
      style: "currency",
      currency: pkg.currency,
      minimumFractionDigits: 0,
    }).format(pkg.price);
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"
        onClick={step !== "booking" ? onClose : undefined}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-3xl bg-white pb-safe shadow-warm-lg sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85vh] sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
      >
        {/* Drag indicator (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="px-6 pb-2 pt-4">
          <div className="flex items-center justify-between">
            {step === "pay" && (
              <button
                onClick={() => setStep("package")}
                className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </button>
            )}
            <div className={cn(step !== "pay" && "flex-1")}>
              <p className="text-center text-xs text-muted">
                {className} · {formatTime(classTime)} · Lugar #{spotNumber}
              </p>
            </div>
            {step !== "pay" && <div className="w-12" />}
          </div>
        </div>

        <div className="px-6 pb-8">
          <AnimatePresence mode="wait">
            {/* ── Step: Package select ── */}
            {step === "package" && (
              <motion.div
                key="package"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="mb-1 font-display text-xl font-bold text-foreground">
                  Elige tu paquete
                </h2>
                <p className="mb-5 text-sm text-muted">
                  Selecciona un paquete para reservar tu lugar
                </p>

                {error && (
                  <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <div className="space-y-2.5">
                  {packages.map((pkg, i) => {
                    const isSingle = pkg.credits === 1;
                    return (
                      <button
                        key={pkg.id}
                        onClick={() => handleSelectPackage(pkg)}
                        disabled={loading}
                        className={cn(
                          "group relative w-full rounded-2xl border p-4 text-left transition-all",
                          isSingle
                            ? "border-accent bg-accent/5 hover:border-accent hover:shadow-md"
                            : "border-border hover:border-foreground/20 hover:shadow-md",
                        )}
                      >
                        {isSingle && (
                          <div className="absolute -top-2.5 right-3 flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold text-white">
                            <Sparkles className="h-3 w-3" />
                            Recomendado
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-display text-base font-bold text-foreground">
                              {pkg.name}
                            </p>
                            {pkg.description && (
                              <p className="mt-0.5 text-xs text-muted line-clamp-1">
                                {pkg.description}
                              </p>
                            )}
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                              <span className="flex items-center gap-1">
                                <Ticket className="h-3 w-3" />
                                {pkg.credits === null ? "Ilimitado" : `${pkg.credits} clase${pkg.credits !== 1 ? "s" : ""}`}
                              </span>
                              <span>{pkg.validDays} días</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-display text-lg font-bold text-foreground">
                              {formatPrice(pkg)}
                            </p>
                            {pkg.credits && pkg.credits > 1 && (
                              <p className="text-[10px] text-muted">
                                {formatPrice({ ...pkg, price: pkg.price / pkg.credits } as Package)}/clase
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Step: Pay (guest info) ── */}
            {step === "pay" && (
              <motion.div
                key="pay"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="mb-1 font-display text-xl font-bold text-foreground">
                  Tus datos
                </h2>
                <p className="mb-5 text-sm text-muted">
                  {selectedPkg?.name} · {selectedPkg && formatPrice(selectedPkg)}
                </p>

                {error && (
                  <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <form onSubmit={handlePaySubmit} className="space-y-3">
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
                    Pagar {selectedPkg && formatPrice(selectedPkg)}
                  </Button>
                  <p className="text-center text-[10px] text-muted/60">
                    Pago seguro · Podrás iniciar sesión después con este email
                  </p>
                </form>
              </motion.div>
            )}

            {/* ── Step: Booking in progress ── */}
            {step === "booking" && (
              <motion.div
                key="booking"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <Loader2 className="h-8 w-8 animate-spin text-accent" />
                <p className="mt-4 text-sm font-medium text-muted">
                  Reservando tu lugar...
                </p>
              </motion.div>
            )}

            {/* ── Step: Done ── */}
            {step === "done" && result && (
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
                  ¡Lugar reservado!
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Lugar #{result.spotNumber} · {className}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {formatTime(classTime)}
                </p>

                <div className="mt-6 flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2">
                  <Ticket className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium text-accent">
                    {result.packageName}
                  </span>
                </div>

                {isLoggedIn ? (
                  <Button
                    onClick={() => router.push("/my/bookings")}
                    className="mt-8 w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
                    size="lg"
                  >
                    Ver mis reservas
                  </Button>
                ) : (
                  <>
                    <Button
                      onClick={() => signIn("google", { callbackUrl: "/my/bookings" })}
                      className="mt-8 w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                      size="lg"
                    >
                      <LogIn className="h-4 w-4" />
                      Iniciar sesión y ver reservas
                    </Button>
                    <button
                      onClick={onClose}
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
