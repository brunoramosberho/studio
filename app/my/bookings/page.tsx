"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  AlertTriangle,
  Loader2,
  Share,
  Check,
  Clock,
} from "lucide-react";
import { CalendarDaysIcon, type CalendarDaysIconHandle } from "lucide-animated";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PageTransition } from "@/components/shared/page-transition";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { formatRelativeDay, formatTime, formatTimeRange, cn } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BookingWithDetails } from "@/types";
import { BiometricsCard } from "@/components/booking/biometrics-card";
import { useTranslations } from "next-intl";

interface FriendInfo {
  id: string;
  name: string | null;
  image: string | null;
}

interface EnrichedBooking extends BookingWithDetails {
  friendsGoing: FriendInfo[];
}

interface WaitlistEntry {
  id: string;
  classId: string;
  userId: string;
  position: number;
  createdAt: string;
  class: BookingWithDetails["class"];
}

type UpcomingItem =
  | { kind: "booking"; data: EnrichedBooking }
  | { kind: "waitlist"; data: WaitlistEntry };

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

async function fetchMyWaitlist(): Promise<WaitlistEntry[]> {
  const res = await fetch("/api/waitlist/my");
  if (!res.ok) return [];
  return res.json();
}

function canCancelFreely(classStartsAt: string | Date): boolean {
  const timeUntil = new Date(classStartsAt).getTime() - Date.now();
  return timeUntil > CANCELLATION_WINDOW_MS;
}

function hoursUntilClass(classStartsAt: string | Date): number {
  return Math.max(0, Math.round((new Date(classStartsAt).getTime() - Date.now()) / 3_600_000));
}

