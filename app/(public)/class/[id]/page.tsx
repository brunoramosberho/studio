"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Ticket,
  MapPin,
  Share,
  LogIn,
  Mail,
  CalendarPlus,
  Clock,
  Users,
  ListMusic,
  Music,
  ChevronUp,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { StudioMap, type SpotInfo, type RoomLayoutData } from "@/components/shared/studio-map";
import { cn, formatTime, maskLastName } from "@/lib/utils";
import { useBooking } from "@/hooks/useBooking";
import { usePackages } from "@/hooks/usePackages";
import { BookingSheet } from "@/components/booking/booking-sheet";
import { SongRequest } from "@/components/booking/song-request";
import { MediaGallery } from "@/components/feed/media-gallery";
import { LikeButton } from "@/components/feed/like-button";
import { CommentsSheet } from "@/components/feed/comments-sheet";
import { PhotoUpload } from "@/components/feed/photo-upload";
import { PeopleListSheet, type PersonItem } from "@/components/feed/people-list-sheet";
import { UserAvatar, type UserAvatarUser } from "@/components/ui/user-avatar";
import { StudioLocationMap } from "@/components/shared/studio-location-map";
import { BiometricsCard } from "@/components/booking/biometrics-card";
import { FriendBiometrics } from "@/components/booking/friend-biometrics";
import { MembershipNudge } from "@/components/booking/MembershipNudge";
import type { NudgeDecision } from "@/lib/conversion/nudge-engine";

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
    studio: { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null };
  };
  coach: {
    id: string;
    userId: string;
    bio: string | null;
    specialties: string[];
    photoUrl: string | null;
    user: { name: string | null; image: string | null };
  };
  bookings: { id: string; userId: string | null; spotNumber: number | null; status: string }[];
  _count: { bookings: number; blockedSpots?: number; waitlist: number; songRequests?: number };
  spotsLeft: number;
  spotMap: Record<number, SpotInfo>;
  songRequestsEnabled?: boolean;
  songRequestCriteria?: string[];
  myWaitlistEntry?: { id: string; position: number } | null;
}

interface FeedAttendee {
  id: string;
  name: string;
  image: string | null;
  hasActiveMembership?: boolean;
  level?: string | null;
}

interface FeedMediaItem {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  mimeType: string;
}

interface PlaylistTrack {
  id: string;
  title: string;
  artist: string;
  albumArt: string | null;
}

