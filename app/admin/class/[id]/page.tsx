"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
  Lock,
  Unlock,
  ChevronDown,
  Star,
  Sparkles,
  Cake,
  Crown,
  UserPlus,
  Trophy,
  AlertTriangle,
  Music,
  MapPin,
  StickyNote,
  Ban,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { StudioMap, type SpotInfo, type RoomLayoutData } from "@/components/shared/studio-map";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { toast } from "sonner";
import type { BookingStatus } from "@/types";

interface AttendeeStats {
  totalClasses: number;
  classesWithCoach: number;
  isNewMember: boolean;
  isFirstEver: boolean;
  isFirstWithCoach: boolean;
  isTopClient: boolean;
  birthdayLabel: "today" | "yesterday" | "this_week" | null;
  cancelRate: number | null;
}

interface BookingEntry {
  id: string;
  status: BookingStatus;
  spotNumber: number | null;
  guestName: string | null;
  guestEmail: string | null;
  stats?: AttendeeStats;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
    favoriteSongs?: { id: string; title: string; artist: string; albumArt?: string | null }[];
  } | null;
}

interface ClassDetail {
  id: string;
  classTypeId: string;
  classType: { id: string; name: string; color: string; duration: number; icon?: string | null };
  coach: { id: string; userId: string; color: string; name: string; user?: { name?: string | null; image?: string | null } | null };
  room: {
    id: string;
    name: string;
    maxCapacity: number;
    layout: RoomLayoutData | null;
    studio: { id: string; name: string };
  };
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string | null;
  tag: string | null;
  blockingNotes: string | null;
  bookings: BookingEntry[];
  blockedSpots: { id: string; spotNumber: number | null; createdAt: string }[];
  spotsLeft: number;
  spotMap: Record<number, SpotInfo>;
  _count: { bookings: number; blockedSpots: number; waitlist: number; songRequests: number };
}

type AttendanceStatus = "CONFIRMED" | "ATTENDED" | "NO_SHOW";

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function AttendeeTags({ stats }: { stats: AttendeeStats }) {
  const tags: { label: string; icon: React.ReactNode; className: string }[] = [];

  if (stats.birthdayLabel === "today") {
    tags.push({ label: "Cumpleaños hoy!", icon: <Cake className="h-3 w-3" />, className: "bg-pink-200 text-pink-800 border-pink-300 animate-pulse" });
  } else if (stats.birthdayLabel === "yesterday") {
    tags.push({ label: "Cumpleaños ayer", icon: <Cake className="h-3 w-3" />, className: "bg-pink-100 text-pink-700 border-pink-200" });
  } else if (stats.birthdayLabel === "this_week") {
    tags.push({ label: "Cumple esta semana", icon: <Cake className="h-3 w-3" />, className: "bg-pink-50 text-pink-600 border-pink-200" });
  }

  if (stats.isFirstEver) {
    tags.push({ label: "Primera clase", icon: <Sparkles className="h-3 w-3" />, className: "bg-amber-100 text-amber-700 border-amber-200" });
  } else if (stats.isFirstWithCoach) {
    tags.push({ label: "Primera con coach", icon: <UserPlus className="h-3 w-3" />, className: "bg-violet-100 text-violet-700 border-violet-200" });
  }

  if (stats.isTopClient) {
    tags.push({ label: "Top client", icon: <Crown className="h-3 w-3" />, className: "bg-yellow-100 text-yellow-700 border-yellow-200" });
  } else if (stats.isNewMember) {
    tags.push({ label: "Nuevo", icon: <Star className="h-3 w-3" />, className: "bg-blue-100 text-blue-700 border-blue-200" });
  }

  if (stats.totalClasses > 1) {
    tags.push({ label: `${stats.totalClasses} clases`, icon: <Trophy className="h-3 w-3" />, className: "bg-stone-100 text-stone-600 border-stone-200" });
  }

  if (stats.cancelRate != null && stats.cancelRate >= 20) {
    tags.push({
      label: `${stats.cancelRate}% cancela`,
      icon: <AlertTriangle className="h-3 w-3" />,
      className: stats.cancelRate >= 50 ? "bg-red-100 text-red-700 border-red-200" : stats.cancelRate >= 35 ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-amber-50 text-amber-600 border-amber-200",
    });
  }

  if (tags.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span key={tag.label} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight", tag.className)}>
          {tag.icon}
          {tag.label}
        </span>
      ))}
    </div>
  );
}

