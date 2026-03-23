"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Save,
  Loader2,
  Music,
  ChevronDown,
  Star,
  Sparkles,
  Cake,
  Crown,
  UserPlus,
  Trophy,
  AlertTriangle,
  Heart,
  MessageCircle,
  Camera,
  ImagePlus,
  Send,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn, formatDate, formatTime } from "@/lib/utils";
import type { ClassWithDetails, BookingStatus } from "@/types";

interface FavoriteSong {
  id: string;
  title: string;
  artist: string;
}

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
  stats?: AttendeeStats;
  user: {
    id: string;
    name: string | null;
    image: string | null;
    email: string;
    favoriteSongs?: FavoriteSong[];
  };
}

interface ClassDetail extends Omit<ClassWithDetails, "bookings"> {
  bookings: BookingEntry[];
}

interface FeedPhoto {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  user: { id: string; name: string | null; image: string | null };
  createdAt: string;
}

interface FeedComment {
  id: string;
  body: string;
  user: { id: string; name: string | null; image: string | null };
  createdAt: string;
}

interface ClassFeedData {
  feedEvent: {
    id: string;
    payload: Record<string, unknown>;
    createdAt: string;
    photos: FeedPhoto[];
    comments: FeedComment[];
    likeCount: number;
    liked: boolean;
  } | null;
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

function AttendeeTags({ stats }: { stats: AttendeeStats }) {
  const tags: { label: string; icon: React.ReactNode; className: string }[] = [];

  if (stats.birthdayLabel === "today") {
    tags.push({
      label: "Cumpleaños hoy!",
      icon: <Cake className="h-3 w-3" />,
      className: "bg-pink-200 text-pink-800 border-pink-300 animate-pulse",
    });
  } else if (stats.birthdayLabel === "yesterday") {
    tags.push({
      label: "Cumpleaños ayer",
      icon: <Cake className="h-3 w-3" />,
      className: "bg-pink-100 text-pink-700 border-pink-200",
    });
  } else if (stats.birthdayLabel === "this_week") {
    tags.push({
      label: "Cumple esta semana",
      icon: <Cake className="h-3 w-3" />,
      className: "bg-pink-50 text-pink-600 border-pink-200",
    });
  }

  if (stats.isFirstEver) {
    tags.push({
      label: "Primera clase",
      icon: <Sparkles className="h-3 w-3" />,
      className: "bg-amber-100 text-amber-700 border-amber-200",
    });
  } else if (stats.isFirstWithCoach) {
    tags.push({
      label: "Primera contigo",
      icon: <UserPlus className="h-3 w-3" />,
      className: "bg-violet-100 text-violet-700 border-violet-200",
    });
  }

  if (stats.isTopClient) {
    tags.push({
      label: "Top client",
      icon: <Crown className="h-3 w-3" />,
      className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    });
  } else if (stats.isNewMember) {
    tags.push({
      label: "Nuevo",
      icon: <Star className="h-3 w-3" />,
      className: "bg-blue-100 text-blue-700 border-blue-200",
    });
  }

  if (stats.totalClasses > 1) {
    tags.push({
      label: `${stats.totalClasses} clases`,
      icon: <Trophy className="h-3 w-3" />,
      className: "bg-stone-100 text-stone-600 border-stone-200",
    });
  }

  if (stats.cancelRate != null && stats.cancelRate >= 20) {
    tags.push({
      label: `${stats.cancelRate}% cancela`,
      icon: <AlertTriangle className="h-3 w-3" />,
      className: stats.cancelRate >= 50
        ? "bg-red-100 text-red-700 border-red-200"
        : stats.cancelRate >= 35
          ? "bg-orange-100 text-orange-700 border-orange-200"
          : "bg-amber-50 text-amber-600 border-amber-200",
    });
  }

  if (tags.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight",
            tag.className,
          )}
        >
          {tag.icon}
          {tag.label}
        </span>
      ))}
    </div>
  );
}

