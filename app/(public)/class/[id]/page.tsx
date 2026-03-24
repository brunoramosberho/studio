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
  Check,
  Eye,
  EyeOff,
  Ticket,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { StudioMap, type SpotInfo, type RoomLayoutData } from "@/components/shared/studio-map";
import { formatTime } from "@/lib/utils";
import { useBooking } from "@/hooks/useBooking";
import { usePackages } from "@/hooks/usePackages";
import { BookingSheet } from "@/components/booking/booking-sheet";

interface ClassData {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  coachId: string;
  notes: string | null;
  tag: string | null;
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
    layout: RoomLayoutData | null;
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
  const { packages: userPackages, isLoading: packagesLoading } = usePackages(isAuthenticated);

  const [selectedSpot, setSelectedSpot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookedSpotNumber, setBookedSpotNumber] = useState<number | null>(null);
  const [privacy, setPrivacy] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const validPackages = userPackages
    .filter((p) => p.creditsTotal === null || p.creditsUsed < (p.creditsTotal ?? 0))
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const hasCredits = validPackages.length > 0;
  const creditsRemaining = validPackages[0]
    ? validPackages[0].creditsTotal === null
      ? -1
      : (validPackages[0].creditsTotal ?? 0) - validPackages[0].creditsUsed
    : null;

  const myBooking = cls?.bookings.find(
    (b) => b.userId === session?.user?.id && b.status === "CONFIRMED",
  );
  const myBookedSpot = myBooking?.spotNumber ?? null;

  useEffect(() => {
    if (myBookedSpot) setSelectedSpot(null);
  }, [myBookedSpot]);

  async function handleDirectBook() {
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

  function handleReserveClick() {
    if (!selectedSpot) return;

    if (isAuthenticated && hasCredits) {
      handleDirectBook();
    } else {
      setSheetOpen(true);
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
  const needsPackage = !isAuthenticated || !hasCredits;
  const isFirstClass = !isAuthenticated || (isAuthenticated && userPackages.length === 0);

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

        {/* Title + meta */}
        <h1 className="font-display text-2xl font-bold text-foreground">
          {cls.classType.name}
          {cls.coach.user.name && (
            <span className="font-normal text-muted">
              {" "}con {cls.coach.user.name}
            </span>
          )}
        </h1>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted">
            {(bookedSpotNumber ?? myBookedSpot) ? (
              <span className="font-semibold text-foreground">
                Lugar: {bookedSpotNumber ?? myBookedSpot}
              </span>
            ) : selectedSpot ? (
              <span className="font-semibold text-foreground">
                Lugar: {selectedSpot}
              </span>
            ) : null}
            {cls.tag && (
              <Badge variant="outline" className="text-[10px]">{cls.tag}</Badge>
            )}
          </div>
          <p className="text-sm uppercase tracking-wide text-muted">
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

        {/* Studio */}
        {cls.room?.studio && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-muted/70">
            <MapPin className="h-3 w-3" />
            {cls.room.studio.name} · {cls.room.name}
          </div>
        )}

        <div className="my-6 h-px bg-border/50" />

        {/* Studio Map — always interactive */}
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
            disabled={!!myBooking || bookingSuccess}
            layout={cls.room.layout}
          />
        </div>

        {/* Privacy toggle */}
        {!myBooking && !bookingSuccess && selectedSpot && (
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

        <div className="my-6 h-px bg-border/50" />

        {/* CTA */}
        {!myBooking && !bookingSuccess && (
          <div className="space-y-4">
            {spotsLeft > 0 ? (
              <Button
                size="lg"
                className="w-full min-h-[48px] rounded-full bg-foreground text-background hover:bg-foreground/90"
                onClick={handleReserveClick}
                disabled={isBooking || !selectedSpot || (isAuthenticated && packagesLoading)}
              >
                {isBooking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {!selectedSpot
                  ? "Selecciona un lugar"
                  : needsPackage
                    ? isFirstClass
                      ? "Reservar 1era clase"
                      : "Reservar clase"
                    : "Reservar clase"}
              </Button>
            ) : (
              <Button size="lg" variant="secondary" className="w-full rounded-full">
                Clase llena
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

        {/* Policy */}
        <div className="mt-10 flex items-start gap-2.5">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted/40" />
          <p className="text-[11px] leading-relaxed text-muted/60">
            Puedes cancelar hasta 12 horas antes del inicio sin perder tu
            crédito. Cancelaciones tardías o no-shows consumen el crédito.
          </p>
        </div>
      </div>

      {/* Booking Sheet */}
      <AnimatePresence>
        {sheetOpen && selectedSpot && (
          <BookingSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            classId={id}
            spotNumber={selectedSpot}
            className={cls.classType.name}
            classTime={cls.startsAt}
            privacy={privacy}
            onSuccess={() => {
              setBookingSuccess(true);
              setBookedSpotNumber(selectedSpot);
              setSelectedSpot(null);
              queryClient.invalidateQueries({ queryKey: ["classes", id] });
            }}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
