"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect, useCallback } from "react";
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
  ListMusic,
  Trash2,
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
  Check,
  PartyPopper,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { MediaGallery } from "@/components/feed/media-gallery";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { SpotifyTrackPicker, type SpotifyTrack } from "@/components/shared/spotify-track-picker";
import type { ClassWithDetails, BookingStatus } from "@/types";

interface FavoriteSong {
  id: string;
  title: string;
  artist: string;
  albumArt?: string | null;
}

interface SongRequestEntry {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  spotifyTrackId: string | null;
  user: { id: string; name: string | null; image: string | null };
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
  mimeType: string;
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

interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
  spotifyTrackId: string | null;
  position: number;
}

interface CompleteResponse {
  completed: boolean;
  feedEventId: string;
  attendeeCount: number;
  achievementsGranted: number;
  alreadyCompleted?: boolean;
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
      className:
        stats.cancelRate >= 50
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
  const [expandedSongs, setExpandedSongs] = useState<Record<string, boolean>>({});
  const [commentText, setCommentText] = useState("");
  const [caption, setCaption] = useState("");
  const [captionSaved, setCaptionSaved] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captionTimerRef = useRef<NodeJS.Timeout>(undefined);

  const { data: classData, isLoading } = useQuery<ClassDetail>({
    queryKey: ["class-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id,
  });

  const songRequestsEnabled = (classData as any)?.songRequestsEnabled ?? false;

  const { data: songRequests = [] } = useQuery<SongRequestEntry[]>({
    queryKey: ["class-song-requests", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}/song-request?list=all`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id && songRequestsEnabled,
  });

  const { data: playlistTracks = [], refetch: refetchPlaylist } = useQuery<PlaylistTrack[]>({
    queryKey: ["class-playlist", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}/playlist`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
  });

  const addTrackMutation = useMutation({
    mutationFn: async (track: SpotifyTrack) => {
      const res = await fetch(`/api/classes/${id}/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: track.name,
          artist: track.artist,
          spotifyTrackId: track.trackId,
          albumArt: track.albumArt,
          previewUrl: track.previewUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to add track");
      return res.json();
    },
    onSuccess: () => refetchPlaylist(),
  });

  const removeTrackMutation = useMutation({
    mutationFn: async (trackId: string) => {
      const res = await fetch(`/api/classes/${id}/playlist?trackId=${trackId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => refetchPlaylist(),
  });

  const isPastClass = classData ? new Date(classData.endsAt) < new Date() : false;
  const isCompleted = classData?.status === "COMPLETED";

  const { data: feedData, refetch: refetchFeed } = useQuery<ClassFeedData>({
    queryKey: ["class-feed", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}/feed`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!id && isPastClass,
  });

  const feedEvent = feedData?.feedEvent;

  const completeMutation = useMutation<CompleteResponse>({
    mutationFn: async () => {
      const attendedUserIds = classData!.bookings
        .filter((b) => {
          const status = attendance[b.id] ?? b.status;
          return status === "ATTENDED";
        })
        .map((b) => b.user.id);

      const res = await fetch(`/api/classes/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attendedUserIds }),
      });
      if (!res.ok) throw new Error("Failed to complete class");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["class-feed", id] });
    },
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

  const createPostMutation = useMutation<CompleteResponse>({
    mutationFn: async () => {
      const res = await fetch(`/api/classes/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["class-feed", id] });
    },
  });

  const showPostFlow = isCompleted || completeMutation.isSuccess;
  const feedEventId =
    feedEvent?.id ??
    completeMutation.data?.feedEventId ??
    createPostMutation.data?.feedEventId;

  useEffect(() => {
    if (classData && isPastClass && !isCompleted && !completeMutation.isSuccess) {
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
  }, [classData, isPastClass, isCompleted, completeMutation.isSuccess]);

  useEffect(() => {
    if (feedEvent) {
      const existing = (feedEvent.payload?.caption as string) ?? "";
      setCaption(existing);
      if (existing) setCaptionSaved(true);
    }
  }, [feedEvent]);

  const handleCaptionChange = useCallback(
    (value: string) => {
      setCaption(value);
      setCaptionSaved(false);
      clearTimeout(captionTimerRef.current);
      if (!feedEventId) return;
      captionTimerRef.current = setTimeout(async () => {
        try {
          await fetch(`/api/feed/${feedEventId}/caption`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caption: value.trim() }),
          });
          setCaptionSaved(true);
        } catch {}
      }, 1500);
    },
    [feedEventId],
  );

  async function handlePhotosSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0 || !feedEventId) return;

    const newPreviews = Array.from(files).map((f) => URL.createObjectURL(f));
    setPreviewUrls((prev) => [...prev, ...newPreviews]);
    setUploadingPhotos(true);

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      try {
        await fetch(`/api/feed/${feedEventId}/photos`, {
          method: "POST",
          body: form,
        });
      } catch {}
    }

    setUploadingPhotos(false);
    setPreviewUrls([]);
    newPreviews.forEach((url) => URL.revokeObjectURL(url));
    refetchFeed();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const getAttendance = (booking: BookingEntry): AttendanceStatus =>
    attendance[booking.id] ?? (booking.status as AttendanceStatus);

  const toggleAttendance = (bookingId: string, current: AttendanceStatus) => {
    if (isPastClass && !isCompleted) {
      setAttendance((prev) => ({
        ...prev,
        [bookingId]: current === "ATTENDED" ? "NO_SHOW" : "ATTENDED",
      }));
    } else {
      const next: AttendanceStatus =
        current === "CONFIRMED"
          ? "ATTENDED"
          : current === "ATTENDED"
            ? "NO_SHOW"
            : "CONFIRMED";
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

  const enrolled = classData.bookings.length;
  const capacity = classData.room?.maxCapacity ?? 0;
  const attendedCount = classData.bookings.filter(
    (b) => getAttendance(b) === "ATTENDED",
  ).length;

  const allSongs = classData.bookings.flatMap((b) =>
    (b.user.favoriteSongs ?? []).map((s) => ({
      ...s,
      userName: b.user.name ?? b.user.email,
    })),
  );

  const photos = feedEvent?.photos ?? [];
  const allMedia = [
    ...photos.map((p) => ({
      id: p.id,
      url: p.url,
      thumbnailUrl: p.thumbnailUrl,
      mimeType: p.mimeType ?? "image/jpeg",
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-32">
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
              <div className="flex items-center gap-2">
                {showPostFlow && (
                  <Badge className="border-green-200 bg-green-50 text-green-700">
                    <Check className="mr-1 h-3 w-3" />
                    Completada
                  </Badge>
                )}
                <Badge variant="coach" className="text-base">
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
                {capacity - enrolled} lugares disponibles
              </span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── PLAYLIST ─── */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-green-200/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListMusic className="h-4 w-4 text-green-600" />
              Playlist de la clase
            </CardTitle>
            <p className="text-xs text-muted">
              {playlistTracks.length > 0
                ? `${playlistTracks.length} canción${playlistTracks.length !== 1 ? "es" : ""}`
                : "Agrega canciones que sonarán en la clase"}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {playlistTracks.length > 0 && (
              <div className="space-y-1.5">
                {playlistTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-2.5 rounded-lg bg-green-50/60 px-3 py-2"
                  >
                    <span className="w-5 text-center text-xs font-medium text-muted/60">
                      {idx + 1}
                    </span>
                    {track.albumArt ? (
                      <img
                        src={track.albumArt}
                        alt={track.title}
                        className="h-9 w-9 shrink-0 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-100">
                        <Music className="h-4 w-4 text-green-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{track.title}</p>
                      <p className="truncate text-xs text-muted">{track.artist}</p>
                    </div>
                    <button
                      onClick={() => removeTrackMutation.mutate(track.id)}
                      disabled={removeTrackMutation.isPending}
                      className="shrink-0 rounded-full p-1.5 text-muted/50 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <SpotifyTrackPicker
              onConfirm={async (track) => { await addTrackMutation.mutateAsync(track); }}
              isSubmitting={addTrackMutation.isPending}
              confirmLabel="Agregar a playlist"
              searchPlaceholder="Buscar canción para la playlist..."
            />
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── POST-CLASS FLOW ─── */}
      <AnimatePresence mode="wait">
        {showPostFlow && (
          <motion.div
            key="post-flow"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="space-y-5"
          >
            {/* Success banner */}
            {completeMutation.isSuccess && !completeMutation.data?.alreadyCompleted && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 rounded-2xl bg-green-50 p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <PartyPopper className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-green-800">Clase completada</p>
                  <p className="text-sm text-green-600">
                    {completeMutation.data?.attendeeCount ?? attendedCount} asistentes
                    {(completeMutation.data?.achievementsGranted ?? 0) > 0 &&
                      ` · ${completeMutation.data!.achievementsGranted} logros desbloqueados`}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Create post button for completed classes without a feed event */}
            {!feedEventId && !completeMutation.isPending && (
              <Card className="border-dashed border-coach/20">
                <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
                  <Camera className="h-8 w-8 text-muted/30" />
                  <p className="text-sm font-medium text-foreground">
                    Esta clase no tiene post en el feed
                  </p>
                  <Button
                    onClick={() => createPostMutation.mutate()}
                    disabled={createPostMutation.isPending}
                    className="gap-2 bg-coach hover:bg-coach/90"
                  >
                    {createPostMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                    Crear post en el feed
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Post creator card */}
            {feedEventId && (
            <Card className="overflow-hidden border-coach/15">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="h-4 w-4 text-coach" />
                  Post de la clase
                </CardTitle>
                <p className="text-xs text-muted">
                  Agrega fotos y un comentario para compartir con la comunidad
                </p>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                {/* Photos */}
                {allMedia.length > 0 && (
                  <MediaGallery media={allMedia} className="rounded-xl" />
                )}

                {/* Preview thumbnails (uploading) */}
                {previewUrls.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {previewUrls.map((url, i) => (
                      <div
                        key={`preview-${i}`}
                        className="relative aspect-square overflow-hidden rounded-xl bg-surface"
                      >
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover opacity-60"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Loader2 className="h-5 w-5 animate-spin text-coach" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add photos button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhotos || !feedEventId}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-coach/30 py-4 text-sm font-medium text-coach transition-colors hover:border-coach/50 hover:bg-coach/5 disabled:opacity-50"
                >
                  {uploadingPhotos ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <ImagePlus className="h-5 w-5" />
                  )}
                  {uploadingPhotos
                    ? "Subiendo fotos..."
                    : allMedia.length > 0
                      ? "Agregar más fotos"
                      : "Agregar fotos de la clase"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotosSelected}
                />

                {/* Caption */}
                <div className="relative">
                  <textarea
                    value={caption}
                    onChange={(e) => handleCaptionChange(e.target.value)}
                    placeholder="Escribe algo sobre la clase..."
                    className="w-full resize-none rounded-xl border border-input-border bg-white p-3 pr-16 text-sm transition-colors focus:border-coach focus:outline-none focus:ring-1 focus:ring-coach/30"
                    rows={2}
                    disabled={!feedEventId}
                  />
                  {caption.trim() && (
                    <span
                      className={cn(
                        "absolute bottom-3 right-3 text-[11px] font-medium transition-opacity",
                        captionSaved ? "text-green-600" : "text-muted/50",
                      )}
                    >
                      {captionSaved ? "✓ Guardado" : "Guardando..."}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
            )}

            {/* Feed interactions */}
            {feedEvent && (
              <Card className="overflow-hidden border-coach/15">
                <CardContent className="space-y-4 p-4">
                  {/* Like + comment counts */}
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
                        className={cn(
                          "h-3.5 w-3.5",
                          feedEvent.liked && "fill-red-500",
                        )}
                      />
                      {feedEvent.likeCount}
                    </button>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {feedEvent.comments.length}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      <Camera className="h-3.5 w-3.5" />
                      {photos.length}
                    </span>
                  </div>

                  {/* Comments */}
                  {feedEvent.comments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Comentarios
                      </p>
                      {feedEvent.comments.map((comment) => (
                        <div key={comment.id} className="flex gap-2">
                          <UserAvatar
                            user={comment.user as UserAvatarUser}
                            size={24}
                            showBadge={false}
                            className="mt-0.5 shrink-0"
                          />
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
                      if (commentText.trim())
                        commentMutation.mutate(commentText.trim());
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
            )}

            {/* Collapsed roster for completed classes */}
            <div>
              <button
                onClick={() => setShowRoster(!showRoster)}
                className="flex w-full items-center justify-between rounded-xl bg-surface/80 px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-surface"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Lista de asistencia ({enrolled})
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showRoster && "rotate-180",
                  )}
                />
              </button>
              <AnimatePresence>
                {showRoster && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 space-y-2">
                      {classData.bookings.map((booking) => {
                        const status = getAttendance(booking);
                        const name = booking.user.name ?? booking.user.email;
                        return (
                          <div
                            key={booking.id}
                            className="flex items-center gap-3 rounded-xl bg-white p-3"
                          >
                            <UserAvatar
                              user={booking.user as UserAvatarUser}
                              size={32}
                              showBadge={false}
                            />
                            <span className="flex-1 truncate text-sm">{name}</span>
                            <span
                              className={cn(
                                "flex items-center gap-1 text-xs font-medium",
                                status === "ATTENDED" && "text-green-600",
                                status === "NO_SHOW" && "text-red-500",
                                status === "CONFIRMED" && "text-muted",
                              )}
                            >
                              {status === "ATTENDED" && (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Asistió
                                </>
                              )}
                              {status === "NO_SHOW" && (
                                <>
                                  <XCircle className="h-3.5 w-3.5" /> No show
                                </>
                              )}
                              {status === "CONFIRMED" && "Confirmado"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ROSTER FLOW (upcoming or past uncompleted) ─── */}
      {!showPostFlow && (
        <>
          <div>
            <h2 className="mb-4 font-display text-xl font-bold">
              Lista de asistencia
            </h2>

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
                  const hasSongs = (booking.user.favoriteSongs?.length ?? 0) > 0;
                  const songsExpanded = expandedSongs[booking.id] ?? false;

                  return (
                    <motion.div key={booking.id} variants={fadeUp}>
                      <Card
                        className={cn(
                          booking.stats?.birthdayLabel === "today" &&
                            "border-pink-300 bg-pink-50/50",
                          booking.stats?.birthdayLabel === "yesterday" &&
                            "border-pink-200 bg-pink-50/30",
                          booking.stats?.birthdayLabel === "this_week" &&
                            "border-pink-100 bg-pink-50/20",
                          !booking.stats?.birthdayLabel &&
                            booking.stats?.isFirstEver &&
                            "border-amber-200 bg-amber-50/30",
                        )}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <UserAvatar
                              user={booking.user as UserAvatarUser}
                              size={40}
                              className="mt-0.5"
                            />

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-semibold">
                                  {name}
                                </p>
                                {hasSongs && (
                                  <Music className="h-3 w-3 shrink-0 text-accent" />
                                )}
                              </div>
                              {booking.stats && (
                                <AttendeeTags stats={booking.stats} />
                              )}
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
                                onClick={() =>
                                  toggleAttendance(booking.id, status)
                                }
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
                                    {song.albumArt ? (
                                      <img src={song.albumArt} alt={song.title} className="h-7 w-7 shrink-0 rounded object-cover" />
                                    ) : (
                                      <Music className="h-3 w-3 shrink-0 text-accent/60" />
                                    )}
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

          {/* Song Requests (Spotify) */}
          {songRequests.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-green-200/50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Music className="h-4 w-4 text-green-600" />
                    Canciones sugeridas
                  </CardTitle>
                  <p className="text-xs text-muted">
                    {songRequests.length} sugerencia{songRequests.length !== 1 ? "s" : ""} de los asistentes
                  </p>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {songRequests.map((sr) => (
                    <div
                      key={sr.id}
                      className="flex items-center gap-2.5 rounded-lg bg-green-50/60 px-3 py-2"
                    >
                      {sr.albumArt ? (
                        <img
                          src={sr.albumArt}
                          alt={sr.title}
                          className="h-9 w-9 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-green-100">
                          <Music className="h-4 w-4 text-green-600" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{sr.title}</p>
                        <p className="truncate text-xs text-muted">{sr.artist}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <UserAvatar
                          user={sr.user as UserAvatarUser}
                          size={20}
                          showBadge={false}
                        />
                        <span className="text-[11px] text-muted/70">
                          {sr.user.name?.split(" ")[0]}
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Songs */}
          {allSongs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="border-accent/15">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Music className="h-4 w-4 text-accent" />
                    Canciones favoritas de la clase
                  </CardTitle>
                  <p className="text-xs text-muted">
                    Basado en las preferencias de los{" "}
                    {
                      classData.bookings.filter(
                        (b) => (b.user.favoriteSongs?.length ?? 0) > 0,
                      ).length
                    }{" "}
                    alumnos que tienen canciones registradas
                  </p>
                </CardHeader>
                <CardContent className="space-y-1.5 pt-0">
                  {allSongs.map((song) => (
                    <div
                      key={`${song.id}-${song.userName}`}
                      className="flex items-center gap-2 rounded-lg bg-accent/5 px-3 py-2"
                    >
                      {(song as any).albumArt ? (
                        <img src={(song as any).albumArt} alt={song.title} className="h-8 w-8 shrink-0 rounded object-cover" />
                      ) : (
                        <Music className="h-3 w-3 shrink-0 text-accent/60" />
                      )}
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

          {/* Save / Finalize button */}
          {classData.bookings.length > 0 && (
            <>
              {isPastClass ? (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-white/95 p-4 backdrop-blur-sm safe-bottom">
                  <div className="mx-auto max-w-3xl">
                    <Button
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                      className="w-full gap-2 bg-coach py-6 text-base font-semibold hover:bg-coach/90"
                    >
                      {completeMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5" />
                      )}
                      Finalizar clase · {attendedCount} asistentes
                    </Button>
                    <p className="mt-2 text-center text-[11px] text-muted">
                      Marca quién no asistió antes de finalizar
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={
                      saveMutation.isPending ||
                      Object.keys(attendance).length === 0
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
              )}
            </>
          )}
        </>
      )}

      <div className="pb-8" />
    </div>
  );
}
