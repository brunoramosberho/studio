"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatDate, formatTime } from "@/lib/utils";
import type { ClassWithDetails, BookingStatus } from "@/types";

interface BookingEntry {
  id: string;
  status: BookingStatus;
  user: { id: string; name: string | null; image: string | null; email: string };
}

interface ClassDetail extends Omit<ClassWithDetails, "bookings"> {
  bookings: BookingEntry[];
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

type AttendanceStatus = "CONFIRMED" | "ATTENDED" | "NO_SHOW";

export default function ClassRosterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState("");

  const { data: classData, isLoading } = useQuery<ClassDetail>({
    queryKey: ["class-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = Object.entries(attendance).map(([bookingId, status]) =>
        fetch(`/api/bookings/${bookingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }),
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-detail", id] });
    },
  });

  const getAttendance = (booking: BookingEntry): AttendanceStatus =>
    attendance[booking.id] ?? (booking.status as AttendanceStatus);

  const toggleAttendance = (bookingId: string, current: AttendanceStatus) => {
    const next: AttendanceStatus =
      current === "CONFIRMED"
        ? "ATTENDED"
        : current === "ATTENDED"
          ? "NO_SHOW"
          : "CONFIRMED";
    setAttendance((prev) => ({ ...prev, [bookingId]: next }));
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted">Clase no encontrada</p>
        <Button variant="ghost" onClick={() => router.back()}>
          Volver
        </Button>
      </div>
    );
  }

  const enrolled = classData.bookings.length;
  const capacity = classData.classType.maxCapacity;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Back link */}
      <Link
        href="/coach"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver al dashboard
      </Link>

      {/* Class header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden border-coach/15">
          <div
            className="h-1.5"
            style={{ backgroundColor: classData.classType.color || "#2D5016" }}
          />
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold">
                  {classData.classType.name}
                </h1>
                <p className="mt-1 text-muted">{formatDate(classData.startsAt)}</p>
              </div>
              <Badge variant="coach" className="text-base">
                {enrolled}/{capacity}
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatTime(classData.startsAt)} – {formatTime(classData.endsAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {capacity - enrolled} lugares disponibles
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Roster */}
      <div>
        <h2 className="mb-4 font-display text-xl font-bold">Lista de asistencia</h2>

        {classData.bookings.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Users className="h-8 w-8 text-muted/30" />
              <p className="text-sm text-muted">No hay reservaciones aún</p>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="show"
            className="space-y-2"
          >
            {classData.bookings.map((booking) => {
              const status = getAttendance(booking);
              const name = booking.user.name ?? booking.user.email;
              const initials = (booking.user.name ?? "U")
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2);

              return (
                <motion.div key={booking.id} variants={fadeUp}>
                  <Card>
                    <CardContent className="flex items-center gap-3 p-3">
                      <Avatar className="h-10 w-10">
                        {booking.user.image && (
                          <AvatarImage src={booking.user.image} alt={name} />
                        )}
                        <AvatarFallback className="text-xs">
                          {initials}
                        </AvatarFallback>
                      </Avatar>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{name}</p>
                        <p className="truncate text-xs text-muted">
                          {booking.user.email}
                        </p>
                      </div>

                      <div className="flex gap-1.5">
                        <button
                          onClick={() => toggleAttendance(booking.id, status)}
                          className={cn(
                            "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                            status === "ATTENDED" &&
                              "bg-green-100 text-green-700",
                            status === "NO_SHOW" &&
                              "bg-red-100 text-red-700",
                            status === "CONFIRMED" &&
                              "bg-surface text-muted",
                          )}
                        >
                          {status === "ATTENDED" && (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Asistió
                            </>
                          )}
                          {status === "NO_SHOW" && (
                            <>
                              <XCircle className="h-3.5 w-3.5" />
                              No show
                            </>
                          )}
                          {status === "CONFIRMED" && "Confirmado"}
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Notes */}
      <div>
        <h2 className="mb-3 font-display text-lg font-bold">Notas de la clase</h2>
        <textarea
          className="w-full rounded-xl border border-input-border bg-white p-4 text-sm transition-colors focus:border-coach focus:outline-none focus:ring-1 focus:ring-coach/30"
          rows={4}
          placeholder="Agrega notas sobre la clase, observaciones de alumnos, etc."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Save button */}
      <Separator />
      <div className="flex justify-end pb-8">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={
            saveMutation.isPending || Object.keys(attendance).length === 0
          }
          className="gap-2 bg-coach hover:bg-coach/90"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Guardar asistencia
        </Button>
      </div>
    </div>
  );
}