export default function ClassRosterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState("");
  const [expandedSongs, setExpandedSongs] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: classData, isLoading } = useQuery<ClassDetail>({
    queryKey: ["class-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const isPastClass = classData ? new Date(classData.endsAt) < new Date() : false;

  const { data: feedData } = useQuery<ClassFeedData>({
    queryKey: ["class-feed", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}/feed`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id && isPastClass,
  });

  const feedEvent = feedData?.feedEvent;

  const likeMutation = useMutation({
    mutationFn: async () => {
      if (!feedEvent) return;
      const res = await fetch(`/api/feed/${feedEvent.id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "like" }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["class-feed", id] }),
  });

  const commentMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!feedEvent) return;
      const res = await fetch(`/api/feed/${feedEvent.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["class-feed", id] });
    },
  });

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !feedEvent) return;
    setUploadingPhoto(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/feed/${feedEvent.id}/photos`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error("Upload failed");
      queryClient.invalidateQueries({ queryKey: ["class-feed", id] });
    } catch {
      /* silently fail */
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

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

  const enrolled = classData.bookings.length;
  const capacity = classData.classType.maxCapacity;

  const allSongs = classData.bookings.flatMap((b) =>
    (b.user.favoriteSongs ?? []).map((s) => ({
      ...s,
      userName: b.user.name ?? b.user.email,
    })),
  );

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
              const hasSongs = (booking.user.favoriteSongs?.length ?? 0) > 0;
              const songsExpanded = expandedSongs[booking.id] ?? false;

              return (
                <motion.div key={booking.id} variants={fadeUp}>
                  <Card className={cn(
                    booking.stats?.birthdayLabel === "today" && "border-pink-300 bg-pink-50/50",
                    booking.stats?.birthdayLabel === "yesterday" && "border-pink-200 bg-pink-50/30",
                    booking.stats?.birthdayLabel === "this_week" && "border-pink-100 bg-pink-50/20",
                    !booking.stats?.birthdayLabel && booking.stats?.isFirstEver && "border-amber-200 bg-amber-50/30",
                  )}>
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <Avatar className="mt-0.5 h-10 w-10">
                          {booking.user.image && (
                            <AvatarImage src={booking.user.image} alt={name} />
                          )}
                          <AvatarFallback className="text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm font-semibold">{name}</p>
                            {hasSongs && (
                              <Music className="h-3 w-3 shrink-0 text-accent" />
                            )}
                          </div>

                          {booking.stats && <AttendeeTags stats={booking.stats} />}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {hasSongs && (
                            <button
                              onClick={() =>
                                setExpandedSongs((prev) => ({
                                  ...prev,
                                  [booking.id]: !prev[booking.id],
                                }))
                              }
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface"
                            >
                              <ChevronDown
                                className={cn(
                                  "h-4 w-4 transition-transform",
                                  songsExpanded && "rotate-180",
                                )}
                              />
                            </button>
                          )}
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
                            {booking.user.favoriteSongs!.map((song) => (
                              <div
                                key={song.id}
                                className="flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-1.5"
                              >
                                <span className="text-sm font-medium text-foreground">
                                  {song.title}
                                </span>
                                <span className="text-xs text-muted">
                                  — {song.artist}
                                </span>
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
      <div className="flex justify-end">
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

      {/* Aggregate favorite songs */}
      {allSongs.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-accent/15">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Music className="h-4 w-4 text-accent" />
                Canciones favoritas de la clase
              </CardTitle>
              <p className="text-xs text-muted">
                Basado en las preferencias de los {classData.bookings.filter((b) => (b.user.favoriteSongs?.length ?? 0) > 0).length} alumnos que tienen canciones registradas
              </p>
            </CardHeader>
            <CardContent className="space-y-1.5 pt-0">
              {allSongs.map((song) => (
                <div
                  key={`${song.id}-${song.userName}`}
                  className="flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-2"
                >
                  <Music className="h-3 w-3 shrink-0 text-accent/60" />
                  <span className="text-sm font-medium">{song.title}</span>
                  <span className="text-xs text-muted">— {song.artist}</span>
                  <span className="ml-auto text-[11px] text-muted/70">
                    {song.userName}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Feed section — only for past classes */}
      {isPastClass && feedEvent && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="overflow-hidden border-coach/15">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="h-4 w-4 text-coach" />
                Recuerdos de la clase
              </CardTitle>
              <p className="text-xs text-muted">
                Fotos, likes y comentarios del feed
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {/* Like + comment + photo counts */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => likeMutation.mutate()}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    feedEvent.liked
                      ? "bg-red-50 text-red-600"
                      : "bg-surface text-muted hover:text-foreground",
                  )}
                >
                  <Heart
                    className={cn("h-3.5 w-3.5", feedEvent.liked && "fill-red-500")}
                  />
                  {feedEvent.likeCount}
                </button>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {feedEvent.comments.length}
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <Camera className="h-3.5 w-3.5" />
                  {feedEvent.photos.length}
                </span>
              </div>

              {/* Photos grid */}
              {feedEvent.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {feedEvent.photos.map((photo) => (
                    <div
                      key={photo.id}
                      className="group relative aspect-square overflow-hidden rounded-xl bg-surface"
                    >
                      <img
                        src={photo.thumbnailUrl ?? photo.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="text-[10px] font-medium text-white">
                          {photo.user.name?.split(" ")[0]}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload photo */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-coach/30 py-3 text-xs font-medium text-coach transition-colors hover:bg-coach/5"
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ImagePlus className="h-4 w-4" />
                )}
                {uploadingPhoto ? "Subiendo..." : "Agregar foto"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />

              {/* Comments */}
              {feedEvent.comments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                    Comentarios
                  </p>
                  {feedEvent.comments.map((comment) => (
                    <div key={comment.id} className="flex gap-2">
                      <Avatar className="mt-0.5 h-6 w-6 shrink-0">
                        {comment.user.image && (
                          <AvatarImage src={comment.user.image} />
                        )}
                        <AvatarFallback className="text-[9px]">
                          {(comment.user.name ?? "U").charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 rounded-xl bg-surface px-3 py-2">
                        <p className="text-[11px] font-semibold">
                          {comment.user.name?.split(" ")[0]}
                        </p>
                        <p className="text-xs text-foreground">{comment.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (commentText.trim()) commentMutation.mutate(commentText.trim());
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Escribe un comentario..."
                  className="flex-1 rounded-full border border-input-border bg-white px-4 py-2 text-sm transition-colors focus:border-coach focus:outline-none"
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={!commentText.trim() || commentMutation.isPending}
                  className="h-9 w-9 rounded-full bg-coach p-0 hover:bg-coach/90"
                >
                  {commentMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Prompt to complete class if past but no feed event yet */}
      {isPastClass && !feedEvent && classData.status !== "COMPLETED" && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-dashed border-coach/20">
            <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
              <Camera className="h-8 w-8 text-muted/30" />
              <p className="text-sm font-medium text-foreground">
                Clase terminada
              </p>
              <p className="text-xs text-muted">
                Guarda la asistencia para habilitar fotos, likes y comentarios en el feed.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="pb-8" />
    </div>
  );
}