export default function AdminClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [blockingMode, setBlockingMode] = useState(false);
  const [blockingNotes, setBlockingNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const notesTimerRef = useRef<NodeJS.Timeout>(undefined);
  const [expandedSongs, setExpandedSongs] = useState<Record<string, boolean>>({});

  const { data: classData, isLoading } = useQuery<ClassDetail>({
    queryKey: ["class-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (classData?.blockingNotes != null) {
      setBlockingNotes(classData.blockingNotes);
    }
  }, [classData?.blockingNotes]);

  const isPastClass = classData ? new Date(classData.endsAt) < new Date() : false;
  const isCompleted = classData?.status === "COMPLETED";

  useEffect(() => {
    if (classData && isPastClass && !isCompleted) {
      const defaults: Record<string, AttendanceStatus> = {};
      for (const b of classData.bookings) {
        if (b.status === "CONFIRMED") {
          defaults[b.id] = "ATTENDED";
        }
      }
      setAttendance((prev) => {
        const merged = { ...defaults };
        for (const [k, v] of Object.entries(prev)) {
          if (v) merged[k] = v;
        }
        return merged;
      });
    }
  }, [classData, isPastClass, isCompleted]);

  const blockSpotMutation = useMutation({
    mutationFn: async (spotNumber: number) => {
      const res = await fetch(`/api/admin/classes/${id}/blocked-spots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotNumber }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to block spot");
      }
      return res.json();
    },
    onMutate: async (spotNumber) => {
      await queryClient.cancelQueries({ queryKey: ["class-detail", id] });
      const prev = queryClient.getQueryData<ClassDetail>(["class-detail", id]);
      if (prev) {
        queryClient.setQueryData<ClassDetail>(["class-detail", id], {
          ...prev,
          spotMap: { ...prev.spotMap, [spotNumber]: { status: "blocked" } },
          blockedSpots: [...prev.blockedSpots, { id: `temp-${spotNumber}`, spotNumber, createdAt: new Date().toISOString() }],
          _count: { ...prev._count, blockedSpots: prev._count.blockedSpots + 1 },
          spotsLeft: prev.spotsLeft - 1,
        });
      }
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["class-detail", id], ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["class-detail", id] }),
  });

  const unblockSpotMutation = useMutation({
    mutationFn: async (spotNumber: number) => {
      const res = await fetch(`/api/admin/classes/${id}/blocked-spots`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotNumber }),
      });
      if (!res.ok) throw new Error("Failed to unblock spot");
      return res.json();
    },
    onMutate: async (spotNumber) => {
      await queryClient.cancelQueries({ queryKey: ["class-detail", id] });
      const prev = queryClient.getQueryData<ClassDetail>(["class-detail", id]);
      if (prev) {
        const newSpotMap = { ...prev.spotMap };
        delete newSpotMap[spotNumber];
        queryClient.setQueryData<ClassDetail>(["class-detail", id], {
          ...prev,
          spotMap: newSpotMap,
          blockedSpots: prev.blockedSpots.filter((bs) => bs.spotNumber !== spotNumber),
          _count: { ...prev._count, blockedSpots: Math.max(0, prev._count.blockedSpots - 1) },
          spotsLeft: prev.spotsLeft + 1,
        });
      }
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["class-detail", id], ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["class-detail", id] }),
  });

  const blockGenericMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/classes/${id}/blocked-spots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotNumber: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to block spot");
      }
      return res.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["class-detail", id] });
      const prev = queryClient.getQueryData<ClassDetail>(["class-detail", id]);
      if (prev) {
        queryClient.setQueryData<ClassDetail>(["class-detail", id], {
          ...prev,
          blockedSpots: [...prev.blockedSpots, { id: `temp-${Date.now()}`, spotNumber: null, createdAt: new Date().toISOString() }],
          _count: { ...prev._count, blockedSpots: prev._count.blockedSpots + 1 },
          spotsLeft: prev.spotsLeft - 1,
        });
      }
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["class-detail", id], ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["class-detail", id] }),
  });

  const unblockGenericMutation = useMutation({
    mutationFn: async (blockedSpotId: string) => {
      const res = await fetch(`/api/admin/classes/${id}/blocked-spots`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blockedSpotId }),
      });
      if (!res.ok) throw new Error("Failed to unblock");
      return res.json();
    },
    onMutate: async (blockedSpotId) => {
      await queryClient.cancelQueries({ queryKey: ["class-detail", id] });
      const prev = queryClient.getQueryData<ClassDetail>(["class-detail", id]);
      if (prev) {
        queryClient.setQueryData<ClassDetail>(["class-detail", id], {
          ...prev,
          blockedSpots: prev.blockedSpots.filter((bs) => bs.id !== blockedSpotId),
          _count: { ...prev._count, blockedSpots: Math.max(0, prev._count.blockedSpots - 1) },
          spotsLeft: prev.spotsLeft + 1,
        });
      }
      return { prev };
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["class-detail", id], ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["class-detail", id] }),
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
      toast.success("Asistencia guardada");
    },
  });

  const handleNotesChange = useCallback(
    (value: string) => {
      setBlockingNotes(value);
      setNotesSaved(false);
      clearTimeout(notesTimerRef.current);
      notesTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/classes/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ blockingNotes: value.trim() || null }),
          });
          setNotesSaved(true);
        } catch {}
      }, 1200);
    },
    [id],
  );

  const handleToggleBlock = useCallback(
    (spotNumber: number) => {
      if (!classData) return;
      const isCurrentlyBlocked = classData.spotMap[spotNumber]?.status === "blocked";
      const isOccupied = classData.spotMap[spotNumber] && classData.spotMap[spotNumber].status !== "blocked";

      if (isOccupied) {
        toast.error("Ese lugar tiene una reserva activa");
        return;
      }

      if (isCurrentlyBlocked) {
        unblockSpotMutation.mutate(spotNumber);
      } else {
        blockSpotMutation.mutate(spotNumber);
      }
    },
    [classData, blockSpotMutation, unblockSpotMutation],
  );

  const getAttendance = (booking: BookingEntry): AttendanceStatus =>
    attendance[booking.id] ?? (booking.status as AttendanceStatus);

  const toggleAttendance = (bookingId: string, current: AttendanceStatus) => {
    if (isPastClass) {
      setAttendance((prev) => ({
        ...prev,
        [bookingId]: current === "ATTENDED" ? "NO_SHOW" : "ATTENDED",
      }));
    } else {
      const next: AttendanceStatus =
        current === "CONFIRMED" ? "ATTENDED" : current === "ATTENDED" ? "NO_SHOW" : "CONFIRMED";
      setAttendance((prev) => ({ ...prev, [bookingId]: next }));
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-2xl" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
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

  const enrolled = classData.bookings.filter((b) => b.status !== "NO_SHOW").length;
  const capacity = classData.room.maxCapacity;
  const blockedCount = classData._count.blockedSpots;
  const hasLayout = classData.room.layout && (classData.room.layout as RoomLayoutData).spots?.length > 0;
  const genericBlockedSpots = classData.blockedSpots.filter((bs) => bs.spotNumber == null);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-32">
      {/* Back link */}
      <Link
        href="/admin/classes"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a clases
      </Link>

      {/* Class header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="overflow-hidden border-admin/15">
          <div className="h-1.5" style={{ backgroundColor: classData.classType.color || "#1A2C4E" }} />
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="font-display text-2xl font-bold">{classData.classType.name}</h1>
                <p className="mt-1 text-muted">{formatDate(classData.startsAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                {classData.status === "COMPLETED" && (
                  <Badge className="border-green-200 bg-green-50 text-green-700">Completada</Badge>
                )}
                {classData.status === "CANCELLED" && (
                  <Badge variant="danger">Cancelada</Badge>
                )}
                <Badge className="border-admin/20 bg-admin/10 text-admin text-base">
                  {enrolled}/{capacity}
                </Badge>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatTime(classData.startsAt)} – {formatTime(classData.endsAt)}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" />
                {capacity - enrolled - blockedCount} disponibles
                {blockedCount > 0 && (
                  <span className="text-red-500">· {blockedCount} bloqueado{blockedCount !== 1 ? "s" : ""}</span>
                )}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {classData.room.studio.name} · {classData.room.name}
              </span>
            </div>
            <div className="mt-2 text-sm text-muted">
              Coach: <span className="font-medium text-foreground">{classData.coach.name}</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── BLOCKING SECTION ─── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card className="border-red-200/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-red-500" />
                Bloqueo de lugares
              </CardTitle>
              {hasLayout && (
                <Button
                  variant={blockingMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBlockingMode(!blockingMode)}
                  className={cn(
                    "gap-1.5 text-xs",
                    blockingMode && "bg-red-500 hover:bg-red-600",
                  )}
                >
                  {blockingMode ? (
                    <><Unlock className="h-3.5 w-3.5" /> Salir de modo bloqueo</>
                  ) : (
                    <><Lock className="h-3.5 w-3.5" /> Modo bloqueo</>
                  )}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">
              {hasLayout
                ? blockingMode
                  ? "Toca un lugar para bloquearlo o desbloquearlo"
                  : "Activa el modo bloqueo para seleccionar lugares en el mapa"
                : "Bloquea lugares genéricos para reducir la capacidad disponible"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {/* Map (layout mode) */}
            {hasLayout && (
              <StudioMap
                maxCapacity={capacity}
                spotMap={classData.spotMap}
                selectedSpot={null}
                onSelectSpot={() => {}}
                layout={classData.room.layout as RoomLayoutData}
                coachName={classData.coach.name}
                adminMode={blockingMode}
                onToggleBlock={handleToggleBlock}
                disabled={!blockingMode}
              />
            )}

            {/* No-layout mode: generic blocking */}
            {!hasLayout && (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-red-50/60 p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Lugares bloqueados: <span className="font-bold text-red-600">{genericBlockedSpots.length}</span>
                    </p>
                    <p className="text-xs text-muted">
                      Capacidad efectiva: {capacity - genericBlockedSpots.length} de {capacity}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => blockGenericMutation.mutate()}
                      disabled={blockGenericMutation.isPending || genericBlockedSpots.length >= capacity - enrolled}
                      className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                    >
                      {blockGenericMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Lock className="h-3.5 w-3.5" />
                      )}
                      +1 bloqueado
                    </Button>
                  </div>
                </div>

                {genericBlockedSpots.length > 0 && (
                  <div className="space-y-1.5">
                    {genericBlockedSpots.map((bs, idx) => (
                      <div
                        key={bs.id}
                        className="flex items-center justify-between rounded-lg bg-red-50/40 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Ban className="h-3.5 w-3.5 text-red-400" />
                          <span className="text-sm text-foreground">Lugar bloqueado #{idx + 1}</span>
                        </div>
                        <button
                          onClick={() => unblockGenericMutation.mutate(bs.id)}
                          disabled={unblockGenericMutation.isPending}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-500 transition-colors hover:bg-red-100"
                        >
                          Desbloquear
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Blocking summary for layout mode */}
            {hasLayout && blockedCount > 0 && (
              <div className="rounded-lg bg-red-50/60 px-3 py-2">
                <p className="text-xs font-medium text-red-600">
                  {blockedCount} lugar{blockedCount !== 1 ? "es" : ""} bloqueado{blockedCount !== 1 ? "s" : ""}
                  {" "}— Lugares: {classData.blockedSpots.filter((bs) => bs.spotNumber != null).map((bs) => `#${bs.spotNumber}`).join(", ")}
                </p>
              </div>
            )}

            {/* Notes */}
            <div className="relative">
              <div className="mb-1.5 flex items-center gap-1.5">
                <StickyNote className="h-3.5 w-3.5 text-muted" />
                <span className="text-xs font-medium text-muted">Notas de bloqueo</span>
              </div>
              <textarea
                value={blockingNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Ej: Lugar 5 reservado para invitada especial María García. Lugar 8 fuera de servicio por mantenimiento..."
                className="w-full resize-none rounded-lg border border-border/60 bg-white p-3 pr-20 text-sm transition-colors focus:border-admin focus:outline-none focus:ring-1 focus:ring-admin/30"
                rows={2}
              />
              {blockingNotes.trim() && (
                <span
                  className={cn(
                    "absolute bottom-3 right-3 text-[11px] font-medium transition-opacity",
                    notesSaved ? "text-green-600" : "text-muted/50",
                  )}
                >
                  {notesSaved ? "✓ Guardado" : "Guardando..."}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── ROSTER ─── */}
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
          <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
            {classData.bookings.map((booking) => {
              const status = getAttendance(booking);
              const name = booking.user?.name ?? booking.guestName ?? booking.user?.email ?? booking.guestEmail ?? "—";
              const hasSongs = (booking.user?.favoriteSongs?.length ?? 0) > 0;
              const songsExpanded = expandedSongs[booking.id] ?? false;

              return (
                <motion.div key={booking.id} variants={fadeUp}>
                  <Card
                    className={cn(
                      booking.stats?.birthdayLabel === "today" && "border-pink-300 bg-pink-50/50",
                      booking.stats?.birthdayLabel === "yesterday" && "border-pink-200 bg-pink-50/30",
                      booking.stats?.birthdayLabel === "this_week" && "border-pink-100 bg-pink-50/20",
                      !booking.stats?.birthdayLabel && booking.stats?.isFirstEver && "border-amber-200 bg-amber-50/30",
                    )}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        {booking.user ? (
                          <UserAvatar user={booking.user as UserAvatarUser} size={40} className="mt-0.5" />
                        ) : (
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted">
                            <Users className="h-4 w-4" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            {!booking.user && booking.guestEmail && (
                              <Badge variant="outline" className="text-[10px]">Invitado</Badge>
                            )}
                            {booking.spotNumber != null && (
                              <span className="text-[11px] font-mono text-muted">#{booking.spotNumber}</span>
                            )}
                            {hasSongs && <Music className="h-3 w-3 shrink-0 text-accent" />}
                          </div>
                          {booking.stats && <AttendeeTags stats={booking.stats} />}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {hasSongs && (
                            <button
                              onClick={() => setExpandedSongs((prev) => ({ ...prev, [booking.id]: !prev[booking.id] }))}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface"
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", songsExpanded && "rotate-180")} />
                            </button>
                          )}
                          <button
                            onClick={() => toggleAttendance(booking.id, status)}
                            className={cn(
                              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                              status === "ATTENDED" && "bg-green-100 text-green-700",
                              status === "NO_SHOW" && "bg-red-100 text-red-700",
                              status === "CONFIRMED" && "bg-surface text-muted",
                            )}
                          >
                            {status === "ATTENDED" && (<><CheckCircle2 className="h-3.5 w-3.5" /> Asistió</>)}
                            {status === "NO_SHOW" && (<><XCircle className="h-3.5 w-3.5" /> No show</>)}
                            {status === "CONFIRMED" && "Confirmado"}
                          </button>
                        </div>
                      </div>

                      {hasSongs && songsExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="mt-3 overflow-hidden border-t border-border/50 pt-3"
                        >
                          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                            <Music className="h-3 w-3" />
                            Canciones favoritas
                          </p>
                          <div className="space-y-1">
                            {booking.user!.favoriteSongs!.map((song) => (
                              <div key={song.id} className="flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-1.5">
                                {song.albumArt ? (
                                  <img src={song.albumArt} alt={song.title} className="h-7 w-7 shrink-0 rounded object-cover" />
                                ) : (
                                  <Music className="h-3 w-3 shrink-0 text-accent/60" />
                                )}
                                <span className="text-sm font-medium text-foreground">{song.title}</span>
                                <span className="text-xs text-muted">— {song.artist}</span>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {/* Save attendance */}
      {classData.bookings.length > 0 && Object.keys(attendance).length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2 bg-admin hover:bg-admin/90"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar asistencia
          </Button>
        </div>
      )}

      <div className="pb-8" />
    </div>
  );
}
