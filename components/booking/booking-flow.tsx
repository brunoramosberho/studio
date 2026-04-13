"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Loader2, ArrowRight, ShoppingBag, LogIn, Clock, Users, Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { useBookingStore } from "@/store/booking-store";
import { useBooking } from "@/hooks/useBooking";
import { usePackages } from "@/hooks/usePackages";
import { PackageSelector } from "./package-selector";
import { ConfirmationScreen } from "./confirmation-screen";
import { GuestListInput } from "./guest-list-input";
import type { ClassWithDetails } from "@/types";

interface BookingFlowProps {
  classId: string;
}

export function BookingFlow({ classId }: BookingFlowProps) {
  const { status: authStatus } = useSession();
  const store = useBookingStore();
  const { bookAsync, isBooking } = useBooking();

  const isAuthenticated = authStatus === "authenticated";
  const { packages, isLoading: packagesLoading } = usePackages(isAuthenticated);

  const [error, setError] = useState<string | null>(null);
  const [isClassFull, setIsClassFull] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [notifyMeActive, setNotifyMeActive] = useState(false);
  const [togglingNotifyMe, setTogglingNotifyMe] = useState(false);

  const { data: classData, isLoading: classLoading } = useQuery<ClassWithDetails>({
    queryKey: ["classes", classId],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${classId}`);
      if (!res.ok) throw new Error("Failed to fetch class");
      return res.json();
    },
  });

  useEffect(() => {
    store.setSelectedClass(classId);
    return () => store.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const now = new Date();
  const classTypeId = classData?.classTypeId;
  const validPackages = packages
    .filter((p) => new Date(p.expiresAt) > now)
    .filter((p) => {
      const hasAllocations = (p.creditUsages?.length ?? 0) > 0;
      if (hasAllocations && classTypeId) {
        const usage = p.creditUsages!.find((u) => u.classTypeId === classTypeId);
        return usage ? usage.creditsUsed < usage.creditsTotal : false;
      }
      return p.creditsTotal === null || p.creditsUsed < (p.creditsTotal ?? 0);
    })
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const firstPackageId = validPackages[0]?.id;

  useEffect(() => {
    if (firstPackageId && !store.selectedPackageId) {
      store.setSelectedPackage(firstPackageId);
    }
  }, [firstPackageId, store.selectedPackageId, store]);

  // Guest configuration derived from selected package
  const selectedPkg = validPackages.find((p) => p.id === (store.selectedPackageId ?? firstPackageId));
  const guestConfig = useMemo(() => {
    if (!selectedPkg) return { allowGuests: false, maxGuests: null as number | null, isUnlimited: false };
    // The package object includes allowGuests/maxGuestsPerBooking/monthlyGuestPasses from the DB
    const pkg = selectedPkg.package as typeof selectedPkg.package & {
      allowGuests?: boolean;
      maxGuestsPerBooking?: number | null;
      monthlyGuestPasses?: number | null;
    };
    return {
      allowGuests: pkg.allowGuests === true,
      maxGuests: pkg.maxGuestsPerBooking ?? null,
      isUnlimited: selectedPkg.creditsTotal === null,
      monthlyGuestPasses: pkg.monthlyGuestPasses ?? null,
    };
  }, [selectedPkg]);

  // Compute available credits for this class type
  const availableCredits = useMemo(() => {
    if (!selectedPkg) return 0;
    if (selectedPkg.creditsTotal === null) return Infinity; // unlimited
    const hasAllocations = (selectedPkg.creditUsages?.length ?? 0) > 0;
    if (hasAllocations && classTypeId) {
      const usage = selectedPkg.creditUsages!.find((u) => u.classTypeId === classTypeId);
      return usage ? usage.creditsTotal - usage.creditsUsed : 0;
    }
    return (selectedPkg.creditsTotal ?? 0) - selectedPkg.creditsUsed;
  }, [selectedPkg, classTypeId]);

  const totalPeople = 1 + store.guests.length;
  const creditsNeeded = totalPeople;
  const hasEnoughCredits = availableCredits >= creditsNeeded;

  const classFull =
    isClassFull ||
    (classData?.spotsLeft != null && classData.spotsLeft <= 0);
  const waitlistCount = classData?._count?.waitlist ?? 0;

  async function handleBookAuthenticated() {
    setError(null);
    setIsClassFull(false);
    store.setBookingSuccess(true);

    try {
      await bookAsync({
        classId,
        packageId: store.selectedPackageId ?? firstPackageId,
        ...(store.guests.length > 0 && { guests: store.guests }),
      });
    } catch (err: any) {
      store.setBookingSuccess(false);
      if (err.full) setIsClassFull(true);
      setError(err.error || "No se pudo completar la reserva");
    }
  }

  async function handleBookGuest() {
    if (!store.guestName.trim() || !store.guestEmail.trim()) {
      setError("Nombre y correo electrónico son requeridos");
      return;
    }
    setError(null);
    setIsClassFull(false);
    store.setBookingSuccess(true);

    try {
      await bookAsync({
        classId,
        guestName: store.guestName,
        guestEmail: store.guestEmail,
      });
    } catch (err: any) {
      store.setBookingSuccess(false);
      if (err.full) setIsClassFull(true);
      setError(err.error || "No se pudo completar la reserva");
    }
  }

  async function handleJoinWaitlist() {
    setJoiningWaitlist(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          packageId: store.selectedPackageId ?? firstPackageId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsClassFull(false);
        setWaitlistJoined(true);
        setWaitlistPosition(data.position ?? data.waitlistCount ?? null);
        setNotifyMeActive(false);
      } else {
        setError(data.error || "No se pudo unir a la lista de espera");
      }
    } catch {
      setError("No se pudo unir a la lista de espera");
    } finally {
      setJoiningWaitlist(false);
    }
  }

  async function handleToggleNotifyMe() {
    setTogglingNotifyMe(true);
    setError(null);
    try {
      const res = await fetch("/api/notify-spot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId }),
      });
      if (res.ok) {
        setNotifyMeActive(true);
      } else {
        const data = await res.json();
        setError(data.error || "No se pudo activar la notificación");
      }
    } catch {
      setError("No se pudo activar la notificación");
    } finally {
      setTogglingNotifyMe(false);
    }
  }

  // --- Loading state ---
  if (classLoading || authStatus === "loading") {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    );
  }

  // --- Class not found ---
  if (!classData) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-6 text-center">
          <p className="text-muted">Clase no encontrada</p>
          <Button asChild variant="secondary" className="mt-4">
            <Link href="/schedule">Ver horarios</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // --- Waitlist success ---
  if (waitlistJoined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center py-8 text-center"
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: "#C9A96E15" }}
        >
          <Clock className="h-7 w-7 text-[#C9A96E]" />
        </div>
        <h2 className="mt-4 font-display text-xl font-bold text-foreground">
          Estas en la lista de espera
        </h2>
        {waitlistPosition && (
          <p className="mt-1 text-sm font-medium text-accent">
            Posicion #{waitlistPosition}
          </p>
        )}
        <p className="mt-2 text-sm text-muted">
          Se te descontó un crédito. Si se libera un lugar, entrarás automáticamente y te notificaremos. Si no entras, se te devolverá el crédito.
        </p>
        <div className="mt-6 flex gap-3">
          <Button asChild variant="secondary" size="sm">
            <Link href="/my/bookings">Ver mis reservas</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/schedule">Ver otros horarios</Link>
          </Button>
        </div>
      </motion.div>
    );
  }

  // --- Booking success (optimistic) ---
  if (store.bookingSuccess) {
    return (
      <ConfirmationScreen
        classTitle={classData.classType.name}
        classDate={formatDate(classData.startsAt)}
        classTime={formatTime(classData.startsAt)}
        coachName={classData.coach.name ?? "Coach"}
        startsAt={classData.startsAt.toString()}
        endsAt={classData.endsAt.toString()}
        location={classData.room?.studio?.name ?? undefined}
      />
    );
  }

  const coachName = classData.coach.name ?? "Coach";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Class summary */}
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <h2 className="font-display text-xl font-bold text-foreground">
            {classData.classType.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span className="font-mono">{formatTime(classData.startsAt)}</span>
            <span className="text-muted/40">&bull;</span>
            <span className="capitalize">{formatDate(classData.startsAt)}</span>
            <span className="text-muted/40">&bull;</span>
            <span>{coachName}</span>
          </div>

          {classFull && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                <Users className="h-3 w-3" />
                Clase llena
              </span>
              {waitlistCount > 0 && (
                <span className="text-xs text-muted">
                  {waitlistCount} {waitlistCount === 1 ? "persona" : "personas"} en lista de espera
                </span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="rounded-2xl border border-red-200 bg-red-50">
              <CardContent className="p-4">
                <p className="text-sm text-red-700">{error}</p>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Authenticated flow --- */}
      {isAuthenticated && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {packagesLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-full" />
            </div>
          ) : validPackages.length === 0 ? (
            <div className="space-y-4">
              <Card className="rounded-2xl border border-[#C9A96E]/20 bg-[#C9A96E]/5">
                <CardContent className="p-6 text-center">
                  <ShoppingBag className="mx-auto h-10 w-10 text-[#C9A96E]/50" />
                  <h3 className="mt-3 font-display text-lg font-bold text-foreground">
                    {classFull
                      ? "Necesitas un paquete para unirte a la lista de espera"
                      : "Necesitas un paquete para reservar"}
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    Adquiere un paquete de clases para {classFull ? "unirte a la lista de espera" : "reservar tu lugar"}.
                  </p>
                  <Button asChild className="mt-4 w-full" size="lg">
                    <Link href="/packages">
                      Ver paquetes
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
              {classFull && (
                notifyMeActive ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
                    <BellRing className="h-4 w-4" />
                    Te notificaremos si se abre un lugar
                  </div>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    className={cn("w-full min-h-[48px] gap-2")}
                    onClick={handleToggleNotifyMe}
                    disabled={togglingNotifyMe}
                  >
                    {togglingNotifyMe ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                    Notifícame si se libera un espacio
                  </Button>
                )
              )}
            </div>
          ) : classFull ? (
            /* --- Waitlist flow --- */
            <div className="space-y-4">
              {validPackages.length > 1 && (
                <PackageSelector
                  packages={validPackages}
                  selectedId={store.selectedPackageId}
                  onSelect={store.setSelectedPackage}
                  classTypeId={classTypeId}
                />
              )}
              <Card className="rounded-2xl border border-[#C9A96E]/20 bg-[#C9A96E]/5">
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#C9A96E]/10">
                      <Clock className="h-5 w-5 text-[#C9A96E]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Lista de espera
                      </p>
                      <p className="mt-0.5 text-xs text-muted leading-relaxed">
                        Se te descontará un crédito al unirte. Si se libera un lugar, entrarás automáticamente. Si no logras entrar, se te devuelve el crédito.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Button
                size="lg"
                className={cn("w-full min-h-[48px]")}
                onClick={handleJoinWaitlist}
                disabled={joiningWaitlist}
              >
                {joiningWaitlist && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Unirme a la lista de espera
                {waitlistCount > 0 && (
                  <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs">
                    {waitlistCount}
                  </span>
                )}
              </Button>
              {!notifyMeActive ? (
                <button
                  onClick={handleToggleNotifyMe}
                  disabled={togglingNotifyMe}
                  className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {togglingNotifyMe ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                  Solo notifícame si se abre un lugar
                </button>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-full bg-accent/10 py-2.5 text-sm font-medium text-accent">
                  <BellRing className="h-3.5 w-3.5" />
                  Te notificaremos si se abre un lugar
                </div>
              )}
            </div>
          ) : validPackages.length === 1 ? (
            <div className="space-y-4">
              {/* Guest section */}
              {guestConfig.allowGuests && (
                <GuestListInput
                  guests={store.guests}
                  onChange={store.setGuests}
                  maxGuests={guestConfig.maxGuests}
                  disabled={isBooking}
                />
              )}

              {/* Credit summary when guests are added */}
              {store.guests.length > 0 && (
                <Card className="rounded-2xl border-accent/20 bg-accent/5">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Users className="h-5 w-5 text-accent" />
                    <div className="flex-1 text-sm">
                      <span className="font-medium text-foreground">
                        {creditsNeeded} crédito{creditsNeeded > 1 ? "s" : ""}
                      </span>
                      <span className="text-muted">
                        {" "}(tú + {store.guests.length} invitado{store.guests.length > 1 ? "s" : ""})
                      </span>
                    </div>
                    {!hasEnoughCredits && availableCredits !== Infinity && (
                      <span className="text-xs font-medium text-red-600">
                        Solo tienes {availableCredits}
                      </span>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                size="lg"
                className={cn("w-full min-h-[48px]")}
                onClick={handleBookAuthenticated}
                disabled={isBooking || !hasEnoughCredits}
              >
                {isBooking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {store.guests.length > 0
                  ? `Reservar para ${totalPeople} persona${totalPeople > 1 ? "s" : ""}`
                  : `Reservar con ${validPackages[0].package.name}`}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <PackageSelector
                packages={validPackages}
                selectedId={store.selectedPackageId}
                onSelect={store.setSelectedPackage}
                classTypeId={classTypeId}
              />

              {/* Guest section */}
              {guestConfig.allowGuests && (
                <GuestListInput
                  guests={store.guests}
                  onChange={store.setGuests}
                  maxGuests={guestConfig.maxGuests}
                  disabled={isBooking}
                />
              )}

              {/* Credit summary when guests are added */}
              {store.guests.length > 0 && (
                <Card className="rounded-2xl border-accent/20 bg-accent/5">
                  <CardContent className="flex items-center gap-3 p-4">
                    <Users className="h-5 w-5 text-accent" />
                    <div className="flex-1 text-sm">
                      <span className="font-medium text-foreground">
                        {creditsNeeded} crédito{creditsNeeded > 1 ? "s" : ""}
                      </span>
                      <span className="text-muted">
                        {" "}(tú + {store.guests.length} invitado{store.guests.length > 1 ? "s" : ""})
                      </span>
                    </div>
                    {!hasEnoughCredits && availableCredits !== Infinity && (
                      <span className="text-xs font-medium text-red-600">
                        Solo tienes {availableCredits}
                      </span>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                size="lg"
                className={cn("w-full min-h-[48px]")}
                onClick={handleBookAuthenticated}
                disabled={isBooking || !store.selectedPackageId || !hasEnoughCredits}
              >
                {isBooking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {store.guests.length > 0
                  ? `Reservar para ${totalPeople} persona${totalPeople > 1 ? "s" : ""}`
                  : "Reservar clase"}
              </Button>
            </div>
          )}
        </motion.div>
      )}

      {/* --- Guest flow --- */}
      {!isAuthenticated && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          {classFull ? (
            <Card className="rounded-2xl">
              <CardContent className="p-6 text-center">
                <Clock className="mx-auto h-10 w-10 text-muted/30" />
                <h3 className="mt-3 font-display text-lg font-bold text-foreground">
                  Clase llena
                </h3>
                <p className="mt-1 text-sm text-muted">
                  Inicia sesión para unirte a la lista de espera.
                </p>
                <Button asChild className="mt-4" size="lg">
                  <Link href="/login">
                    <LogIn className="mr-2 h-4 w-4" />
                    Iniciar sesión
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg">Reservar como invitado</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                      Nombre
                    </label>
                    <Input
                      placeholder="Tu nombre completo"
                      value={store.guestName}
                      onChange={(e) => store.setGuestName(e.target.value)}
                      className="min-h-[48px]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">
                      Correo electrónico
                    </label>
                    <Input
                      type="email"
                      placeholder="tu@correo.com"
                      value={store.guestEmail}
                      onChange={(e) => store.setGuestEmail(e.target.value)}
                      className="min-h-[48px]"
                    />
                  </div>
                  <Button
                    size="lg"
                    className={cn("w-full min-h-[48px]")}
                    onClick={handleBookGuest}
                    disabled={isBooking}
                  >
                    {isBooking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reservar clase
                  </Button>
                </CardContent>
              </Card>

              <div className="text-center">
                <Button asChild variant="link" className="text-[#C9A96E]">
                  <Link href="/login">
                    <LogIn className="mr-2 h-4 w-4" />
                    Iniciar sesión para usar tu paquete
                  </Link>
                </Button>
              </div>
            </>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