export default function BookingsPage() {
  const t = useTranslations("member");
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [cancelTarget, setCancelTarget] = useState<EnrichedBooking | null>(null);
  const [waitlistLeaveTarget, setWaitlistLeaveTarget] = useState<WaitlistEntry | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: upcoming = [], isLoading: loadingUpcoming } = useQuery({
    queryKey: ["bookings", "upcoming"],
    queryFn: () => fetchBookingList("upcoming"),
    enabled: !!session?.user,
  });

  const { data: waitlistEntries = [], isLoading: loadingWaitlist } = useQuery({
    queryKey: ["waitlist", "my"],
    queryFn: fetchMyWaitlist,
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

  const leaveWaitlistMutation = useMutation({
    mutationFn: async (entryId: string) => {
      const res = await fetch(`/api/waitlist/entry/${entryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Leave waitlist failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["waitlist", "my"] });
      queryClient.invalidateQueries({ queryKey: ["packages", "mine"] });
      setWaitlistLeaveTarget(null);
    },
  });

  const handleShare = useCallback(async (booking: EnrichedBooking) => {
    const classUrl = `${window.location.origin}/class/${booking.classId}`;
    const date = new Date(booking.class.startsAt);
    const dayStr = date.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
    const timeStr = formatTimeRange(booking.class.startsAt, booking.class.endsAt);
    const text = `${booking.class.classType.name} — ${booking.class.coach.name}\n${dayStr}, ${timeStr}`;

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

  const mergedUpcoming: UpcomingItem[] = [
    ...upcoming.map((b) => ({ kind: "booking" as const, data: b })),
    ...waitlistEntries.map((w) => ({ kind: "waitlist" as const, data: w })),
  ].sort(
    (a, b) =>
      new Date(a.data.class.startsAt).getTime() -
      new Date(b.data.class.startsAt).getTime(),
  );

  const totalUpcoming = mergedUpcoming.length;
  const loading = tab === "upcoming" ? (loadingUpcoming || loadingWaitlist) : loadingPast;
  const isAnyModalPending = cancelMutation.isPending || leaveWaitlistMutation.isPending;

  return (
    <PageTransition>
      <div className="space-y-5 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-foreground">
            {t("myBookings")}
          </h1>
          <Button asChild size="sm" className="rounded-full">
            <Link href="/schedule">+ {t("book")}</Link>
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-surface p-1">
          {(["upcoming", "past"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium transition-all",
                tab === tabKey
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted hover:text-foreground",
              )}
            >
              {tabKey === "upcoming" ? t("upcoming") : t("past")}
              {tabKey === "upcoming" && totalUpcoming > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-accent/10 px-1.5 text-[11px] font-bold text-accent">
                  {totalUpcoming}
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
        ) : tab === "upcoming" && mergedUpcoming.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
              <AutoAnimatedCalendarDays size={28} className="text-muted/40" />
            </div>
            <p className="mt-4 font-display text-lg font-bold text-foreground">
              {t("noUpcomingClasses")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("bookToStart")}
            </p>
            <Button asChild className="mt-6 rounded-full" size="sm">
              <Link href="/schedule">{t("exploreClasses")}</Link>
            </Button>
          </div>
        ) : tab === "past" && past.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface">
              <AutoAnimatedCalendarDays size={28} className="text-muted/40" />
            </div>
            <p className="mt-4 font-display text-lg font-bold text-foreground">
              {t("noHistoryYet")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("pastClassesWillAppear")}
            </p>
          </div>
        ) : tab === "upcoming" ? (
          <motion.div
            className="flex flex-col gap-3"
            variants={stagger}
            initial="hidden"
            animate="show"
            key="upcoming"
          >
            {mergedUpcoming.map((item) =>
              item.kind === "booking" ? (
                <BookingCard
                  key={`b-${item.data.id}`}
                  booking={item.data}
                  copiedId={copiedId}
                  onShare={handleShare}
                  onCancel={setCancelTarget}
                />
              ) : (
                <WaitlistCard
                  key={`w-${item.data.id}`}
                  entry={item.data}
                  onLeave={setWaitlistLeaveTarget}
                />
              ),
            )}
          </motion.div>
        ) : (
          <motion.div
            className="flex flex-col gap-3"
            variants={stagger}
            initial="hidden"
            animate="show"
            key="past"
          >
            {past.map((booking) => {
              const studioName = (booking.class as unknown as { room?: { studio?: { name?: string } } }).room?.studio?.name;
              const startDate = new Date(booking.class.startsAt);
              const dayLabel = format(startDate, "EEE d 'de' MMM", { locale: es });

              return (
                <motion.div key={booking.id} variants={fadeUp}>
                  <div className="mb-1.5 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
                    <span className="text-[13px] font-semibold capitalize text-foreground">
                      {formatTime(booking.class.startsAt)} / {dayLabel}
                      <span className="font-normal text-muted"> · {booking.class.classType.duration} min</span>
                    </span>
                  </div>

                  <div className="rounded-2xl border border-border/40 bg-white shadow-sm overflow-hidden">
                    <Link
                      href={`/class/${booking.classId}`}
                      className="block"
                    >
                      <div className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          {(booking.class.coach.photoUrl || booking.class.coach.user?.image) ? (
                            <img
                              src={(booking.class.coach.photoUrl || booking.class.coach.user?.image)!}
                              alt={booking.class.coach.name || "Coach"}
                              className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent">
                              {booking.class.coach.name?.charAt(0) || "C"}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-bold text-foreground">
                              {booking.class.classType.name}
                            </p>
                            <p className="truncate text-[13px] text-muted">
                              {t("withCoach")} {booking.class.coach.name?.split(" ")[0]}
                              {studioName && <span className="text-muted/50"> · {studioName}</span>}
                            </p>
                          </div>
                          <StatusBadge status={booking.status} />
                        </div>
                      </div>
                    </Link>
                    <BiometricsCard bookingId={booking.id} variant="inline" />
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {/* Cancel booking confirmation sheet */}
        <AnimatePresence>
          {cancelTarget && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
                onClick={() => !isAnyModalPending && setCancelTarget(null)}
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
                    {t("cancelBooking")}
                  </h3>

                  <p className="mt-1 text-sm text-muted">
                    {cancelTarget.class.classType.name} · {formatRelativeDay(cancelTarget.class.startsAt)}
                  </p>

                  {canCancelFreely(cancelTarget.class.startsAt) ? (
                    <div className="mt-4 rounded-xl bg-green-50 px-4 py-3">
                      <p className="text-[13px] font-medium text-green-700">
                        {t("creditWillBeReturned")}
                      </p>
                      <p className="mt-0.5 text-[12px] text-green-600">
                        {t("moreThan12Hours")}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-red-50 px-4 py-3">
                      <p className="text-[13px] font-medium text-red-700">
                        {t("creditWillNotBeReturned")}
                      </p>
                      <p className="mt-0.5 text-[12px] text-red-600">
                        {t("lessThan12Hours", { hours: hoursUntilClass(cancelTarget.class.startsAt) })}
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
                      {canCancelFreely(cancelTarget.class.startsAt) ? t("cancelBooking") : t("cancelNoRefund")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full rounded-full"
                      onClick={() => setCancelTarget(null)}
                      disabled={cancelMutation.isPending}
                    >
                      {t("goBack")}
                    </Button>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Leave waitlist confirmation sheet */}
        <AnimatePresence>
          {waitlistLeaveTarget && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm"
                onClick={() => !isAnyModalPending && setWaitlistLeaveTarget(null)}
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
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50">
                    <Clock className="h-6 w-6 text-orange-500" />
                  </div>

                  <h3 className="mt-4 font-display text-lg font-bold text-foreground">
                    {t("leaveWaitlist")}
                  </h3>

                  <p className="mt-1 text-sm text-muted">
                    {waitlistLeaveTarget.class.classType.name} · {formatRelativeDay(waitlistLeaveTarget.class.startsAt)}
                  </p>

                  <div className="mt-4 rounded-xl bg-green-50 px-4 py-3">
                    <p className="text-[13px] font-medium text-green-700">
                      {t("creditWillBeReturned")}
                    </p>
                    <p className="mt-0.5 text-[12px] text-green-600">
                      {t("waitlistCreditReturn")}
                    </p>
                  </div>

                  <div className="mt-6 flex flex-col gap-2">
                    <Button
                      variant="destructive"
                      className="w-full rounded-full"
                      onClick={() => leaveWaitlistMutation.mutate(waitlistLeaveTarget.id)}
                      disabled={leaveWaitlistMutation.isPending}
                    >
                      {leaveWaitlistMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("leaveList")}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full rounded-full"
                      onClick={() => setWaitlistLeaveTarget(null)}
                      disabled={leaveWaitlistMutation.isPending}
                    >
                      {t("goBack")}
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

function BookingCard({
  booking,
  copiedId,
  onShare,
  onCancel,
}: {
  booking: EnrichedBooking;
  copiedId: string | null;
  onShare: (b: EnrichedBooking) => void;
  onCancel: (b: EnrichedBooking) => void;
}) {
  const t = useTranslations("member");
  const studioName = (booking.class as unknown as { room?: { studio?: { name?: string } } }).room?.studio?.name;

  const startDate = new Date(booking.class.startsAt);
  const dayLabel = format(startDate, "EEE d 'de' MMM", { locale: es });

  return (
    <motion.div variants={fadeUp}>
      {/* Time / day header outside the card */}
      <div className="mb-1.5 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-foreground/70" />
        <span className="text-[13px] font-semibold capitalize text-foreground">
          {formatTime(booking.class.startsAt)} / {dayLabel}
          <span className="font-normal text-muted"> · {booking.class.classType.duration} min</span>
        </span>
      </div>

      <Link
        href={`/class/${booking.classId}`}
        className="block"
      >
        <div className="rounded-2xl border border-border/40 bg-white px-4 py-3.5 shadow-sm transition-shadow active:shadow-md">
          <div className="flex items-center gap-3">
            {(booking.class.coach.photoUrl || booking.class.coach.user?.image) ? (
              <img
                src={(booking.class.coach.photoUrl || booking.class.coach.user?.image)!}
                alt={booking.class.coach.name || "Coach"}
                className="h-10 w-10 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent">
                {booking.class.coach.name?.charAt(0) || "C"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-bold text-foreground">
                  {booking.class.classType.name}
                </p>
                {booking.spotNumber && (
                  <span className="flex-shrink-0 rounded bg-surface px-1.5 py-0.5 text-[9px] font-semibold text-muted">
                    #{booking.spotNumber}
                  </span>
                )}
              </div>
              <p className="truncate text-[13px] text-muted">
                con {booking.class.coach.name?.split(" ")[0]}
                {studioName && <span className="text-muted/50"> · {studioName}</span>}
              </p>
            </div>
            {booking.status === "CONFIRMED" && (
              <button
                onClick={(e) => { e.preventDefault(); onShare(booking); }}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface text-muted transition-colors active:scale-95"
              >
                {copiedId === booking.id ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Share className="h-3 w-3" />
                )}
              </button>
            )}
          </div>

          {/* Friends + Cancel — same row */}
          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {booking.friendsGoing?.length > 0 && (
                <>
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
                  <span className="text-[10px] font-medium text-accent">
                    {booking.friendsGoing.length === 1
                      ? t("friendGoing", { name: booking.friendsGoing[0].name?.split(" ")[0] ?? "" })
                      : t("friendsGoing", { count: booking.friendsGoing.length })}
                  </span>
                </>
              )}
            </div>
            {booking.status === "CONFIRMED" && (
              <button
                onClick={(e) => { e.preventDefault(); onCancel(booking); }}
                className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-600 transition-colors hover:bg-red-100 active:scale-95"
              >
                {t("cancel")}
              </button>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function WaitlistCard({
  entry,
  onLeave,
}: {
  entry: WaitlistEntry;
  onLeave: (e: WaitlistEntry) => void;
}) {
  const t = useTranslations("member");
  const studioName = (entry.class as unknown as { room?: { studio?: { name?: string } } }).room?.studio?.name;

  return (
    <motion.div variants={fadeUp}>
      <Link
        href={`/class/${entry.classId}`}
        className="block rounded-2xl border border-dashed border-amber-300/70 bg-amber-50/40 transition-shadow active:scale-[0.99]"
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="w-14 flex-shrink-0 text-center">
            <p className="text-[15px] font-bold text-foreground">
              {formatTime(entry.class.startsAt)}
            </p>
            <p className="text-[11px] text-muted">
              {entry.class.classType.duration} min
            </p>
          </div>

          <div
            className="h-10 w-0.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: (entry.class.classType.color || "#6366f1") + "40" }}
          />

          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {(entry.class.coach.photoUrl || entry.class.coach.user?.image) ? (
              <img
                src={entry.class.coach.photoUrl || entry.class.coach.user?.image!}
                alt={entry.class.coach.name || "Coach"}
                className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/20 text-[13px] font-bold text-accent">
                {entry.class.coach.name?.charAt(0) || "C"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-[15px] font-bold text-foreground">
                  {entry.class.classType.name}
                </p>
                <span className="flex-shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <Clock className="mr-0.5 inline h-2.5 w-2.5" />
                  #{entry.position} {t("inWaitlist")}
                </span>
              </div>
              <p className="truncate text-[13px] text-muted">
                {t("withCoach")} {entry.class.coach.name?.split(" ")[0]}
                {studioName && (
                  <span className="text-muted/50"> · {studioName}</span>
                )}
              </p>
              <p className="text-[11px] capitalize text-muted/70">
                {formatRelativeDay(entry.class.startsAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col items-end gap-1" onClick={(e) => e.preventDefault()}>
            <button
              onClick={(e) => { e.preventDefault(); onLeave(entry); }}
              className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-semibold text-amber-700 transition-colors hover:bg-amber-200 active:scale-95"
            >
              {t("leave")}
            </button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function AutoAnimatedCalendarDays({ size, className }: { size: number; className?: string }) {
  const ref = useRef<CalendarDaysIconHandle>(null);
  useEffect(() => {
    const timer = setTimeout(() => ref.current?.startAnimation(), 400);
    return () => clearTimeout(timer);
  }, []);
  return <CalendarDaysIcon ref={ref} size={size} className={className} />;
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("member");
  const config: Record<string, { label: string; color: string; bg: string }> = {
    CONFIRMED: { label: t("statusCompleted"), color: "text-green-700", bg: "bg-green-50" },
    ATTENDED: { label: t("statusAttended"), color: "text-green-700", bg: "bg-green-50" },
    NO_SHOW: { label: t("statusCreditLost"), color: "text-red-600", bg: "bg-red-50" },
    CANCELLED: { label: t("statusLateCancellation"), color: "text-red-600", bg: "bg-red-50" },
  };
  const s = config[status] ?? config.CONFIRMED;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[10px] font-semibold", s.bg, s.color)}>
      {s.label}
    </span>
  );
}
