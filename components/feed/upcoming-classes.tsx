"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Share, Check, AlertTriangle, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatRelativeDay, formatTime, formatTimeRange, cn } from "@/lib/utils";
import { usePolicies, getCancellationWindowMs } from "@/hooks/usePolicies";
import { useTranslations } from "next-intl";

interface FriendInfo {
  id: string;
  name: string | null;
  image: string | null;
}

interface UpcomingBooking {
  id: string;
  classId: string;
  spotNumber: number | null;
  status: string;
  friendsGoing: FriendInfo[];
  class: {
    startsAt: string;
    endsAt: string;
    classType: { name: string; color: string; duration: number; icon?: string | null };
    coach: { name: string; photoUrl?: string | null; user?: { name?: string | null; image?: string | null } | null };
    room?: { studio?: { name?: string } };
  };
}

function hoursUntilClass(startsAt: string | Date) {
  return Math.max(0, Math.round((new Date(startsAt).getTime() - Date.now()) / 3_600_000));
}

export function UpcomingClasses() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const t = useTranslations("feed");
  const policies = usePolicies();
  const cancellationWindowMs = getCancellationWindowMs(policies.cancellationWindowHours);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<UpcomingBooking | null>(null);

  function canCancelFreely(startsAt: string | Date) {
    return new Date(startsAt).getTime() - Date.now() > cancellationWindowMs;
  }

  const { data: bookings = [] } = useQuery<UpcomingBooking[]>({
    queryKey: ["bookings", "upcoming"],
    queryFn: async () => {
      const res = await fetch("/api/bookings?status=upcoming");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!session?.user,
    staleTime: 30_000,
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

  const handleShare = useCallback(async (b: UpcomingBooking) => {
    const classUrl = `${window.location.origin}/class/${b.classId}`;
    const date = new Date(b.class.startsAt);
    const dayStr = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = formatTimeRange(b.class.startsAt, b.class.endsAt);
    const text = `${b.class.classType.name} con ${b.class.coach.name}\n${dayStr}, ${timeStr}\n¡Reserva tu lugar!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: b.class.classType.name, text, url: classUrl });
      } catch {}
    } else {
      await navigator.clipboard.writeText(`${text}\n${classUrl}`);
      setCopiedId(b.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  if (bookings.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 font-display text-[17px] font-bold text-foreground">
        {t("upcomingForYou")}
      </h2>

      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 scrollbar-none">
        {bookings.map((b) => {
          const studioName = (b.class as unknown as { room?: { studio?: { name?: string } } }).room?.studio?.name;
          const startDate = new Date(b.class.startsAt);
          const dayLabel = format(startDate, "EEE d 'de' MMM", { locale: es });

          return (
            <div
              key={b.id}
              className="w-[82vw] max-w-[320px] shrink-0 snap-start"
            >
              {/* Time / day header outside the card */}
              <div className="mb-1.5 flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                <span className="text-[13px] font-semibold capitalize text-foreground">
                  {formatTime(b.class.startsAt)} / {dayLabel}
                  <span className="font-normal text-muted"> · {b.class.classType.duration} min</span>
                </span>
              </div>

              <Link href={`/class/${b.classId}`} className="block">
                <div className="rounded-2xl border border-border/40 bg-card px-4 py-3.5 shadow-sm transition-shadow active:shadow-md">
                  <div className="flex items-center gap-3">
                    {(b.class.coach.photoUrl || b.class.coach.user?.image) ? (
                      <img
                        src={(b.class.coach.photoUrl || b.class.coach.user?.image)!}
                        alt={b.class.coach.name || "Coach"}
                        className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent">
                        {b.class.coach.name?.charAt(0) || "C"}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[15px] font-bold text-foreground">
                          {b.class.classType.name}
                        </p>
                        {b.spotNumber && (
                          <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] font-semibold text-muted">
                            #{b.spotNumber}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[13px] text-muted">
                        con {b.class.coach.name?.split(" ")[0]}
                        {studioName && <span className="text-muted/50"> · {studioName}</span>}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); handleShare(b); }}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface text-muted transition-colors active:scale-95"
                    >
                      {copiedId === b.id ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Share className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {/* Friends + Cancel — same row */}
                  <div className="mt-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {b.friendsGoing?.length > 0 && (
                        <>
                          <div className="flex -space-x-1.5">
                            {b.friendsGoing.slice(0, 4).map((f) => (
                              <Avatar key={f.id} className="h-5 w-5 ring-2 ring-white">
                                {f.image && <AvatarImage src={f.image} />}
                                <AvatarFallback className="text-[8px] font-semibold">
                                  {(f.name ?? "?")[0]}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <span className="text-[10px] font-medium text-accent">
                            {b.friendsGoing.length === 1
                              ? `${b.friendsGoing[0].name?.split(" ")[0]} va`
                              : `${b.friendsGoing.length} amigos van`}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); setCancelTarget(b); }}
                      className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

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
              className="fixed inset-x-0 bottom-0 z-[60] rounded-t-3xl bg-card pb-safe shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-sm sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
            >
              <div className="flex justify-center pt-3 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>
              <div className="p-6 text-center">
                <div
                  className={cn(
                    "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                    canCancelFreely(cancelTarget.class.startsAt) ? "bg-orange-50" : "bg-red-50",
                  )}
                >
                  <AlertTriangle
                    className={cn(
                      "h-6 w-6",
                      canCancelFreely(cancelTarget.class.startsAt) ? "text-orange-500" : "text-red-500",
                    )}
                  />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                  Cancelar reserva
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {cancelTarget.class.classType.name} · {formatRelativeDay(cancelTarget.class.startsAt)}
                </p>
                {canCancelFreely(cancelTarget.class.startsAt) ? (
                  <div className="mt-4 rounded-xl bg-green-50 px-4 py-3">
                    <p className="text-[13px] font-medium text-green-700">Tu crédito será devuelto</p>
                    <p className="mt-0.5 text-[12px] text-green-600">Faltan más de {policies.cancellationWindowHours}h para la clase</p>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl bg-red-50 px-4 py-3">
                    <p className="text-[13px] font-medium text-red-700">Tu crédito NO será devuelto</p>
                    <p className="mt-0.5 text-[12px] text-red-600">
                      Faltan {hoursUntilClass(cancelTarget.class.startsAt)}h — la ventana de cancelación es {policies.cancellationWindowHours}h.
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
                    {canCancelFreely(cancelTarget.class.startsAt) ? "Cancelar reserva" : "Cancelar sin reembolso"}
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
    </section>
  );
}
