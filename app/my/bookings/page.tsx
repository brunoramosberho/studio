"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  AlertTriangle,
  Loader2,
  Share,
  Check,
  Users,
  Dumbbell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { formatRelativeDay, formatTime, formatTimeRange, cn } from "@/lib/utils";
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
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-2xl" />
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
            className="flex flex-col gap-3"
            variants={stagger}
            initial="hidden"
            animate="show"
            key={tab}
          >
            {bookings.map((booking) => {
              const isUpcoming = tab === "upcoming";
              const isPast = tab === "past";
              const studioName = (booking.class as unknown as { room?: { studio?: { name?: string } } }).room?.studio?.name;

              return (
                <motion.div key={booking.id} variants={fadeUp}>
                  <Link
                    href={`/class/${booking.classId}`}
                    className={cn(
                      "block rounded-2xl border border-border/50 bg-white transition-shadow active:scale-[0.99]",
                      isPast && "opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      {/* Time */}
                      <div className="w-14 flex-shrink-0 text-center">
                        <p className="text-[15px] font-bold text-foreground">
                          {formatTime(booking.class.startsAt)}
                        </p>
                        <p className="text-[11px] text-muted">
                          {booking.class.classType.duration} min
                        </p>
                      </div>

                      {/* Divider */}
                      <div
                        className="h-10 w-0.5 flex-shrink-0 rounded-full"
                        style={{ backgroundColor: (booking.class.classType.color || "#6366f1") + "40" }}
                      />

                      {/* Coach photo + info */}
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        {booking.class.coach.user.image ? (
                          <img
                            src={booking.class.coach.user.image}
                            alt={booking.class.coach.user.name || "Coach"}
                            className={cn(
                              "h-9 w-9 flex-shrink-0 rounded-full object-cover",
                              isPast && "grayscale",
                            )}
                          />
                        ) : (
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent">
                            {booking.class.coach.user.name?.charAt(0) || "C"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[15px] font-bold text-foreground">
                              {booking.class.classType.name}
                            </p>
                            {booking.spotNumber && (
                              <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                                #{booking.spotNumber}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[13px] text-muted">
                            con {booking.class.coach.user.name?.split(" ")[0]}
                            {studioName && (
                              <span className="text-muted/50"> · {studioName}</span>
                            )}
                          </p>
                          <p className="text-[11px] capitalize text-muted/70">
                            {formatRelativeDay(booking.class.startsAt)}
                          </p>
                        </div>
                      </div>

                      {/* Right side: status or actions */}
                      <div className="flex flex-shrink-0 flex-col items-end gap-1">
                        {isPast && (
                          <StatusBadge status={booking.status} />
                        )}
                        {isUpcoming && booking.status === "CONFIRMED" && (
                          <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
                            <button
                              onClick={(e) => { e.preventDefault(); handleShare(booking); }}
                              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted transition-colors active:scale-95"
                            >
                              {copiedId === booking.id ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Share className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={(e) => { e.preventDefault(); setCancelTarget(booking); }}
                              className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Friends going */}
                    {isUpcoming && booking.friendsGoing?.length > 0 && (
                      <div className="flex items-center gap-2 border-t border-border/30 px-4 py-2">
                        <div className="flex -space-x-1.5">
                          {booking.friendsGoing.slice(0, 4).map((f) => (
                            <Avatar key={f.id} className="h-5 w-5 ring-2 ring-white">
                              {f.image && <AvatarImage src={f.image} />}
                              <AvatarFallback className="text-[8px] font-semibold">
                                {(f.name ?? "?")[0]}
                              </AvatarFallback>
                            </Avatar>
                          ))}
                        </div>
                        <span className="text-[11px] font-medium text-accent">
                          {booking.friendsGoing.length === 1
                            ? `${booking.friendsGoing[0].name?.split(" ")[0]} va`
                            : `${booking.friendsGoing.length} amigos van`}
                        </span>
                      </div>
                    )}
                  </Link>
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
                      canCancelFreely(cancelTarget) ? "bg-orange-50" : "bg-red-50",
                    )}
                  >
                    <AlertTriangle
                      className={cn(
                        "h-6 w-6",
                        canCancelFreely(cancelTarget) ? "text-orange-500" : "text-red-500",
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    CONFIRMED: { label: "Completada", color: "text-green-700", bg: "bg-green-50" },
    ATTENDED: { label: "Asistió", color: "text-green-700", bg: "bg-green-50" },
    NO_SHOW: { label: "Crédito perdido", color: "text-red-600", bg: "bg-red-50" },
  };
  const s = config[status] ?? config.CONFIRMED;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold", s.bg, s.color)}>
      {s.label}
    </span>
  );
}
