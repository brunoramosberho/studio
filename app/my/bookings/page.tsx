"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  AlertTriangle,
  Loader2,
  MapPin,
  Share,
  Check,
  X,
  Users,
  Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { formatRelativeDay, formatTimeRange, cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BookingWithDetails } from "@/types";

interface FriendInfo {
  id: string;
  name: string | null;
  image: string | null;
}

interface EnrichedBooking extends BookingWithDetails {
  friendsGoing: FriendInfo[];
}

const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1000;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

async function fetchBookingList(status: string): Promise<EnrichedBooking[]> {
  const res = await fetch(`/api/bookings?status=${status}`);
  if (!res.ok) return [];
  return res.json();
}

function canCancelFreely(booking: BookingWithDetails): boolean {
  const timeUntil = new Date(booking.class.startsAt).getTime() - Date.now();
  return timeUntil > CANCELLATION_WINDOW_MS;
}

function hoursUntilClass(booking: BookingWithDetails): number {
  return Math.max(0, Math.round((new Date(booking.class.startsAt).getTime() - Date.now()) / 3_600_000));
}

export default function BookingsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [cancelTarget, setCancelTarget] = useState<EnrichedBooking | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: upcoming = [], isLoading: loadingUpcoming } = useQuery({
    queryKey: ["bookings", "upcoming"],
    queryFn: () => fetchBookingList("upcoming"),
    enabled: !!session?.user,
  });

  const { data: past = [], isLoading: loadingPast } = useQuery({
    queryKey: ["bookings", "past"],
    queryFn: () => fetchBookingList("past"),
    enabled: !!session?.user,
  });

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cancel failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      setCancelTarget(null);
    },
  });

  const handleShare = useCallback(async (booking: EnrichedBooking) => {
    const classUrl = `${window.location.origin}/class/${booking.classId}`;
    const date = new Date(booking.class.startsAt);
    const dayStr = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = formatTimeRange(booking.class.startsAt, booking.class.endsAt);
    const text = `${booking.class.classType.name} con ${booking.class.coach.user.name}\n${dayStr}, ${timeStr}\n¡Reserva tu lugar!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: booking.class.classType.name, text, url: classUrl });
      } catch {}
    } else {
      await navigator.clipboard.writeText(`${text}\n${classUrl}`);
      setCopiedId(booking.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const loading = tab === "upcoming" ? loadingUpcoming : loadingPast;
  const bookings = tab === "upcoming" ? upcoming : past;

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    CONFIRMED: { label: "Confirmada", color: "text-green-700", bg: "bg-green-50" },
    ATTENDED: { label: "Asistió", color: "text-green-700", bg: "bg-green-50" },
    NO_SHOW: { label: "No asistió", color: "text-red-600", bg: "bg-red-50" },
    CANCELLED: { label: "Cancelada", color: "text-orange-600", bg: "bg-orange-50" },
  };

  return (
    <PageTransition>
      <div className="space-y-5 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Mis Reservas
          </h1>
          <Button asChild size="sm" className="rounded-full">
            <Link href="/schedule">+ Reservar</Link>
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-surface p-1">
          {(["upcoming", "past"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                tab === t
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {t === "upcoming" ? "Próximas" : "Pasadas"}
              {t === "upcoming" && upcoming.length > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent/10 px-1.5 text-[11px] font-bold text-accent">
                  {upcoming.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32 rounded-2xl" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
              <Calendar className="h-7 w-7 text-muted/40" />
            </div>
            <p className="mt-4 font-display text-lg font-bold text-foreground">
              {tab === "upcoming" ? "Sin clases próximas" : "Sin historial aún"}
            </p>
            <p className="mt-1 text-sm text-muted">
              {tab === "upcoming"
                ? "Reserva una clase para empezar"
                : "Tus clases pasadas aparecerán aquí"}
            </p>
            {tab === "upcoming" && (
              <Button asChild className="mt-6 rounded-full" size="sm">
                <Link href="/schedule">Explorar clases</Link>
              </Button>
            )}
          </div>
        ) : (
          <motion.div
            className="space-y-3"
            variants={stagger}
            initial="hidden"
            animate="show"
            key={tab}
          >
            {bookings.map((booking) => {
              const status = statusConfig[booking.status] ?? statusConfig.CONFIRMED;
              const isUpcoming = tab === "upcoming";
              const free = canCancelFreely(booking);
              const hours = hoursUntilClass(booking);
              const studioName = (booking.class as unknown as { room?: { studio?: { name?: string } } }).room?.studio?.name;

              return (
                <motion.div key={booking.id} variants={fadeUp}>
                  <div className="overflow-hidden rounded-2xl border border-border/50 bg-white transition-shadow hover:shadow-warm-sm">
                    {/* Color accent bar */}
                    <div
                      className="h-1"
                      style={{ backgroundColor: booking.class.classType.color || "#e5e5e5" }}
                    />

                    <div className="p-4">
                      {/* Top row: class info + status */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-display text-base font-bold text-foreground">
                            {booking.class.classType.name}
                          </p>
                          <p className="mt-0.5 text-[13px] text-muted">
                            con {booking.class.coach.user.name}
                          </p>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", status.bg, status.color)}>
                          {status.label}
                        </span>
                      </div>

                      {/* Details row */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted">
                        <span className="flex items-center gap-1.5 capitalize">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatRelativeDay(booking.class.startsAt)}
                        </span>
                        <span className="flex items-center gap-1.5 font-mono text-foreground">
                          <Clock className="h-3.5 w-3.5 text-muted" />
                          {formatTimeRange(booking.class.startsAt, booking.class.endsAt)}
                        </span>
                        {booking.spotNumber && (
                          <span className="flex items-center gap-1">
                            <Hash className="h-3.5 w-3.5" />
                            Lugar {booking.spotNumber}
                          </span>
                        )}
                        {studioName && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {studioName}
                          </span>
                        )}
                      </div>

                      {/* Friends going */}
                      {isUpcoming && booking.friendsGoing?.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent/5 px-3 py-2">
                          <Users className="h-3.5 w-3.5 text-accent" />
                          <div className="flex -space-x-1.5">
                            {booking.friendsGoing.slice(0, 5).map((f) => (
                              <Avatar key={f.id} className="h-6 w-6 ring-2 ring-white">
                                {f.image && <AvatarImage src={f.image} />}
                                <AvatarFallback className="text-[9px] font-semibold">
                                  {(f.name ?? "?")[0]}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <span className="text-[12px] font-medium text-accent">
                            {booking.friendsGoing.length === 1
                              ? `${booking.friendsGoing[0].name?.split(" ")[0]} va`
                              : `${booking.friendsGoing.length} amigos van`}
                          </span>
                        </div>
                      )}

                      {/* Actions */}
                      {isUpcoming && booking.status === "CONFIRMED" && (
                        <div className="mt-3 flex items-center gap-2 border-t border-border/30 pt-3">
                          <button
                            onClick={() => handleShare(booking)}
                            className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-[12px] font-medium text-foreground transition-colors hover:bg-surface/80 active:scale-95"
                          >
                            {copiedId === booking.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-green-600">Copiado</span>
                              </>
                            ) : (
                              <>
                                <Share className="h-3.5 w-3.5" />
                                Compartir
                              </>
                            )}
                          </button>
                          <div className="flex-1" />
                          <button
                            onClick={() => setCancelTarget(booking)}
                            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                            Cancelar
                          </button>
                          {!free && (
                            <span className="text-[10px] text-orange-500">
                              Sin reembolso
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Cancel confirmation sheet */}
        <AnimatePresence>
          {cancelTarget && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
                onClick={() => !cancelMutation.isPending && setCancelTarget(null)}
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 300 }}
                className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-white pb-safe shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
              >
                <div className="flex justify-center pt-3 sm:hidden">
                  <div className="h-1 w-10 rounded-full bg-border" />
                </div>

                <div className="p-6 text-center">
                  <div
                    className={cn(
                      "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                      canCancelFreely(cancelTarget)
                        ? "bg-orange-50"
                        : "bg-red-50",
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        "h-6 w-6",
                        canCancelFreely(cancelTarget)
                          ? "text-orange-500"
                          : "text-red-500",
                      )}
                    />
                  </div>

                  <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                    Cancelar reserva
                  </h3>

                  <p className="mt-1 text-sm text-muted">
                    {cancelTarget.class.classType.name} · {formatRelativeDay(cancelTarget.class.startsAt)}
                  </p>

                  {canCancelFreely(cancelTarget) ? (
                    <div className="mt-4 rounded-xl bg-green-50 px-4 py-3">
                      <p className="text-[13px] font-medium text-green-700">
                        Tu crédito será devuelto
                      </p>
                      <p className="mt-0.5 text-[12px] text-green-600">
                        Faltan más de 12 horas para la clase
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-red-50 px-4 py-3">
                      <p className="text-[13px] font-medium text-red-700">
                        Tu crédito NO será devuelto
                      </p>
                      <p className="mt-0.5 text-[12px] text-red-600">
                        Faltan menos de 12 horas ({hoursUntilClass(cancelTarget)}h).
                        Las cancelaciones tardías no reembolsan créditos.
                      </p>
                    </div>
                  )}

                  <div className="mt-6 flex flex-col gap-2">
                    <Button
                      variant="destructive"
                      className="w-full rounded-full"
                      onClick={() => cancelMutation.mutate(cancelTarget.id)}
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {canCancelFreely(cancelTarget) ? "Cancelar reserva" : "Cancelar sin reembolso"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full rounded-full"
                      onClick={() => setCancelTarget(null)}
                      disabled={cancelMutation.isPending}
                    >
                      Volver
                    </Button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  );
}
