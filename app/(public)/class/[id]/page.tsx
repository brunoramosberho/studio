"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Info,
  ShoppingBag,
  ArrowRight,
  LogIn,
  Check,
  Eye,
  EyeOff,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { StudioMap, type SpotInfo } from "@/components/shared/studio-map";
import { formatDate, formatTimeRange, formatTime, getLevelLabel } from "@/lib/utils";
import { useBooking } from "@/hooks/useBooking";
import { usePackages } from "@/hooks/usePackages";

interface ClassData {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  coachId: string;
  notes: string | null;
  classType: {
    id: string;
    name: string;
    description: string | null;
    duration: number;
    level: string;
    color: string;
    icon: string | null;
  };
  room: {
    id: string;
    name: string;
    maxCapacity: number;
    studio: { id: string; name: string; address: string | null };
  };
  coach: {
    id: string;
    bio: string | null;
    specialties: string[];
    user: { name: string | null; image: string | null };
  };
  bookings: { id: string; userId: string | null; spotNumber: number | null; status: string }[];
  _count: { bookings: number; waitlist: number };
  spotsLeft: number;
  spotMap: Record<number, SpotInfo>;
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session, status: authStatus } = useSession();
  const queryClient = useQueryClient();
  const { bookAsync, isBooking } = useBooking();
  const isAuthenticated = authStatus === "authenticated";
  const { packages, isLoading: packagesLoading } = usePackages(isAuthenticated);

  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookedSpotNumber, setBookedSpotNumber] = useState<number | null>(null);
  const [privacy, setPrivacy] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");

  const {
    data: cls,
    isLoading: loading,
    error: fetchError,
  } = useQuery<ClassData>({
    queryKey: ["classes", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch class");
      return res.json();
    },
    enabled: !!id,
  });

  const validPackages = packages
    .filter((p) => p.creditsTotal === null || p.creditsUsed < (p.creditsTotal ?? 0))
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const activePackage = validPackages[0];
  const creditsRemaining = activePackage
    ? activePackage.creditsTotal === null
      ? -1
      : (activePackage.creditsTotal ?? 0) - activePackage.creditsUsed
    : null;

  const myBooking = cls?.bookings.find(
    (b) => b.userId === session?.user?.id && b.status === "CONFIRMED",
  );
  const myBookedSpot = myBooking?.spotNumber ?? null;

  useEffect(() => {
    if (myBookedSpot) setSelectedSpot(null);
  }, [myBookedSpot]);

  async function handleBook() {
    if (!selectedSpot) return;
    setError(null);

    try {
      await bookAsync({
        classId: id,
        spotNumber: selectedSpot,
        packageId: validPackages[0]?.id,
        privacy,
      });
      setBookingSuccess(true);
      setBookedSpotNumber(selectedSpot);
      setSelectedSpot(null);
      queryClient.invalidateQueries({ queryKey: ["classes", id] });
    } catch (err: any) {
      setError(err.error || "No se pudo completar la reserva");
    }
  }

  if (loading || authStatus === "loading") {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  if (fetchError || !cls) {
    return (
      <PageTransition>
        <div className="mx-auto max-w-2xl px-4 py-32 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted/30" />
          <h1 className="mt-4 font-display text-2xl font-bold text-foreground">
            Clase no encontrada
          </h1>
          <p className="mt-2 text-sm text-muted">
            Esta clase no existe o ya no está disponible.
          </p>
          <Button asChild variant="secondary" className="mt-8">
            <Link href="/schedule">Ver horarios</Link>
          </Button>
        </div>
      </PageTransition>
    );
  }

  const spotsLeft = cls.spotsLeft;
  const spotMap = cls.spotMap ?? {};
  const hasPackage = validPackages.length > 0;

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg px-4 pb-36 pt-4 sm:pb-16 sm:pt-12">
        {/* Back + credits */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Horarios
          </Link>
          {isAuthenticated && creditsRemaining !== null && (
            <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1">
              <Ticket className="h-3.5 w-3.5 text-accent" />
              <span className="text-[12px] font-semibold text-accent">
                {creditsRemaining === -1 ? "Ilimitado" : `${creditsRemaining} clases`}
              </span>
            </div>
          )}
        </div>

        {/* Title + meta row (Siclo-style) */}
        <h1 className="font-display text-2xl font-bold text-foreground">
          {cls.classType.name}
          {cls.coach.user.name && (
            <span className="text-muted font-normal">
              {" "}con {cls.coach.user.name}
            </span>
          )}
        </h1>

        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-muted">
            {(bookedSpotNumber ?? myBookedSpot) ? (
              <span className="font-semibold text-foreground">
                Lugar: {bookedSpotNumber ?? myBookedSpot}
              </span>
            ) : selectedSpot ? (
              <span className="font-semibold text-foreground">
                Lugar: {selectedSpot}
              </span>
            ) : null}
          </p>
          <p className="text-sm text-muted uppercase tracking-wide">
            {new Date(cls.startsAt).toLocaleDateString("es-MX", {
              day: "2-digit",
              month: "short",
            }).toUpperCase()}
            {" / "}
            {new Date(cls.startsAt).toLocaleDateString("es-MX", {
              weekday: "short",
            }).toUpperCase()}
            {"  "}
            {formatTime(cls.startsAt)}
          </p>
        </div>

        {/* Divider */}
        <div className="my-6 h-px bg-border/50" />

        {/* Studio Map */}
        <div className="py-4">
          <StudioMap
            maxCapacity={cls.room.maxCapacity}
            spotMap={spotMap}
            selectedSpot={selectedSpot}
            onSelectSpot={(spot) => {
              setSelectedSpot(spot === selectedSpot ? null : spot);
              setError(null);
            }}
            myBookedSpot={myBookedSpot}
            disabled={!!myBooking || bookingSuccess || !isAuthenticated || !hasPackage}
          />
        </div>

        {/* Privacy toggle */}
        {isAuthenticated && hasPackage && !myBooking && !bookingSuccess && (
          <button
            onClick={() => setPrivacy(privacy === "PUBLIC" ? "PRIVATE" : "PUBLIC")}
            className="mx-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            {privacy === "PUBLIC" ? (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>Visible para amigos</span>
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>Reserva privada</span>
              </>
            )}
          </button>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Booking success */}
        <AnimatePresence>
          {bookingSuccess && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <div className="flex items-center gap-3 rounded-xl bg-green-50 px-4 py-3">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-green-500">
                  <Check className="h-3.5 w-3.5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    Reserva confirmada
                  </p>
                  <p className="text-xs text-green-600">
                    Lugar #{bookedSpotNumber} · {formatTime(cls.startsAt)}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Divider */}
        <div className="my-6 h-px bg-border/50" />

        {/* CTA area */}
        {!myBooking && !bookingSuccess && (
          <div className="space-y-4">
            {isAuthenticated ? (
              packagesLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted" />
                </div>
              ) : !hasPackage ? (
                <div className="text-center">
                  <ShoppingBag className="mx-auto h-8 w-8 text-muted/30" />
                  <p className="mt-2 text-sm font-medium text-foreground">
                    Necesitas un paquete
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Adquiere un paquete para reservar tu lugar.
                  </p>
                  <Button asChild className="mt-4 w-full" size="lg">
                    <Link href="/packages">
                      Ver paquetes
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ) : spotsLeft > 0 ? (
                <Button
                  size="lg"
                  className="w-full min-h-[48px] rounded-full bg-foreground text-background hover:bg-foreground/90"
                  onClick={handleBook}
                  disabled={isBooking || !selectedSpot}
                >
                  {isBooking ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {selectedSpot
                    ? "Reservar clase"
                    : "Selecciona un lugar"}
                </Button>
              ) : (
                <Button size="lg" variant="secondary" className="w-full rounded-full">
                  Unirme a lista de espera
                </Button>
              )
            ) : (
              <Button asChild size="lg" className="w-full min-h-[48px] rounded-full bg-foreground text-background hover:bg-foreground/90">
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  Inicia sesión para reservar
                </Link>
              </Button>
            )}
          </div>
        )}

        {/* Already booked */}
        {myBooking && !bookingSuccess && (
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
              <Check className="h-3.5 w-3.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Reserva confirmada
              </p>
              {myBookedSpot && (
                <p className="text-xs text-muted">Lugar #{myBookedSpot}</p>
              )}
            </div>
          </div>
        )}

        {/* Policy — below everything */}
        <div className="mt-10 flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted/40" />
          <p className="text-[11px] leading-relaxed text-muted/60">
            Puedes cancelar hasta 12 horas antes del inicio sin perder tu
            crédito. Cancelaciones tardías o no-shows consumen el crédito.
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
