"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, Clock, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageTransition } from "@/components/shared/page-transition";
import { formatRelativeDay, formatTimeRange, cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BookingWithDetails } from "@/types";

const CANCELLATION_WINDOW_MS = 12 * 60 * 60 * 1000;

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

const statusLabels: Record<string, { label: string; variant: "success" | "default" | "danger" | "warning" }> = {
  CONFIRMED: { label: "Confirmada", variant: "success" },
  ATTENDED: { label: "Asistió", variant: "success" },
  NO_SHOW: { label: "No asistió", variant: "danger" },
  CANCELLED: { label: "Cancelada", variant: "warning" },
};

async function fetchBookingList(status: string): Promise<BookingWithDetails[]> {
  const res = await fetch(`/api/bookings?status=${status}`);
  if (!res.ok) return [];
  return res.json();
}

export default function BookingsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState<BookingWithDetails | null>(null);

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

  const loading = loadingUpcoming || loadingPast;

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cancel failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      setCancelTarget(null);
    },
  });

  function handleCancel() {
    if (!cancelTarget) return;
    cancelMutation.mutate(cancelTarget.id);
  }

  function canCancelFreely(booking: BookingWithDetails): boolean {
    const timeUntil = new Date(booking.class.startsAt).getTime() - Date.now();
    return timeUntil > CANCELLATION_WINDOW_MS;
  }

  function renderBookingCard(booking: BookingWithDetails, showCancel: boolean) {
    const status = statusLabels[booking.status] ?? statusLabels.CONFIRMED;
    const withinWindow = !canCancelFreely(booking);

    return (
      <motion.div key={booking.id} variants={fadeUp}>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: `${booking.class.classType.color}15`,
                  color: booking.class.classType.color,
                }}
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-sm font-bold text-foreground">
                      {booking.class.classType.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {booking.class.coach.user.name}
                    </p>
                  </div>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>

                <div className="mt-3 flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1 capitalize">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatRelativeDay(booking.class.startsAt)}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-accent">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTimeRange(booking.class.startsAt, booking.class.endsAt)}
                  </span>
                </div>

                {showCancel && booking.status === "CONFIRMED" && (
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setCancelTarget(booking)}
                    >
                      Cancelar reserva
                    </Button>
                    {withinWindow && (
                      <span className="flex items-center gap-1 text-[10px] text-orange-500">
                        <AlertTriangle className="h-3 w-3" />
                        Sin reembolso de crédito
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  function renderEmptyState(message: string, cta?: string) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center">
          <Calendar className="h-10 w-10 text-muted/30" />
          <p className="mt-3 font-display text-lg font-bold text-foreground">
            {message}
          </p>
          {cta && (
            <Button asChild className="mt-5" size="sm">
              <Link href="/schedule">{cta}</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
          Mis Reservas
        </h1>

        <Tabs defaultValue="upcoming">
          <TabsList>
            <TabsTrigger value="upcoming">Próximas</TabsTrigger>
            <TabsTrigger value="past">Pasadas</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : upcoming.length === 0 ? (
              renderEmptyState("No tienes clases reservadas", "Reservar clase")
            ) : (
              <motion.div
                className="space-y-3"
                variants={stagger}
                initial="hidden"
                animate="show"
              >
                {upcoming.map((b) => renderBookingCard(b, true))}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="past">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : past.length === 0 ? (
              renderEmptyState("Aún no tienes historial de clases")
            ) : (
              <motion.div
                className="space-y-3"
                variants={stagger}
                initial="hidden"
                animate="show"
              >
                {past.map((b) => renderBookingCard(b, false))}
              </motion.div>
            )}
          </TabsContent>
        </Tabs>

        {/* Cancel confirmation dialog */}
        <Dialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar reserva</DialogTitle>
              <DialogDescription>
                {cancelTarget && canCancelFreely(cancelTarget) ? (
                  <>
                    ¿Estás segura de que quieres cancelar tu reserva para{" "}
                    <span className="font-medium text-foreground">
                      {cancelTarget.class.classType.name}
                    </span>
                    ? Tu crédito será devuelto.
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-orange-500">
                      <AlertTriangle className="h-4 w-4" />
                      Cancelación dentro de las 12 horas
                    </span>
                    <span className="mt-2 block">
                      Al cancelar dentro de las 12 horas previas a la clase, tu
                      crédito no será reembolsado. ¿Deseas continuar?
                    </span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelTarget(null)}>
                Volver
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar cancelación
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
