"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useOptimistic, useCallback, useEffect, useRef, startTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Search,
  QrCode,
  UserPlus,
  Check,
  Clock,
  AlertCircle,
  X,
  Loader2,
  Undo2,
  Cake,
  Sparkles,
  Crown,
  Star,
  Trophy,
  AlertTriangle,
  FileText,
  Mail,
} from "lucide-react";
import { CircleCheckIcon, type CircleCheckIconHandle } from "lucide-animated";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { usePosStore } from "@/store/pos-store";
import { SpotPicker } from "@/components/admin/pos/spot-picker";

// ── Types ──

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

interface RosterMember {
  memberId: string;
  memberName: string | null;
  memberImage: string | null;
  initials: string;
  membershipType: string;
  membershipPackageType: string | null;
  remainingClasses: number | null;
  isUnlimited: boolean;
  hasPaymentPending: boolean;
  waiverPending: boolean;
  memberSince: string;
  stats: AttendeeStats;
  checkIn: {
    status: "present" | "late" | "absent";
    method: string;
    createdAt: string;
  } | null;
}

interface WaitlistMember {
  memberId: string;
  memberName: string | null;
  memberImage: string | null;
  position: number;
  since: string;
}

interface WellhubBooking {
  platformBookingId: string;
  source: "wellhub";
  status: "confirmed" | "checked_in" | "pending_confirmation";
  memberName: string;
  initials: string;
  wellhubUniqueToken: string | null;
  wellhubBookingNumber: string | null;
  wellhubProductId: number | null;
  email: string | null;
  phone: string | null;
  magicUserId: string | null;
  checkedInAt: string | null;
  createdAt: string;
}

interface SearchResult {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  classStatus: "enrolled" | "waitlist" | "not_enrolled";
}

interface ClassInfo {
  className: string;
  startTime: string;
  endTime: string;
  coachName: string | null;
  room: string;
  capacity: number;
  enrolledCount: number;
  isFinished: boolean;
}

interface ClassRosterProps {
  classId: string;
  classInfo: ClassInfo;
}

// ── Avatar colors derived from memberId ──

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-purple-100 text-purple-700",
  "bg-blue-100 text-blue-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
];

