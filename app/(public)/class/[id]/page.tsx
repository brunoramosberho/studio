"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
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
  Bell,
  BellRing,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageTransition } from "@/components/shared/page-transition";
import { StudioMap, type SpotInfo, type RoomLayoutData } from "@/components/shared/studio-map";
import { cn, formatTime, maskLastName } from "@/lib/utils";
import { useBooking } from "@/hooks/useBooking";
import { usePackages } from "@/hooks/usePackages";
import { BookingSheet } from "@/components/booking/booking-sheet";
import { GuestListInput, type GuestEntry } from "@/components/booking/guest-list-input";
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
import { RatingSection } from "@/components/rating/RatingSection";
import type { NudgeDecision } from "@/lib/conversion/nudge-engine";
import { useTranslations } from "next-intl";

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
    name: string;
    user?: { name?: string | null; image?: string | null } | null;
  };
  bookings: { id: string; userId: string | null; spotNumber: number | null; status: string }[];
  _count: { bookings: number; blockedSpots?: number; waitlist: number; songRequests?: number };
  spotsLeft: number;
  spotMap: Record<number, SpotInfo>;
  songRequestsEnabled?: boolean;
  songRequestCriteria?: string[];
  myWaitlistEntry?: { id: string; position: number } | null;
  myNotifyMe?: { id: string } | null;
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
  const t = useTranslations("classDetail");
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
  const [waiverPending, setWaiverPending] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [notifyMeActive, setNotifyMeActive] = useState(false);
  const [notifyMeId, setNotifyMeId] = useState<string | null>(null);
  const [togglingNotifyMe, setTogglingNotifyMe] = useState(false);

  const [showPeople, setShowPeople] = useState(false);
  const [feedMedia, setFeedMedia] = useState<FeedMediaItem[]>([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [playlistTracks, setPlaylistTracks] = useState<PlaylistTrack[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [nudgeConverted, setNudgeConverted] = useState(false);
  const [guests, setGuests] = useState<GuestEntry[]>([]);
  const [guestSpots, setGuestSpots] = useState<Record<number, number>>({}); // guestIndex → spotNumber
  const [selectingGuestSpot, setSelectingGuestSpot] = useState<number | null>(null); // index of guest we're assigning a spot to

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
  const isCancelled = cls?.status === "CANCELLED";

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

  // Guest configuration from the first valid package
  const guestConfig = useMemo(() => {
    const pkg = validPackages[0]?.package as any;
    if (!pkg) return { allowGuests: false, maxGuests: null as number | null };
    return {
      allowGuests: pkg.allowGuests === true,
      maxGuests: pkg.maxGuestsPerBooking as number | null,
    };
  }, [validPackages]);

  // Available credits for credit summary display
  const availableCreditsForBooking = useMemo(() => {
    const pkg = validPackages[0];
    if (!pkg) return 0;
    if (pkg.creditsTotal === null) return Infinity;
    return Math.max(0, (pkg.creditsTotal ?? 0) - pkg.creditsUsed);
  }, [validPackages]);

  const totalPeople = 1 + guests.length;
  const hasEnoughCreditsForAll = availableCreditsForBooking >= totalPeople;

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
    if (cls?.myNotifyMe) {
      setNotifyMeActive(true);
      setNotifyMeId(cls.myNotifyMe.id);
    }
  }, [cls?.myNotifyMe]);

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

  const hasBooking = !!myBooking || bookingSuccess;
  useEffect(() => {
    if (!hasBooking || !isAuthenticated) return;
    fetch("/api/waiver/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const isPending = data && (data.status === "pending" || data.status === "needs_resign");
        const triggerEnabled = data?.triggers?.onBooking !== false;
        if (isPending && triggerEnabled) {
          setWaiverPending(true);
        }
      })
      .catch(() => {});
  }, [hasBooking, isAuthenticated]);

  async function handleDirectBook() {
    setError(null);
    try {
      await bookAsync({
        classId: id,
        spotNumber: selectedSpot ?? undefined,
        packageId: validPackages[0]?.id,
        privacy,
        ...(guests.length > 0 && {
          guests: guests.map((g, i) => ({
            ...g,
            ...(guestSpots[i] != null && { spotNumber: guestSpots[i] }),
          })),
        }),
      });
      setBookingSuccess(true);
      setBookedSpotNumber(selectedSpot);
      setSelectedSpot(null);
      setGuests([]);
      setGuestSpots({});
      setSelectingGuestSpot(null);
      queryClient.invalidateQueries({ queryKey: ["classes", id] });
    } catch (err: any) {
      setError(err.error || t("couldNotBook"));
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
        if (notifyMeActive) {
          setNotifyMeActive(false);
          setNotifyMeId(null);
        }
      } else {
        setError(data.error || t("couldNotJoinWaitlist"));
      }
    } catch {
      setError(t("couldNotJoinWaitlist"));
    } finally {
      setJoiningWaitlist(false);
    }
  }

  async function handleToggleNotifyMe() {
    setTogglingNotifyMe(true);
    setError(null);
    try {
      if (notifyMeActive && notifyMeId) {
        const res = await fetch(`/api/notify-spot/${notifyMeId}`, { method: "DELETE" });
        if (res.ok) {
          setNotifyMeActive(false);
          setNotifyMeId(null);
        }
      } else {
        const res = await fetch("/api/notify-spot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId: id }),
        });
        const data = await res.json();
        if (res.ok) {
          setNotifyMeActive(true);
          setNotifyMeId(data.id);
        } else {
          setError(data.error || t("couldNotActivateNotif"));
        }
      }
    } catch {
      setError(t("couldNotProcessRequest"));
    } finally {
      setTogglingNotifyMe(false);
    }
  }

  const calendarUrls = useMemo(() => {
    if (!cls) return null;
    const start = new Date(cls.startsAt);
    const end = new Date(cls.endsAt);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const title = `${cls.classType.name} con ${cls.coach.name ?? ""}`;
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
    const dayStr = date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
    const time = formatTime(cls.startsAt);
    const text = `${cls.classType.name} con ${cls.coach.name}\n${dayStr}, ${time}\n${cls.room.studio.name}\n${t("reserveYourSpot")}`;

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
            {t("classNotFound")}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {t("classNotFoundDesc")}
          </p>
          <Button asChild variant="secondary" className="mt-8">
            <Link href="/schedule">{t("viewSchedule")}</Link>
          </Button>
        </div>
      </PageTransition>
    );
  }

  const spotsLeft = cls.spotsLeft;
  const baseSpotMap: Record<number, SpotInfo> = cls.spotMap ?? {};

  // Overlay guest spot assignments onto the map
  const spotMap = useMemo(() => {
    const merged = { ...baseSpotMap };
    for (const [gIdx, sn] of Object.entries(guestSpots)) {
      const guest = guests[Number(gIdx)];
      if (guest && sn) {
        merged[sn] = { status: "guest", userName: guest.name };
      }
    }
    return merged;
  }, [baseSpotMap, guestSpots, guests]);

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
            className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-surface"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </button>
          <div className="flex items-center gap-2">
            {!isPast && !isCancelled && isAuthenticated && creditsRemaining !== null && (
              <div className="flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1">
                <Ticket className="h-3.5 w-3.5 text-accent" />
                <span className="text-[12px] font-semibold text-accent">
                  {creditsRemaining === -1 ? t("unlimited") : t("classesCount", { count: creditsRemaining })}
                </span>
              </div>
            )}
            <button
              onClick={handleShare}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:text-foreground active:scale-95"
              title={t("shareClass")}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Share className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Cancelled banner */}
        {cls.status === "CANCELLED" && (
          <div className="mb-4 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
            <div>
              <p className="text-sm font-semibold text-red-700">{t("classCancelledTitle")}</p>
              <p className="text-xs text-red-600">{t("classCancelledDesc")}</p>
            </div>
          </div>
        )}

        {/* Title + coach */}
        <div className="flex items-center gap-3">
          {(cls.coach.photoUrl || cls.coach.user?.image) && (
            <Link href={`/my/user/${cls.coach.userId}`}>
              <img
                src={cls.coach.photoUrl || cls.coach.user?.image!}
                alt={cls.coach.name || "Coach"}
                className="h-11 w-11 rounded-full object-cover ring-2 ring-accent/20"
              />
            </Link>
          )}
          <h1 className="font-display text-2xl font-bold text-foreground">
            {cls.classType.name}
            {cls.coach.name && (
              <span className="font-normal text-muted">
                {t("with")}{cls.coach.name}
              </span>
            )}
          </h1>
        </div>

        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted">
            {!isPast && (bookedSpotNumber ?? myBookedSpot) ? (
              <span className="font-semibold text-foreground">
                {t("spotLabel")} {bookedSpotNumber ?? myBookedSpot}
              </span>
            ) : !isPast && selectedSpot ? (
              <span className="font-semibold text-foreground">
                {t("spotLabel")} {selectedSpot}
              </span>
            ) : null}
            {cls.tag && (
              <Badge variant="outline" className="text-[10px]">{cls.tag}</Badge>
            )}
          </div>
          <p className="text-sm uppercase tracking-wide text-muted">
            {new Date(cls.startsAt).toLocaleDateString(undefined, {
              day: "2-digit",
              month: "short",
            }).toUpperCase()}
            {" / "}
            {new Date(cls.startsAt).toLocaleDateString(undefined, {
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
          {!isPast && !isCancelled && (
            <div className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
              classFull
                ? "bg-red-50 text-red-600"
                : spotsLeft <= 3
                  ? "bg-orange-50 text-orange-600"
                  : "bg-surface text-muted",
            )}>
              <Users className="h-3 w-3" />
              {classFull ? t("full") : `${bookedCount}/${totalSpots}`}
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
              <span className="text-sm font-medium text-green-700">{t("classFinished")}</span>
              {feedAttendees.length > 0 && (
                <span className="text-xs text-muted">
                  · {feedAttendees.length !== 1 ? t("attendeesCount", { count: feedAttendees.length }) : t("attendeeCount", { count: feedAttendees.length })}
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
                    {t("viewPlaylist")}
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
                      <p className="py-3 text-center text-xs text-muted">{t("noSongs")}</p>
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
                      {t("attendeesCount", { count: feedAttendees.length })}
                      {feedAttendees.length > 8 && ` +${feedAttendees.length - 8} más`}
                    </span>
                  </button>
                )}
              </div>
            )}

            <PeopleListSheet
              open={showPeople}
              onClose={() => setShowPeople(false)}
              title={t("attendeesTitle")}
              people={feedAttendees.map((a): PersonItem => ({
                id: a.id,
                name: a.name,
                image: a.image,
              }))}
            />

            {/* Friend biometrics */}
            <FriendBiometrics classId={id} />

            {/* ── Rating Section ── */}
            {userAttended && (
              <RatingSection classId={id} classTypeId={cls.classType.id} />
            )}

            {/* ── Book Again CTA ── */}
            <div className="mt-2 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted/60">
                {t("bookAgain")}
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="w-full gap-2 rounded-full"
                >
                  <Link href={`/my/user/${cls.coach.userId}`}>
                    {(cls.coach.photoUrl || cls.coach.user?.image) && (
                      <img
                        src={cls.coach.photoUrl || cls.coach.user?.image!}
                        alt=""
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    )}
                    <span className="truncate">
                      {t("classesWithCoach", { coach: cls.coach.name?.split(" ")[0] ?? "coach" })}
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
                    <span className="truncate">{t("moreOfType", { type: cls.classType.name })}</span>
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
                    if (selectingGuestSpot !== null) {
                      // Assigning a spot to a guest
                      // Don't allow selecting own spot or another guest's spot
                      if (spot === selectedSpot) return;
                      const otherGuestIdx = Object.entries(guestSpots).find(([, sn]) => sn === spot)?.[0];
                      if (otherGuestIdx !== undefined && Number(otherGuestIdx) !== selectingGuestSpot) return;

                      setGuestSpots((prev) => ({ ...prev, [selectingGuestSpot]: spot }));
                      setSelectingGuestSpot(null);
                    } else {
                      // Selecting own spot — also clear if clicking same spot
                      if (spot === selectedSpot) {
                        setSelectedSpot(null);
                      } else {
                        // Don't allow selecting a spot already assigned to a guest
                        const isGuestSpot = Object.values(guestSpots).includes(spot);
                        if (!isGuestSpot) setSelectedSpot(spot);
                      }
                    }
                    setError(null);
                  }}
                  myBookedSpot={myBookedSpot}
                  disabled={!!myBooking || bookingSuccess}
                  layout={cls.room.layout}
                  coachName={cls.coach.name}
                />

                {/* Guest spot selection prompt */}
                {selectingGuestSpot !== null && guests[selectingGuestSpot] && (
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2.5">
                    <p className="text-sm font-medium text-emerald-800">
                      Selecciona lugar para <span className="font-bold">{guests[selectingGuestSpot].name.split(" ")[0]}</span>
                    </p>
                    <button
                      onClick={() => setSelectingGuestSpot(null)}
                      className="text-xs text-emerald-600 hover:text-emerald-800"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
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
                    <span>{t("visible")}</span>
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
                    <span>{t("private")}</span>
                  </button>
                </div>
                <p className="text-[11px] text-muted/60">
                  {privacy === "PUBLIC"
                    ? t("visibleDesc")
                    : t("privateDesc")}
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

            {/* Waiver prompt - shown above everything when pending */}
            <AnimatePresence>
              {waiverPending && (myBooking || bookingSuccess) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4"
                >
                  <Link
                    href="/waiver/sign"
                    className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 transition-colors active:bg-amber-100"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                      <FileText className="h-4 w-4 text-amber-700" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">
                        {t("signWaiver")}
                      </p>
                      <p className="text-xs text-amber-600">
                        {t("waiverRequired")}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-amber-500" />
                  </Link>
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
                          {t("bookingConfirmed")}
                        </p>
                        <p className="text-xs text-green-600">
                          {bookedSpotNumber ? `${t("spotNumber", { number: bookedSpotNumber })} · ` : ""}{formatTime(cls.startsAt)}
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
                        <strong className="text-foreground">Tip:</strong> {t("pwaTip")}
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
                            <p className="text-sm font-medium text-foreground">{t("checkEmail")}</p>
                            <p className="text-xs text-muted">{t("linkSentTo", { email: guestEmail })}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">
                            {t("accessAccount")}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            {t("accessAccountDesc")}
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
                      {t("onWaitlist")}
                    </p>
                    {waitlistPosition && (
                      <p className="text-xs text-accent">{t("positionNumber", { pos: waitlistPosition })}</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  {t("waitlistDesc")}
                </p>
                <Button asChild variant="secondary" size="sm" className="rounded-full">
                  <Link href="/my/bookings">{t("viewMyBookings")}</Link>
                </Button>
              </div>
            )}

            {/* Notify-me active state (without waitlist) */}
            {notifyMeActive && !waitlistJoined && !myBooking && !bookingSuccess && classFull && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent">
                    <BellRing className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {t("notifyIfSpotOpens")}
                    </p>
                    <p className="text-xs text-muted">
                      {t("pushAndEmail")}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  {t("notifySpotDesc")}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleToggleNotifyMe}
                    disabled={togglingNotifyMe}
                    className="rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
                  >
                    {togglingNotifyMe ? t("cancellingNotif") : t("cancelNotification")}
                  </button>
                  {hasCredits && (
                    <Button
                      size="sm"
                      className="rounded-full"
                      onClick={handleJoinWaitlist}
                      disabled={joiningWaitlist}
                    >
                      {joiningWaitlist && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      {t("joinWaitlist")}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* CTA */}
            {!myBooking && !bookingSuccess && !waitlistJoined && !(notifyMeActive && classFull) && (
              <div className="space-y-4">
                {classFull ? (
                  isAuthenticated ? (
                    hasCredits ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                            <Users className="h-3 w-3" />
                            {t("classFull")}
                          </span>
                          {waitlistCount > 0 && (
                            <span className="text-xs text-muted">
                              {waitlistCount === 1 ? t("personOnWaitlist", { count: waitlistCount }) : t("peopleOnWaitlist", { count: waitlistCount })}
                            </span>
                          )}
                        </div>
                        <div className="rounded-xl border border-[#C9A96E]/20 bg-[#C9A96E]/5 px-4 py-3">
                          <p className="text-xs text-muted leading-relaxed">
                            {t("waitlistCreditDesc")}
                          </p>
                        </div>
                        <Button
                          size="lg"
                          className="w-full min-h-[48px] rounded-full"
                          onClick={handleJoinWaitlist}
                          disabled={joiningWaitlist}
                        >
                          {joiningWaitlist && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          {t("joinWaitlist")}
                          {waitlistCount > 0 && (
                            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-xs">
                              {waitlistCount}
                            </span>
                          )}
                        </Button>
                        {!notifyMeActive ? (
                          <button
                            onClick={handleToggleNotifyMe}
                            disabled={togglingNotifyMe}
                            className="flex w-full items-center justify-center gap-2 rounded-full py-2.5 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
                          >
                            {togglingNotifyMe ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Bell className="h-3.5 w-3.5" />
                            )}
                            {t("justNotifyMe")}
                          </button>
                        ) : (
                          <div className="flex items-center justify-center gap-2 rounded-full bg-accent/10 py-2.5 text-sm font-medium text-accent">
                            <BellRing className="h-3.5 w-3.5" />
                            {t("notifyIfSpotOpens")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 text-sm">
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                            <Users className="h-3 w-3" />
                            {t("classFull")}
                          </span>
                        </div>
                        {notifyMeActive ? (
                          <div className="space-y-2 text-center">
                            <div className="flex items-center justify-center gap-2 rounded-xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent">
                              <BellRing className="h-4 w-4" />
                              {t("notifyIfSpotOpens")}
                            </div>
                            <button
                              onClick={handleToggleNotifyMe}
                              disabled={togglingNotifyMe}
                              className="text-xs text-muted hover:text-foreground transition-colors"
                            >
                              {t("cancelNotification")}
                            </button>
                          </div>
                        ) : (
                          <>
                            <Button
                              size="lg"
                              variant="outline"
                              className="w-full min-h-[48px] rounded-full gap-2"
                              onClick={handleToggleNotifyMe}
                              disabled={togglingNotifyMe}
                            >
                              {togglingNotifyMe ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Bell className="h-4 w-4" />
                              )}
                              {t("notifyMeIfSpotOpens")}
                            </Button>
                            <p className="text-center text-xs text-muted">
                              {t("noCommitment")}
                            </p>
                          </>
                        )}
                        <div className="pt-1">
                          <Button asChild variant="ghost" size="sm" className="w-full rounded-full text-muted">
                            <Link href="/packages">
                              {t("buyPackageWaitlist")}
                            </Link>
                          </Button>
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="space-y-3 text-center">
                      <div className="flex items-center justify-center gap-2 text-sm">
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                          <Users className="h-3 w-3" />
                          {t("classFull")}
                        </span>
                      </div>
                      <p className="text-sm text-muted">{t("loginForWaitlist")}</p>
                      <Button asChild size="lg" className="w-full rounded-full">
                        <Link href="/login">
                          <LogIn className="mr-2 h-4 w-4" />
                          {t("login")}
                        </Link>
                      </Button>
                    </div>
                  )
                ) : isAuthenticated && !hasCredits && hasNudge && (!hasLayout || selectedSpot) ? (
                  <MembershipNudge
                    decision={nudgeDecision!}
                    onMembershipActivated={() => {
                      setNudgeConverted(true);
                      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
                      handleDirectBook();
                    }}
                    onSingleClass={() => setSheetOpen(true)}
                  />
                ) : (
                  <div className="space-y-3">
                    {/* Guest section - only for authenticated users with credits */}
                    {isAuthenticated && hasCredits && guestConfig.allowGuests && (
                      <>
                        <GuestListInput
                          guests={guests}
                          onChange={(newGuests) => {
                            setGuests(newGuests);
                            // Clean up spots for removed guests
                            setGuestSpots((prev) => {
                              const cleaned: Record<number, number> = {};
                              for (const [k, v] of Object.entries(prev)) {
                                if (Number(k) < newGuests.length) cleaned[Number(k)] = v;
                              }
                              return cleaned;
                            });
                            if (selectingGuestSpot !== null && selectingGuestSpot >= newGuests.length) {
                              setSelectingGuestSpot(null);
                            }
                          }}
                          maxGuests={guestConfig.maxGuests}
                          disabled={isBooking}
                          hasLayout={!!hasLayout}
                          guestSpots={guestSpots}
                          selectingGuestSpot={selectingGuestSpot}
                          onSelectGuestSpot={(idx) => setSelectingGuestSpot(idx)}
                          onRemoveGuestSpot={(idx) => {
                            setGuestSpots((prev) => {
                              const next = { ...prev };
                              delete next[idx];
                              return next;
                            });
                          }}
                        />

                        {guests.length > 0 && (
                          <div className="flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent/5 px-4 py-3">
                            <Users className="h-5 w-5 flex-shrink-0 text-accent" />
                            <div className="flex-1 text-sm">
                              <span className="font-medium text-foreground">
                                {totalPeople} crédito{totalPeople > 1 ? "s" : ""}
                              </span>
                              <span className="text-muted">
                                {" "}(tú + {guests.length} invitado{guests.length > 1 ? "s" : ""})
                              </span>
                            </div>
                            {!hasEnoughCreditsForAll && availableCreditsForBooking !== Infinity && (
                              <span className="text-xs font-medium text-red-600">
                                Solo tienes {availableCreditsForBooking}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    <Button
                      size="lg"
                      className="w-full min-h-[48px] rounded-full bg-foreground text-background hover:bg-foreground/90"
                      onClick={handleReserveClick}
                      disabled={isBooking || (hasLayout && !selectedSpot) || (isAuthenticated && packagesLoading) || (guests.length > 0 && !hasEnoughCreditsForAll)}
                    >
                      {isBooking ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {hasLayout && !selectedSpot
                        ? t("selectSpot")
                        : guests.length > 0
                          ? `Reservar para ${totalPeople} persona${totalPeople > 1 ? "s" : ""}`
                          : t("bookClass")}
                    </Button>
                  </div>
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
                        {t("bookingConfirmed")}
                      </p>
                      {myBookedSpot && (
                        <p className="text-xs text-muted">{t("spotNumber", { number: myBookedSpot })}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95"
                  >
                    {t("cancel")}
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
                {t("cancellationPolicy")}
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
        {!isPast && !isCancelled && showCancelConfirm && myBooking && cls && (
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
                        {t("cancelBooking")}
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {cls.classType.name} · {new Date(cls.startsAt).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
                      </p>

                      {canRefund ? (
                        <div className="mt-4 rounded-xl bg-green-50 px-4 py-3">
                          <p className="text-[13px] font-medium text-green-700">
                            {t("creditRefunded")}
                          </p>
                          <p className="mt-0.5 text-[12px] text-green-600">
                            {t("moreThan12h")}
                          </p>
                        </div>
                      ) : (
                        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3">
                          <p className="text-[13px] font-medium text-red-700">
                            {t("creditNotRefunded")}
                          </p>
                          <p className="mt-0.5 text-[12px] text-red-600">
                            {t("lessThan12h", { hours: hoursLeft })}
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
                          {canRefund ? t("cancelBooking") : t("cancelWithoutRefund")}
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full rounded-full"
                          onClick={() => setShowCancelConfirm(false)}
                          disabled={cancelMutation.isPending}
                        >
                          {t("goBack")}
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
        {!isPast && !isCancelled && sheetOpen && (selectedSpot || !hasLayout) && (
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