interface ClassFeedEvent {
  id: string;
  payload: Record<string, unknown>;
  createdAt: string;
  photos: FeedMediaItem[];
  comments: unknown[];
  likeCount: number;
  liked: boolean;
}

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
  const [copied, setCopied] = useState(false);
  const [guestEmail, setGuestEmail] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [sendingMagic, setSendingMagic] = useState(false);
  const [showSongRequest, setShowSongRequest] = useState(false);
  const [songRequestChecked, setSongRequestChecked] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);

  const [showPeople, setShowPeople] = useState(false);
  const [feedMedia, setFeedMedia] = useState<FeedMediaItem[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [nudgeConverted, setNudgeConverted] = useState(false);

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

  const isPast = cls ? new Date(cls.endsAt) < new Date() : false;

  const { data: feedData } = useQuery<{ feedEvent: ClassFeedEvent | null }>({
    queryKey: ["class-feed", id],
    queryFn: async () => {
      const res = await fetch(`/api/classes/${id}/feed`);
      if (!res.ok) throw new Error("Failed to fetch feed");
      return res.json();
    },
    enabled: !!id && isPast,
  });

  const feedEvent = feedData?.feedEvent ?? null;
  const feedAttendees = (feedEvent?.payload?.attendees as FeedAttendee[]) ?? [];
  const feedCaption = (feedEvent?.payload?.caption as string) ?? null;
  const hasPlaylist = feedEvent?.payload?.hasPlaylist === true;
  const currentUserId = session?.user?.id;
  const userAttended = currentUserId
    ? feedAttendees.some((a) => a.id === currentUserId)
    : false;
  const canSeePlaylist = hasPlaylist && userAttended;

  useEffect(() => {
    if (feedEvent?.photos) setFeedMedia(feedEvent.photos);
  }, [feedEvent?.photos]);

  const handleTogglePlaylist = async () => {
    if (playlistOpen) {
      setPlaylistOpen(false);
      return;
    }
    setPlaylistOpen(true);
    if (playlistTracks.length > 0) return;
    setPlaylistLoading(true);
    try {
      const res = await fetch(`/api/classes/${id}/playlist`);
      if (res.ok) setPlaylistTracks(await res.json());
    } catch { /* ignore */ }
    setPlaylistLoading(false);
  };

  const cancelMutation = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/bookings/${bookingId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Cancel failed");
    },
    onSuccess: async () => {
      setShowCancelConfirm(false);
      setBookingSuccess(false);
      setBookedSpotNumber(null);
      setSelectedSpot(null);
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["classes", id] }),
        queryClient.invalidateQueries({ queryKey: ["packages", "mine"] }),
      ]);
    },
  });

  const classTypeId = cls?.classType?.id;
  const now = new Date();
  const validPackages = userPackages
    .filter((p) => new Date(p.expiresAt) > now)
    .filter((p) => p.creditsTotal === null || p.creditsUsed < (p.creditsTotal ?? 0))
    .filter((p) => {
      const cts = (p.package as any)?.classTypes;
      if (!cts?.length) return true;
      return classTypeId ? cts.some((ct: { id: string }) => ct.id === classTypeId) : true;
    })
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const hasCredits = validPackages.length > 0;

  const { data: nudgeDecision } = useQuery<NudgeDecision>({
    queryKey: ["nudge-decision", id],
    queryFn: async () => {
      const res = await fetch("/api/conversion/nudge?context=booking");
      if (!res.ok) return { type: "none" as const };
      return res.json();
    },
    enabled: isAuthenticated && !packagesLoading && !hasCredits && !nudgeConverted,
    staleTime: 60_000,
  });

  const hasNudge = nudgeDecision && nudgeDecision.type !== "none";

  const creditsRemaining = validPackages.length === 0
    ? null
    : validPackages.some((p) => p.creditsTotal === null)
      ? -1
      : validPackages.reduce(
          (sum, p) => sum + Math.max(0, (p.creditsTotal ?? 0) - p.creditsUsed),
          0,
        );

  const myBooking = cls?.bookings.find(
    (b) => b.userId === session?.user?.id && (b.status === "CONFIRMED" || b.status === "ATTENDED"),
  );
  const myBookedSpot = myBooking?.spotNumber ?? null;

  useEffect(() => {
    if (myBookedSpot) setSelectedSpot(null);
  }, [myBookedSpot]);

  useEffect(() => {
    if (cls?.myWaitlistEntry) {
      setWaitlistJoined(true);
      setWaitlistPosition(cls.myWaitlistEntry.position);
    }
  }, [cls?.myWaitlistEntry]);

  useEffect(() => {
    if (!bookingSuccess || songRequestChecked || !isAuthenticated) return;
    setSongRequestChecked(true);
    fetch(`/api/classes/${id}/song-request`)
      .then((r) => r.json())
      .then((data) => {
        if (data.eligible && !data.songRequest) setShowSongRequest(true);
      })
      .catch(() => {});
  }, [bookingSuccess, id, isAuthenticated, songRequestChecked]);

  async function handleDirectBook() {
    setError(null);
    try {
      await bookAsync({
        classId: id,
        spotNumber: selectedSpot ?? undefined,
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
    if (isAuthenticated && hasCredits) {
      handleDirectBook();
    } else {
      setSheetOpen(true);
    }
  }

  async function handleJoinWaitlist() {
    setJoiningWaitlist(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: id,
          packageId: validPackages[0]?.id,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setWaitlistJoined(true);
        setWaitlistPosition(data.position ?? data.waitlistCount ?? null);
      } else {
        setError(data.error || "No se pudo unir a la lista de espera");
      }
    } catch {
      setError("No se pudo unir a la lista de espera");
    } finally {
      setJoiningWaitlist(false);
    }
  }

  const calendarUrls = useMemo(() => {
    if (!cls) return null;
    const start = new Date(cls.startsAt);
    const end = new Date(cls.endsAt);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const title = `${cls.classType.name} con ${cls.coach.user.name ?? ""}`;
    const location = [cls.room.studio.name, cls.room.studio.address].filter(Boolean).join(", ");
    const details = `${cls.room.name} · ${cls.classType.duration} min`;

    const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&location=${encodeURIComponent(location)}&details=${encodeURIComponent(details)}`;

    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Reserva//Class//ES",
      "BEGIN:VEVENT",
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${title}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${details}`,
      `URL:${typeof window !== "undefined" ? window.location.href : ""}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    return { google, ics };
  }, [cls]);

  const handleDownloadIcs = useCallback(() => {
    if (!calendarUrls || !cls) return;
    const blob = new Blob([calendarUrls.ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cls.classType.name.replace(/\s+/g, "-")}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }, [calendarUrls, cls]);

  const handleShare = useCallback(async () => {
    if (!cls) return;
    const classUrl = `${window.location.origin}/class/${id}`;
    const date = new Date(cls.startsAt);
    const dayStr = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const time = formatTime(cls.startsAt);
    const text = `${cls.classType.name} con ${cls.coach.user.name}\n${dayStr}, ${time}\n${cls.room.studio.name}\n¡Reserva tu lugar!`;

    if (navigator.share) {
      try {
        await navigator.share({ title: cls.classType.name, text, url: classUrl });
      } catch {}
    } else {
      await navigator.clipboard.writeText(`${text}\n${classUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [cls, id]);

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
  const classFull = spotsLeft <= 0;
  const waitlistCount = cls._count?.waitlist ?? 0;
  const hasLayout = cls.room.layout && cls.room.layout.spots?.length > 0;
  const totalSpots = cls.room.maxCapacity;
  const blockedCount = cls._count.blockedSpots ?? 0;
  const bookedCount = cls._count.bookings + blockedCount;

  return (
    <PageTransition>
      <div className="mx-auto max-w-lg px-4 pb-36 pt-4 sm:pb-16 sm:pt-12">
        {/* Back + credits + share */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="flex items-center gap-2">
            {!isPast && isAuthenticated && creditsRemaining !== null && (
              <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1">
                <Ticket className="h-3.5 w-3.5 text-accent" />
                <span className="text-[12px] font-semibold text-accent">
                  {creditsRemaining === -1 ? "Ilimitado" : `${creditsRemaining} clases`}
                </span>
              </div>
            )}
            <button
              onClick={handleShare}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-foreground active:scale-95"
              title="Compartir clase"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Share className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Title + coach */}
        <div className="flex items-center gap-3">
          {(cls.coach.photoUrl || cls.coach.user.image) && (
            <Link href={`/my/user/${cls.coach.userId}`}>
              <img
                src={cls.coach.photoUrl || cls.coach.user.image!}
                alt={cls.coach.user.name || "Coach"}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-accent/20"
              />
            </Link>
          )}
          <h1 className="font-display text-2xl font-bold text-foreground">
            {cls.classType.name}
            {cls.coach.user.name && (
              <span className="font-normal text-muted">
                {" "}con {cls.coach.user.name}
              </span>
            )}
          </h1>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted">
            {!isPast && (bookedSpotNumber ?? myBookedSpot) ? (
              <span className="font-semibold text-foreground">
                Lugar: {bookedSpotNumber ?? myBookedSpot}
              </span>
            ) : !isPast && selectedSpot ? (
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

        {/* Studio + availability */}
        <div className="mt-2 flex items-center justify-between">
          {cls.room?.studio && (
            <div className="flex items-center gap-1.5 text-xs text-muted/70">
              <MapPin className="h-3 w-3" />
              {cls.room.studio.name} · {cls.room.name}
            </div>
          )}
          {!isPast && (
            <div className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              classFull
                ? "bg-red-50 text-red-600"
                : spotsLeft <= 3
                  ? "bg-orange-50 text-orange-600"
                  : "bg-surface text-muted",
            )}>
              <Users className="h-3 w-3" />
              {classFull ? "Llena" : `${bookedCount}/${totalSpots}`}
            </div>
          )}
        </div>

        <div className="my-6 h-px bg-border/50" />

        {isPast ? (
          /* ═══════ POST-CLASS EXPERIENCE ═══════ */
          <div className="space-y-5">
            {/* Clase terminada badge */}
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">Clase terminada</span>
              {feedAttendees.length > 0 && (
                <span className="text-xs text-muted">
                  · {feedAttendees.length} asistente{feedAttendees.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Biometrics from wearable */}
            {myBooking && <BiometricsCard bookingId={myBooking.id} />}

            {/* Caption */}
            {feedCaption && (
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-foreground/90">
                {feedCaption}
              </p>
            )}

            {/* Photos / video gallery */}
            {feedMedia.length > 0 && (
              <div className="-mx-4">
                <MediaGallery media={feedMedia} className="rounded-none" />
              </div>
            )}

            {/* Action bar: like, comments, upload */}
            {feedEvent && (
              <div className="flex items-center gap-1">
                <LikeButton
                  eventId={feedEvent.id}
                  initialLiked={feedEvent.liked}
                  initialCount={feedEvent.likeCount}
                />
                <CommentsSheet
                  eventId={feedEvent.id}
                  commentCount={feedEvent.comments.length}
                />
                <PhotoUpload
                  eventId={feedEvent.id}
                  onUploaded={(photo) =>
                    setFeedMedia((prev) => [...prev, { ...photo, thumbnailUrl: null }])
                  }
                />
              </div>
            )}

            {/* Playlist (only for attendees) */}
            {canSeePlaylist && (
              <div>
                <button
                  onClick={handleTogglePlaylist}
                  className="flex w-full items-center gap-2 rounded-xl bg-green-50 px-3.5 py-2.5 text-left transition-colors hover:bg-green-100/70"
                >
                  <ListMusic className="h-4 w-4 text-green-600" />
                  <span className="flex-1 text-[13px] font-medium text-green-800">
                    Ver playlist de la clase
                  </span>
                  <ChevronUp className={cn(
                    "h-4 w-4 text-green-600 transition-transform",
                    !playlistOpen && "rotate-180",
                  )} />
                </button>
                {playlistOpen && (
                  <div className="mt-2 space-y-1 rounded-xl border border-green-100 bg-white p-2">
                    {playlistLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-300 border-t-green-600" />
                      </div>
                    ) : playlistTracks.length === 0 ? (
                      <p className="py-3 text-center text-xs text-muted">Sin canciones</p>
                    ) : (
                      playlistTracks.map((track, idx) => (
                        <div
                          key={track.id}
                          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-green-50/50"
                        >
                          <span className="w-4 text-center text-[11px] font-medium text-muted/50">
                            {idx + 1}
                          </span>
                          {track.albumArt ? (
                            <img
                              src={track.albumArt}
                              alt={track.title}
                              className="h-8 w-8 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-50">
                              <Music className="h-3.5 w-3.5 text-green-600" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-medium text-foreground">{track.title}</p>
                            <p className="truncate text-[11px] text-muted">{track.artist}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Attendees */}
            {feedAttendees.length > 0 && (
              <div>
                {feedAttendees.length === 1 ? (
                  <Link href={`/my/user/${feedAttendees[0].id}`} className="inline-flex items-center gap-2">
                    <UserAvatar
                      user={feedAttendees[0] as UserAvatarUser}
                      size={24}
                      showBadge={false}
                    />
                    <span className="text-[12px] text-muted">{maskLastName(feedAttendees[0].name)}</span>
                  </Link>
                ) : (
                  <button className="flex items-center gap-2" onClick={() => setShowPeople(true)}>
                    <div className="flex -space-x-1.5">
                      {feedAttendees.slice(0, 8).map((a, idx) => (
                        <UserAvatar
                          key={`${a.id}-${idx}`}
                          user={a as UserAvatarUser}
                          size={24}
                          showBadge={false}
                        />
                      ))}
                    </div>
                    <span className="text-[12px] text-muted">
                      {feedAttendees.length} asistentes
                      {feedAttendees.length > 8 && ` +${feedAttendees.length - 8} más`}
                    </span>
                  </button>
                )}
              </div>
            )}

            <PeopleListSheet
              open={showPeople}
              onClose={() => setShowPeople(false)}
              title="Asistentes"
              people={feedAttendees.map((a): PersonItem => ({
                id: a.id,
                name: a.name,
                image: a.image,
              }))}
            />

            {/* Friend biometrics */}
            <FriendBiometrics classId={id} />

            {/* ── Book Again CTA ── */}
            <div className="mt-2 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted/60">
                Reservar de nuevo
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="w-full gap-2 rounded-full"
                >
                  <Link href={`/my/user/${cls.coach.userId}`}>
                    {(cls.coach.photoUrl || cls.coach.user.image) && (
                      <img
                        src={cls.coach.photoUrl || cls.coach.user.image!}
                        alt=""
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    )}
                    <span className="truncate">
                      Clases con {cls.coach.user.name?.split(" ")[0] ?? "coach"}
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                  </Link>
                </Button>
                <Button
                  asChild
                  className="w-full gap-2 rounded-full bg-foreground text-background hover:bg-foreground/90"
                >
                  <Link href={`/schedule?discipline=${encodeURIComponent(cls.classType.name)}`}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span className="truncate">Más {cls.classType.name}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* ═══════ BOOKING EXPERIENCE (upcoming class) ═══════ */
          <>
            {/* Studio Map (only for rooms with layout) */}
            {hasLayout && (
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
                  coachName={cls.coach.user.name}
                />
              </div>
            )}

            {/* Privacy toggle */}
            {!myBooking && !bookingSuccess && (selectedSpot || !hasLayout) && !classFull && (
              <div className="mt-1 flex flex-col items-center gap-1.5">
                <div className="flex w-fit items-center rounded-full bg-surface p-0.5 text-xs">
                  <button
                    onClick={() => setPrivacy("PUBLIC")}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all ${
                      privacy === "PUBLIC"
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    <span>Visible</span>
                  </button>
                  <button
                    onClick={() => setPrivacy("PRIVATE")}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all ${
                      privacy === "PRIVATE"
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <EyeOff className="h-3 w-3" />
                    <span>Privada</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted/60">
                  {privacy === "PUBLIC"
                    ? "Tus amigos podrán ver que asistirás a esta clase"
                    : "Nadie verá que reservaste esta clase"}
                </p>
              </div>
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
                  <div className="rounded-xl bg-green-50 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-green-800">
                          Reserva confirmada
                        </p>
                        <p className="text-xs text-green-600">
                          {bookedSpotNumber ? `Lugar #${bookedSpotNumber} · ` : ""}{formatTime(cls.startsAt)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <a
                        href={calendarUrls?.google}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-100 py-2 text-[13px] font-medium text-green-700 transition-colors hover:bg-green-200 active:scale-[0.98]"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Google
                      </a>
                      <button
                        onClick={handleDownloadIcs}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-100 py-2 text-[13px] font-medium text-green-700 transition-colors hover:bg-green-200 active:scale-[0.98]"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        Apple
                      </button>
                      <button
                        onClick={handleShare}
                        className="flex items-center justify-center rounded-lg bg-green-100 px-3 py-2 text-green-700 transition-colors hover:bg-green-200 active:scale-[0.98]"
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Share className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Mobile install hint */}
                  {!isAuthenticated && guestEmail && typeof window !== "undefined" && /iPad|iPhone|iPod|android/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches && (
                    <div className="mt-4 flex items-center gap-3 rounded-xl bg-surface/80 p-3 sm:hidden">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                        <Share className="h-3.5 w-3.5 text-accent" />
                      </div>
                      <p className="text-xs text-muted">
                        <strong className="text-foreground">Tip:</strong> Agrega esta app a tu pantalla de inicio para reservar más rápido.
                      </p>
                    </div>
                  )}

                  {/* Song request prompt */}
                  <AnimatePresence>
                    {showSongRequest && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 overflow-hidden rounded-xl border border-border/50 bg-white"
                      >
                        <SongRequest
                          classId={id}
                          onComplete={() => setShowSongRequest(false)}
                          onSkip={() => setShowSongRequest(false)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Guest login prompt */}
                  {!isAuthenticated && guestEmail && (
                    <div className="mt-4 rounded-xl border border-border/50 bg-white p-4">
                      {magicSent ? (
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10">
                            <Mail className="h-4 w-4 text-accent" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">Revisa tu correo</p>
                            <p className="text-xs text-muted">Enviamos un enlace a {guestEmail}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">
                            Accede a tu cuenta
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            Gestiona reservas, acumula logros y conecta con tu comunidad.
                          </p>
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => signIn("google", { callbackUrl: `/class/${id}` })}
                              className="flex-1 gap-1.5 rounded-full bg-foreground text-background hover:bg-foreground/90"
                            >
                              <LogIn className="h-3.5 w-3.5" />
                              Google
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={sendingMagic}
                              onClick={async () => {
                                setSendingMagic(true);
                                await signIn("resend", { email: guestEmail, callbackUrl: "/my/bookings", redirect: false });
                                setMagicSent(true);
                                setSendingMagic(false);
                              }}
                              className="flex-1 gap-1.5 rounded-full"
                            >
                              {sendingMagic ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                              Email
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="my-6 h-px bg-border/50" />

            {/* Waitlist joined state */}
            {waitlistJoined && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#C9A96E]">
                    <Clock className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Estas en la lista de espera
                    </p>
                    {waitlistPosition && (
                      <p className="text-xs text-accent">Posición #{waitlistPosition}</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Se te descontó un crédito. Si se libera un lugar, entrarás automáticamente y te notificaremos. Si no entras, se te devuelve el crédito.
                </p>
                <Button asChild variant="secondary" size="sm" className="rounded-full">
                  <Link href="/my/bookings">Ver mis reservas</Link>
                </Button>
              </div>
            )}

            {/* CTA */}
            {!myBooking && !bookingSuccess && !waitlistJoined && (
              <div className="space-y-4">
                {classFull ? (
                  isAuthenticated ? (
                    hasCredits ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                            <Users className="h-3 w-3" />
                            Clase llena
                          </span>
                          {waitlistCount > 0 && (
                            <span className="text-xs text-muted">
                              {waitlistCount} {waitlistCount === 1 ? "persona" : "personas"} en lista de espera
                            </span>
                          )}
                        </div>
                        <div className="rounded-xl border border-[#C9A96E]/20 bg-[#C9A96E]/5 px-4 py-3">
                          <p className="text-xs text-muted leading-relaxed">
                            Se te descontará un crédito al unirte. Si se libera un lugar, entrarás automáticamente. Si no logras entrar, se te devuelve el crédito.
                          </p>
                        </div>
                        <Button
                          size="lg"
                          className="w-full min-h-[48px] rounded-full"
                          onClick={handleJoinWaitlist}
                          disabled={joiningWaitlist}
                        >
                          {joiningWaitlist && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Unirme a la lista de espera
                          {waitlistCount > 0 && (
                            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs">
                              {waitlistCount}
                            </span>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 text-center">
                        <p className="text-sm text-muted">Clase llena. Necesitas un paquete para unirte a la lista de espera.</p>
                        <Button asChild size="lg" className="w-full rounded-full">
                          <Link href="/packages">Ver paquetes</Link>
                        </Button>
                      </div>
                    )
                  ) : (
                    <div className="space-y-3 text-center">
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          <Users className="h-3 w-3" />
                          Clase llena
                        </span>
                      </div>
                      <p className="text-sm text-muted">Inicia sesión para unirte a la lista de espera.</p>
                      <Button asChild size="lg" className="w-full rounded-full">
                        <Link href="/login">
                          <LogIn className="mr-2 h-4 w-4" />
                          Iniciar sesión
                        </Link>
                      </Button>
                    </div>
                  )
                ) : isAuthenticated && !hasCredits && hasNudge ? (
                  <MembershipNudge
                    decision={nudgeDecision!}
                    onMembershipActivated={() => {
                      setNudgeConverted(true);
                      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
                    }}
                    onSingleClass={() => setSheetOpen(true)}
                  />
                ) : (
                  <Button
                    size="lg"
                    className="w-full min-h-[48px] rounded-full bg-foreground text-background hover:bg-foreground/90"
                    onClick={handleReserveClick}
                    disabled={isBooking || (hasLayout && !selectedSpot) || (isAuthenticated && packagesLoading)}
                  >
                    {isBooking ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {hasLayout && !selectedSpot
                      ? "Selecciona un lugar"
                      : "Reservar clase"}
                  </Button>
                )}
              </div>
            )}

            {/* Already booked */}
            {myBooking && !bookingSuccess && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
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
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                  >
                    Cancelar
                  </button>
                </div>
                <div className="flex gap-2">
                  <a
                    href={calendarUrls?.google}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent/10 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent/15 active:scale-[0.98]"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Google
                  </a>
                  <button
                    onClick={handleDownloadIcs}
                    className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent/10 py-2 text-[13px] font-medium text-accent transition-colors hover:bg-accent/15 active:scale-[0.98]"
                  >
                    <CalendarPlus className="h-3.5 w-3.5" />
                    Apple
                  </button>
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
          </>
        )}

        {/* Studio location map -- at the bottom as secondary info */}
        {cls.room?.studio?.latitude != null && cls.room.studio.longitude != null && cls.room.studio.address && (
          <div className="mt-10">
            <StudioLocationMap
              name={cls.room.studio.name}
              address={cls.room.studio.address}
              latitude={cls.room.studio.latitude}
              longitude={cls.room.studio.longitude}
            />
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      <AnimatePresence>
        {!isPast && showCancelConfirm && myBooking && cls && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
              onClick={() => !cancelMutation.isPending && setShowCancelConfirm(false)}
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
                {(() => {
                  const msUntil = new Date(cls.startsAt).getTime() - Date.now();
                  const canRefund = msUntil > 12 * 60 * 60 * 1000;
                  const hoursLeft = Math.max(0, Math.floor(msUntil / 3_600_000));
                  return (
                    <>
                      <div
                        className={cn(
                          "mx-auto flex h-14 w-14 items-center justify-center rounded-full",
                          canRefund ? "bg-orange-50" : "bg-red-50",
                        )}
                      >
                        <AlertTriangle
                          className={cn(
                            "h-6 w-6",
                            canRefund ? "text-orange-500" : "text-red-500",
                          )}
                        />
                      </div>

                      <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                        Cancelar reserva
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {cls.classType.name} · {new Date(cls.startsAt).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" })}
                      </p>

                      {canRefund ? (
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
                            Faltan menos de 12 horas ({hoursLeft}h).
                            Las cancelaciones tardías no reembolsan créditos.
                          </p>
                        </div>
                      )}

                      <div className="mt-6 flex flex-col gap-2">
                        <Button
                          variant="destructive"
                          className="w-full rounded-full"
                          onClick={() => cancelMutation.mutate(myBooking.id)}
                          disabled={cancelMutation.isPending}
                        >
                          {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {canRefund ? "Cancelar reserva" : "Cancelar sin reembolso"}
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full rounded-full"
                          onClick={() => setShowCancelConfirm(false)}
                          disabled={cancelMutation.isPending}
                        >
                          Volver
                        </Button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Booking Sheet */}
      <AnimatePresence>
        {!isPast && sheetOpen && (selectedSpot || !hasLayout) && (
          <BookingSheet
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            classId={id}
            spotNumber={selectedSpot}
            className={cls.classType.name}
            classTime={cls.startsAt}
            privacy={privacy}
            classTypeId={cls.classType.id}
            onSuccess={(email) => {
              setBookingSuccess(true);
              setBookedSpotNumber(selectedSpot);
              setSelectedSpot(null);
              if (email) setGuestEmail(email);
              queryClient.invalidateQueries({ queryKey: ["classes", id] });
            }}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  );
}