function getAvatarColor(memberId: string) {
  const idx = memberId.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ── Attendee Tags (matches class detail page) ──

function AttendeeTags({ stats }: { stats: AttendeeStats }) {
  const t = useTranslations("checkin");
  const tags: { label: string; icon: React.ReactNode; className: string }[] = [];

  if (stats.birthdayLabel === "today") {
    tags.push({ label: t("birthdayToday"), icon: <Cake className="h-2.5 w-2.5" />, className: "bg-pink-200 text-pink-800 border-pink-300 animate-pulse dark:bg-pink-500/20 dark:text-pink-200 dark:border-pink-500/30" });
  } else if (stats.birthdayLabel === "yesterday") {
    tags.push({ label: t("birthdayYesterday"), icon: <Cake className="h-2.5 w-2.5" />, className: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:border-pink-500/25" });
  } else if (stats.birthdayLabel === "this_week") {
    tags.push({ label: t("birthdayThisWeek"), icon: <Cake className="h-2.5 w-2.5" />, className: "bg-pink-50 text-pink-600 border-pink-200 dark:bg-pink-500/10 dark:text-pink-300 dark:border-pink-500/25" });
  }

  if (stats.isFirstEver) {
    tags.push({ label: t("firstClass"), icon: <Sparkles className="h-2.5 w-2.5" />, className: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/25" });
  } else if (stats.isFirstWithCoach) {
    tags.push({ label: t("firstWithCoach"), icon: <UserPlus className="h-2.5 w-2.5" />, className: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/25" });
  }

  if (stats.isTopClient) {
    tags.push({ label: t("topClient"), icon: <Crown className="h-2.5 w-2.5" />, className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-500/15 dark:text-yellow-300 dark:border-yellow-500/25" });
  } else if (stats.isNewMember) {
    tags.push({ label: t("newMember"), icon: <Star className="h-2.5 w-2.5" />, className: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/25" });
  }

  if (stats.totalClasses > 1) {
    tags.push({ label: t("classesCount", { num: stats.totalClasses }), icon: <Trophy className="h-2.5 w-2.5" />, className: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-surface dark:text-muted dark:border-border" });
  }

  if (stats.cancelRate != null && stats.cancelRate >= 20) {
    tags.push({
      label: t("cancellationRate", { num: stats.cancelRate }),
      icon: <AlertTriangle className="h-2.5 w-2.5" />,
      className: stats.cancelRate >= 50
        ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/25"
        : stats.cancelRate >= 35
          ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/25"
          : "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/25",
    });
  }

  if (tags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag) => (
        <span
          key={tag.label}
          className={cn(
            "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0 text-[9px] font-semibold leading-relaxed",
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

// ── Main component ──

export function ClassRoster({ classId, classInfo }: ClassRosterProps) {
  const queryClient = useQueryClient();
  const t = useTranslations("checkin");
  const [searchQuery, setSearchQuery] = useState("");
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInQuery, setWalkInQuery] = useState("");
  const [paymentConfirm, setPaymentConfirm] = useState<string | null>(null);
  const [waiverConfirm, setWaiverConfirm] = useState<string | null>(null);
  const [undoConfirm, setUndoConfirm] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; name: string } | null>(null);

  const rosterKey = ["check-in-roster", classId];

  const { data, isLoading } = useQuery<{
    roster: RosterMember[];
    waitlist: WaitlistMember[];
    wellhubBookings: WellhubBooking[];
    blockCheckinWithoutWaiver: boolean;
  }>({
    queryKey: rosterKey,
    queryFn: () => fetch(`/api/check-in/roster/${classId}`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const roster = data?.roster ?? [];
  const blockWaiver = data?.blockCheckinWithoutWaiver ?? false;
  const waitlist = data?.waitlist ?? [];
  const wellhubBookings = data?.wellhubBookings ?? [];

  const [optimisticRoster, addOptimistic] = useOptimistic(
    roster,
    (state: RosterMember[], action: { memberId: string; type: "checkin" | "undo"; status?: "present" | "late" }) => {
      if (action.type === "checkin") {
        return state.map((m) =>
          m.memberId === action.memberId
            ? { ...m, checkIn: { status: action.status ?? "present", method: "manual", createdAt: new Date().toISOString() } }
            : m,
        );
      }
      return state.map((m) =>
        m.memberId === action.memberId ? { ...m, checkIn: null } : m,
      );
    },
  );

  const checkInMutation = useMutation({
    mutationFn: async ({ memberId, method, force }: { memberId: string; method: string; force?: boolean }) => {
      const res = await fetch(`/api/check-in/${classId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, method, force }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("checkInError"));
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rosterKey }),
    onError: (err: Error) => {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: rosterKey });
    },
  });

  const undoCheckInMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch(`/api/check-in/${classId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("undoCheckInError"));
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: rosterKey }),
    onError: (err: Error) => {
      toast.error(err.message);
      queryClient.invalidateQueries({ queryKey: rosterKey });
    },
  });

  const handleCheckIn = useCallback(
    (memberId: string, hasPaymentPending: boolean, waiverPending: boolean) => {
      if (classInfo.isFinished) return;
      if (waiverPending && blockWaiver) {
        setWaiverConfirm(memberId);
        return;
      }
      if (hasPaymentPending) {
        setPaymentConfirm(memberId);
        return;
      }
      const now = new Date();
      const isLate = now > new Date(classInfo.startTime);
      startTransition(() => {
        addOptimistic({ memberId, type: "checkin", status: isLate ? "late" : "present" });
      });
      checkInMutation.mutate({ memberId, method: "manual" });
    },
    [classInfo.isFinished, classInfo.startTime, addOptimistic, checkInMutation, blockWaiver],
  );

  const confirmPaymentCheckIn = useCallback(() => {
    if (!paymentConfirm) return;
    const now = new Date();
    const isLate = now > new Date(classInfo.startTime);
    startTransition(() => {
      addOptimistic({ memberId: paymentConfirm, type: "checkin", status: isLate ? "late" : "present" });
    });
    checkInMutation.mutate({ memberId: paymentConfirm, method: "manual" });
    setPaymentConfirm(null);
  }, [paymentConfirm, classInfo.startTime, addOptimistic, checkInMutation]);

  const handleUndoRequest = useCallback(
    (memberId: string) => {
      if (classInfo.isFinished) return;
      setUndoConfirm(memberId);
    },
    [classInfo.isFinished],
  );

  const confirmUndo = useCallback(() => {
    if (!undoConfirm) return;
    startTransition(() => {
      addOptimistic({ memberId: undoConfirm, type: "undo" });
    });
    undoCheckInMutation.mutate(undoConfirm);
    setUndoConfirm(null);
  }, [undoConfirm, addOptimistic, undoCheckInMutation]);

  const filtered = searchQuery
    ? optimisticRoster.filter((m) =>
        (m.memberName ?? "").toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : optimisticRoster;

  const presentCount = optimisticRoster.filter((m) => m.checkIn).length;
  const enrolledCount = optimisticRoster.length;
  const pendingCount = enrolledCount - presentCount;

  const startFormatted = format(new Date(classInfo.startTime), "HH:mm");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-stone-100 dark:border-border/60 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-900 dark:text-foreground truncate">
              {classInfo.className} · {startFormatted}
            </p>
            <p className="text-xs text-stone-400 dark:text-muted truncate">
              {classInfo.coachName} · {classInfo.room}
            </p>
          </div>
          <div className="flex gap-1.5 sm:gap-2 text-[10px] shrink-0">
            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {enrolledCount} <span className="hidden sm:inline">{t("enrolled")}</span><span className="sm:hidden">{t("enrolledShort")}</span>
            </span>
            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              {presentCount} <span className="hidden sm:inline">{t("confirmed")}</span><span className="sm:hidden">{t("confirmedShort")}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Finished banner */}
      {classInfo.isFinished && (
        <div className="px-4 py-2 bg-stone-100 text-stone-500 text-xs text-center border-b border-stone-100 dark:bg-surface dark:text-muted dark:border-border/60">
          {t("classFinished")}
        </div>
      )}

      {/* Search + QR */}
      <div className="flex gap-2 p-3 border-b border-stone-100 dark:border-border/60">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-300 dark:text-muted" size={14} />
          <input
            type="text"
            placeholder={t("searchMember")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-admin focus:border-admin dark:bg-surface dark:border-border"
          />
        </div>
        <button
          disabled
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-400 opacity-50 cursor-not-allowed dark:border-border dark:text-muted"
        >
          <QrCode size={14} />
          {t("scanQR")}
          <span className="text-[9px] bg-stone-100 rounded px-1 dark:bg-surface">{t("comingSoon")}</span>
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 border-b border-stone-100 dark:border-border/60">
        {[
          { value: presentCount, label: t("present"), highlight: false },
          { value: enrolledCount, label: t("enrolled"), highlight: false },
          { value: pendingCount, label: t("pending"), highlight: pendingCount > 0 },
          { value: waitlist.length, label: t("waitlist"), highlight: false },
        ].map((stat) => (
          <div
            key={stat.label}
            className="py-1.5 sm:py-2 text-center border-r border-stone-100 last:border-r-0 dark:border-border/60"
          >
            <p className={cn("text-sm sm:text-base font-medium", stat.highlight ? "text-amber-600 dark:text-amber-300" : "text-stone-900 dark:text-foreground")}>
              {stat.value}
            </p>
            <p className={cn("text-[9px] sm:text-[10px]", stat.highlight ? "text-amber-600 dark:text-amber-300" : "text-stone-400 dark:text-muted")}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Roster list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-stone-300 dark:text-muted" size={20} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-xs text-stone-400 dark:text-muted">
            {searchQuery ? t("noMembersFound") : t("noEnrollees")}
          </div>
        ) : (
          filtered.map((member) => (
            <RosterRow
              key={member.memberId}
              member={member}
              isFinished={classInfo.isFinished}
              onCheckIn={() => handleCheckIn(member.memberId, member.hasPaymentPending, member.waiverPending)}
              onUndoRequest={() => handleUndoRequest(member.memberId)}
              onPhotoClick={member.memberImage
                ? () => setPhotoPreview({ url: member.memberImage!, name: member.memberName ?? "" })
                : undefined
              }
            />
          ))
        )}

        {/* Wellhub bookings on this class */}
        {wellhubBookings.length > 0 && (
          <WellhubBookingsSection
            bookings={wellhubBookings}
            classId={classId}
            isFinished={classInfo.isFinished}
          />
        )}

        {/* Waitlist section */}
        {waitlist.length > 0 && (
          <WaitlistSection
            waitlist={waitlist}
            classId={classId}
            isFinished={classInfo.isFinished}
          />
        )}

        {/* Walk-in button */}
        {!classInfo.isFinished && (
          <div className="px-3 sm:px-4 py-3">
            <button
              onClick={() => setWalkInOpen(true)}
              className="w-full border border-dashed border-stone-200 rounded-xl py-2.5 text-xs text-stone-400 hover:bg-stone-50 active:bg-stone-100 transition-colors"
            >
              + {t("addWalkIn")}
            </button>
          </div>
        )}
      </div>

      {/* Waiver pending confirmation */}
      {waiverConfirm && (
        <WaiverConfirmDialog
          memberId={waiverConfirm}
          onForceCheckIn={() => {
            const now = new Date();
            const isLate = now > new Date(classInfo.startTime);
            startTransition(() => {
              addOptimistic({ memberId: waiverConfirm, type: "checkin", status: isLate ? "late" : "present" });
            });
            checkInMutation.mutate({ memberId: waiverConfirm, method: "manual", force: true });
            setWaiverConfirm(null);
          }}
          onCancel={() => setWaiverConfirm(null)}
        />
      )}

      {/* Payment pending confirmation */}
      {paymentConfirm && (
        <ConfirmDialog
          icon={<AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />}
          title={t("paymentPending")}
          description={t("paymentPendingDesc")}
          confirmLabel={t("confirmCheckIn")}
          confirmClassName="bg-red-50 text-red-600 hover:bg-red-100"
          onConfirm={confirmPaymentCheckIn}
          onCancel={() => setPaymentConfirm(null)}
        />
      )}

      {/* Undo check-in confirmation */}
      {undoConfirm && (
        <ConfirmDialog
          icon={<Undo2 className="text-amber-500 shrink-0 mt-0.5" size={18} />}
          title={t("undoCheckIn")}
          description={t("undoCheckInConfirm", { name: optimisticRoster.find((m) => m.memberId === undoConfirm)?.memberName ?? t("thisMember") })}
          confirmLabel={t("yesUndo")}
          confirmClassName="bg-amber-50 text-amber-700 hover:bg-amber-100"
          onConfirm={confirmUndo}
          onCancel={() => setUndoConfirm(null)}
        />
      )}

      {/* Walk-in modal */}
      {walkInOpen && (
        <WalkInModal
          classId={classId}
          onClose={() => {
            setWalkInOpen(false);
            setWalkInQuery("");
          }}
          onAdded={() => {
            queryClient.invalidateQueries({ queryKey: rosterKey });
            setWalkInOpen(false);
            setWalkInQuery("");
          }}
          query={walkInQuery}
          setQuery={setWalkInQuery}
        />
      )}

      {/* Photo preview lightbox */}
      {photoPreview && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50"
          onClick={() => setPhotoPreview(null)}
        >
          <div
            className="relative mx-6 max-w-xs w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPhotoPreview(null)}
              className="absolute -top-3 -right-3 z-10 bg-card rounded-full p-1 shadow-lg text-stone-500 hover:text-stone-700"
            >
              <X size={16} />
            </button>
            <img
              src={photoPreview.url}
              alt={photoPreview.name}
              className="w-full rounded-2xl shadow-2xl object-cover aspect-square"
            />
            <p className="text-center text-sm font-medium text-white mt-3">
              {photoPreview.name}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Confirm Dialog (reusable inline) ──

function ConfirmDialog({
  icon,
  title,
  description,
  confirmLabel,
  confirmClassName,
  onConfirm,
  onCancel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  confirmClassName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tc = useTranslations("common");
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
      <div className="bg-card rounded-xl shadow-xl p-4 mx-4 max-w-sm w-full">
        <div className="flex items-start gap-3">
          {icon}
          <div>
            <p className="text-sm font-medium text-stone-900">{title}</p>
            <p className="text-xs text-stone-500 mt-1">{description}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={onCancel}
                className="px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={onConfirm}
                className={cn("px-3 py-1.5 text-xs rounded-lg", confirmClassName)}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Roster Row ──

function RosterRow({
  member,
  isFinished,
  onCheckIn,
  onUndoRequest,
  onPhotoClick,
}: {
  member: RosterMember;
  isFinished: boolean;
  onCheckIn: () => void;
  onUndoRequest: () => void;
  onPhotoClick?: () => void;
}) {
  const isCheckedIn = !!member.checkIn;
  const isLate = member.checkIn?.status === "late";
  const hasBirthday = member.stats?.birthdayLabel === "today";
  const hasPhoto = !!member.memberImage;

  const circleCheckRef = useRef<CircleCheckIconHandle>(null);
  const prevCheckedIn = useRef(isCheckedIn);
  useEffect(() => {
    if (isCheckedIn && !prevCheckedIn.current) {
      circleCheckRef.current?.startAnimation();
    }
    prevCheckedIn.current = isCheckedIn;
  }, [isCheckedIn]);

  const tc = useTranslations("checkin");
  const packageLabel = member.hasPaymentPending
    ? tc("paymentPending")
    : member.isUnlimited
      ? `${member.membershipType} · ${tc("unlimited")}`
      : member.remainingClasses != null
        ? `${member.membershipType} · ${tc("remainingClasses", { num: member.remainingClasses })}`
        : member.membershipType;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-3 sm:px-4 py-2.5 border-b border-stone-100 transition-colors dark:border-border/60",
        isCheckedIn ? "bg-emerald-50/70 dark:bg-emerald-500/10" : "hover:bg-stone-50 dark:hover:bg-surface/60",
        hasBirthday && !isCheckedIn && "bg-pink-50/50 dark:bg-pink-500/10",
        hasBirthday && isCheckedIn && "bg-gradient-to-r from-emerald-50/70 to-pink-50/50 dark:from-emerald-500/10 dark:to-pink-500/10",
      )}
    >
      {/* Avatar with photo */}
      <button
        type="button"
        onClick={hasPhoto ? onPhotoClick : undefined}
        className={cn(
          "w-[34px] h-[34px] rounded-full shrink-0 mt-0.5 overflow-hidden",
          isCheckedIn && "ring-2 ring-emerald-400",
          hasPhoto && "cursor-pointer hover:ring-2 hover:ring-admin/40 transition-shadow",
          !hasPhoto && "cursor-default",
        )}
      >
        {hasPhoto ? (
          <img
            src={member.memberImage!}
            alt={member.memberName ?? ""}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "w-full h-full flex items-center justify-center text-[11px] font-medium",
              getAvatarColor(member.memberId),
            )}
          >
            {member.initials}
          </div>
        )}
      </button>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-stone-900 dark:text-foreground truncate">
          {member.memberName}
        </p>
        <div className="flex items-center gap-1.5">
          <p className={cn(
            "text-[11px] truncate",
            member.hasPaymentPending ? "text-red-500 dark:text-red-300" : "text-stone-400 dark:text-muted",
          )}>
            {packageLabel}
          </p>
          {member.waiverPending && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              <FileText size={9} />
              Waiver
            </span>
          )}
        </div>

        {/* Tags */}
        {member.stats && <AttendeeTags stats={member.stats} />}
      </div>

      {/* Action */}
      <div className="shrink-0 mt-0.5">
        {isCheckedIn ? (
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-1 px-2.5 sm:px-3 py-1 rounded-full text-xs cursor-default",
                isLate
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
              )}
            >
              {isLate ? (
                <><Clock size={12} /> {tc("late")}</>
              ) : (
                <><CircleCheckIcon ref={circleCheckRef} size={12} /> {tc("presentLabel")}</>
              )}
            </span>
            {!isFinished && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUndoRequest();
                }}
                className="p-1.5 rounded-full text-stone-300 hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors md:opacity-0 md:group-hover:opacity-100"
              >
                <Undo2 size={12} />
              </button>
            )}
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn();
            }}
            disabled={isFinished}
            className={cn(
              "px-2.5 sm:px-3 py-1 rounded-full text-xs font-medium transition-colors",
              member.hasPaymentPending
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : member.waiverPending
                  ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
              isFinished && "opacity-50 cursor-not-allowed",
            )}
          >
            Check-in
          </button>
        )}
      </div>
    </div>
  );
}

// ── Wellhub Bookings Section ──

function WellhubBookingsSection({
  bookings,
  classId,
  isFinished,
}: {
  bookings: WellhubBooking[];
  classId: string;
  isFinished: boolean;
}) {
  const queryClient = useQueryClient();

  const checkInMutation = useMutation({
    mutationFn: async (platformBookingId: string) => {
      const res = await fetch(`/api/platforms/bookings/${platformBookingId}/checkin`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        const message =
          body?.error === "wellhub_checkin_pending"
            ? "El miembro aún no ha hecho check-in en la app de Wellhub. Pídele que abra Wellhub y reintenta."
            : body?.message ?? body?.error ?? "Falló el check-in";
        throw new Error(message);
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["check-in-roster", classId] });
      toast.success("Check-in registrado en Wellhub");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-orange-50/50 border-t border-orange-100 px-4 py-3">
      <p className="text-[10px] font-medium text-orange-600 uppercase tracking-wider mb-2">
        Reservas Wellhub · {bookings.length}
      </p>
      {bookings.map((b) => {
        const isCheckedIn = b.status === "checked_in";
        return (
          <div key={b.platformBookingId} className="flex items-center gap-3 py-2">
            <div className="w-[28px] h-[28px] rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 bg-orange-500 text-white">
              {b.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-stone-900 truncate">{b.memberName}</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-semibold uppercase tracking-wide">
                  Wellhub
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-stone-500">
                {b.email && <span className="truncate">{b.email}</span>}
                {b.wellhubUniqueToken && (
                  <span className="font-mono">#{b.wellhubUniqueToken.slice(-6)}</span>
                )}
              </div>
            </div>
            {isCheckedIn ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                ✓ {b.checkedInAt ? format(new Date(b.checkedInAt), "HH:mm") : "Asistió"}
              </span>
            ) : !isFinished ? (
              <button
                onClick={() => checkInMutation.mutate(b.platformBookingId)}
                disabled={checkInMutation.isPending}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                Check-in
              </button>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-stone-100 text-stone-500">
                No asistió
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Waitlist Section ──

function WaitlistSection({
  waitlist,
  classId,
  isFinished,
}: {
  waitlist: WaitlistMember[];
  classId: string;
  isFinished: boolean;
}) {
  const queryClient = useQueryClient();

  const t = useTranslations("checkin");
  const promoteMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch("/api/check-in/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, memberId, force: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? t("promoteError"));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["check-in-roster", classId] });
      toast.success(t("memberPromoted"));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-stone-50 border-t border-stone-100 px-4 py-3">
      <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider mb-2">
        {t("waitlist")}
      </p>
      {waitlist.map((w) => (
        <div key={w.memberId} className="flex items-center gap-3 py-1.5">
          <div
            className={cn(
              "w-[26px] h-[26px] rounded-full flex items-center justify-center text-[10px] font-medium shrink-0",
              getAvatarColor(w.memberId),
            )}
          >
            {(w.memberName ?? "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-stone-700 truncate">{w.memberName}</p>
            <p className="text-[10px] text-stone-400">
              {t("waitingSince")} {format(new Date(w.since), "HH:mm", { locale: es })}
            </p>
          </div>
          {!isFinished && (
            <button
              onClick={() => promoteMutation.mutate(w.memberId)}
              disabled={promoteMutation.isPending}
              className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              {t("promote")}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Waiver Confirm Dialog (with send email) ──

function WaiverConfirmDialog({
  memberId,
  onForceCheckIn,
  onCancel,
}: {
  memberId: string;
  onForceCheckIn: () => void;
  onCancel: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const t = useTranslations("checkin");

  async function handleSendEmail() {
    setSending(true);
    try {
      const res = await fetch("/api/admin/waiver/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? t("emailSendError"));
      } else {
        setSent(true);
        toast.success(t("emailSent"));
      }
    } catch {
      toast.error(t("emailSendError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
      <div className="bg-card rounded-xl shadow-xl p-4 mx-4 max-w-sm w-full">
        <div className="flex items-start gap-3">
          <FileText className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div className="flex-1">
            <p className="text-sm font-medium text-stone-900">{t("waiverUnsigned")}</p>
            <p className="text-xs text-stone-500 mt-1">
              {t("waiverUnsignedDesc")}
            </p>

            <div className="flex flex-col gap-2 mt-3">
              <button
                onClick={handleSendEmail}
                disabled={sending || sent}
                className={cn(
                  "flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs rounded-lg transition-colors",
                  sent
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100",
                  (sending || sent) && "opacity-70 cursor-not-allowed",
                )}
              >
                {sending ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : sent ? (
                  <Check size={13} />
                ) : (
                  <Mail size={13} />
                )}
                {sent ? t("emailSent") : t("sendEmailLink")}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                >
                  {t("cancelLabel")}
                </button>
                <button
                  onClick={onForceCheckIn}
                  className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100"
                >
                  {t("forceCheckIn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Walk-in Modal ──

interface NoCreditInfo {
  member: { id: string; name: string | null; email: string; phone: string | null; image: string | null };
  classInfo: { id: string; classTypeId: string; classTypeName: string; startsAt: string };
}

function WalkInModal({
  classId,
  onClose,
  onAdded,
  query,
  setQuery,
}: {
  classId: string;
  onClose: () => void;
  onAdded: () => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const t = useTranslations("checkin");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [noCreditInfo, setNoCreditInfo] = useState<NoCreditInfo | null>(null);
  const [waiverBlock, setWaiverBlock] = useState<string | null>(null);
  const [pendingMember, setPendingMember] = useState<{ id: string } | null>(null);
  const [showSpotPicker, setShowSpotPicker] = useState(false);
  const { openPOS } = usePosStore();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ["check-in-search", debouncedQuery, classId],
    queryFn: () =>
      fetch(`/api/check-in/search?q=${encodeURIComponent(debouncedQuery)}&classId=${classId}`).then((r) =>
        r.json(),
      ),
    enabled: debouncedQuery.length >= 2,
  });

  const { data: spotData } = useQuery<{ hasLayout: boolean }>({
    queryKey: ["walkin-class-spots", classId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/pos/class-spots?classId=${classId}`);
      if (!res.ok) return { hasLayout: false };
      return res.json();
    },
    staleTime: 30_000,
  });

  const roomHasLayout = spotData?.hasLayout === true;

  function handleMemberClick(memberId: string) {
    if (roomHasLayout) {
      setPendingMember({ id: memberId });
      setShowSpotPicker(true);
    } else {
      walkInMutation.mutate({ memberId });
    }
  }

  function handleSpotChosen(spotNumber: number | null) {
    setShowSpotPicker(false);
    if (pendingMember) {
      walkInMutation.mutate({ memberId: pendingMember.id, spotNumber });
    }
    setPendingMember(null);
  }

  const walkInMutation = useMutation({
    mutationFn: async ({ memberId, skipWaiverCheck, spotNumber }: { memberId: string; skipWaiverCheck?: boolean; spotNumber?: number | null }) => {
      const res = await fetch("/api/check-in/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, memberId, force: true, skipWaiverCheck, spotNumber }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.waiverPending) {
          return { waiverPending: true, memberId: data.memberId };
        }
        if (data.noCredits && data.member) {
          return { noCredits: true, member: data.member, classInfo: data.classInfo };
        }
        throw new Error(data.error ?? t("walkInError"));
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.waiverPending) {
        setWaiverBlock(data.memberId);
        return;
      }
      if (data.noCredits) {
        setNoCreditInfo({ member: data.member, classInfo: data.classInfo });
        return;
      }
      toast.success(t("walkInAdded"));
      onAdded();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleOpenPOS() {
    if (!noCreditInfo) return;
    const { member, classInfo } = noCreditInfo;
    const classLabel = `${classInfo.classTypeName} — ${format(new Date(classInfo.startsAt), "EEE d MMM HH:mm", { locale: es })}`;

    openPOS({
      customer: {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        image: member.image,
      },
      selectedClass: {
        classId: classInfo.id,
        classTypeId: classInfo.classTypeId,
        classTypeName: classInfo.classTypeName,
        label: classLabel,
        startsAt: classInfo.startsAt,
        hasCredits: false,
      },
      onComplete: onAdded,
    });
    onClose();
  }

  if (waiverBlock) {
    return (
      <WaiverConfirmDialog
        memberId={waiverBlock}
        onForceCheckIn={() => {
          walkInMutation.mutate({ memberId: waiverBlock, skipWaiverCheck: true });
          setWaiverBlock(null);
        }}
        onCancel={() => setWaiverBlock(null)}
      />
    );
  }

  if (noCreditInfo) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
        <div className="bg-card rounded-xl shadow-xl mx-4 max-w-sm w-full overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
            <p className="text-sm font-medium text-stone-900">{t("noCredits")}</p>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
              <X size={16} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs text-amber-800">
                <p className="font-semibold">{noCreditInfo.member.name ?? noCreditInfo.member.email}</p>
                <p className="mt-0.5">
                  {t("noCreditsDesc", { className: noCreditInfo.classInfo.classTypeName })}
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
              >
                {t("cancelLabel")}
              </button>
              <button
                onClick={handleOpenPOS}
                className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-admin text-white hover:bg-admin/90"
              >
                {t("openPOS")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
      <div className="bg-card rounded-xl shadow-xl mx-4 max-w-sm w-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <p className="text-sm font-medium text-stone-900">{t("addWalkIn")}</p>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600">
            <X size={16} />
          </button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-300" size={14} />
            <input
              autoFocus
              type="text"
              placeholder={t("searchByNameOrEmail")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-admin"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {isLoading && debouncedQuery.length >= 2 ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-stone-300" size={16} />
            </div>
          ) : results.length === 0 && debouncedQuery.length >= 2 ? (
            <p className="text-center py-4 text-xs text-stone-400">{t("noResults")}</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                disabled={r.classStatus === "enrolled" || walkInMutation.isPending}
                onClick={() => handleMemberClick(r.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-stone-50 transition-colors border-b border-stone-50",
                  r.classStatus === "enrolled" && "opacity-50 cursor-not-allowed",
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium",
                    getAvatarColor(r.id),
                  )}
                >
                  {(r.name ?? r.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-stone-900 truncate">{r.name ?? r.email}</p>
                  <p className="text-[10px] text-stone-400 truncate">{r.email}</p>
                </div>
                {r.classStatus === "enrolled" ? (
                  <span className="text-[10px] text-stone-400">{t("alreadyEnrolled")}</span>
                ) : r.classStatus === "waitlist" ? (
                  <span className="text-[10px] text-amber-600">{t("inWaitlist")}</span>
                ) : (
                  <UserPlus size={14} className="text-stone-400" />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Spot picker for rooms with layout */}
      <SpotPicker
        open={showSpotPicker}
        onOpenChange={(open) => {
          setShowSpotPicker(open);
          if (!open) setPendingMember(null);
        }}
        classId={classId}
        onSpotSelected={(spot) => handleSpotChosen(spot)}
        onSkip={() => handleSpotChosen(null)}
      />
    </div>
  );
}
