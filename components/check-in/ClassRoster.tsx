"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useOptimistic, useCallback, useEffect, startTransition } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
  const tags: { label: string; icon: React.ReactNode; className: string }[] = [];

  if (stats.birthdayLabel === "today") {
    tags.push({ label: "Cumpleaños hoy!", icon: <Cake className="h-2.5 w-2.5" />, className: "bg-pink-200 text-pink-800 border-pink-300 animate-pulse" });
  } else if (stats.birthdayLabel === "yesterday") {
    tags.push({ label: "Cumpleaños ayer", icon: <Cake className="h-2.5 w-2.5" />, className: "bg-pink-100 text-pink-700 border-pink-200" });
  } else if (stats.birthdayLabel === "this_week") {
    tags.push({ label: "Cumple esta semana", icon: <Cake className="h-2.5 w-2.5" />, className: "bg-pink-50 text-pink-600 border-pink-200" });
  }

  if (stats.isFirstEver) {
    tags.push({ label: "Primera clase", icon: <Sparkles className="h-2.5 w-2.5" />, className: "bg-amber-100 text-amber-700 border-amber-200" });
  } else if (stats.isFirstWithCoach) {
    tags.push({ label: "Primera con coach", icon: <UserPlus className="h-2.5 w-2.5" />, className: "bg-violet-100 text-violet-700 border-violet-200" });
  }

  if (stats.isTopClient) {
    tags.push({ label: "Top client", icon: <Crown className="h-2.5 w-2.5" />, className: "bg-yellow-100 text-yellow-700 border-yellow-200" });
  } else if (stats.isNewMember) {
    tags.push({ label: "Nuevo", icon: <Star className="h-2.5 w-2.5" />, className: "bg-blue-100 text-blue-700 border-blue-200" });
  }

  if (stats.totalClasses > 1) {
    tags.push({ label: `${stats.totalClasses} clases`, icon: <Trophy className="h-2.5 w-2.5" />, className: "bg-stone-100 text-stone-600 border-stone-200" });
  }

  if (stats.cancelRate != null && stats.cancelRate >= 20) {
    tags.push({
      label: `${stats.cancelRate}% cancela`,
      icon: <AlertTriangle className="h-2.5 w-2.5" />,
      className: stats.cancelRate >= 50
        ? "bg-red-100 text-red-700 border-red-200"
        : stats.cancelRate >= 35
          ? "bg-orange-100 text-orange-700 border-orange-200"
          : "bg-amber-50 text-amber-600 border-amber-200",
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
    blockCheckinWithoutWaiver: boolean;
  }>({
    queryKey: rosterKey,
    queryFn: () => fetch(`/api/check-in/roster/${classId}`).then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const roster = data?.roster ?? [];
  const blockWaiver = data?.blockCheckinWithoutWaiver ?? false;
  const waitlist = data?.waitlist ?? [];

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
        throw new Error(err.error ?? "Error al hacer check-in");
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
        throw new Error(err.error ?? "Error al deshacer check-in");
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
      <div className="px-3 sm:px-4 py-2.5 sm:py-3 border-b border-stone-100 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-stone-900 truncate">
              {classInfo.className} · {startFormatted}
            </p>
            <p className="text-xs text-stone-400 truncate">
              {classInfo.coachName} · {classInfo.room}
            </p>
          </div>
          <div className="flex gap-1.5 sm:gap-2 text-[10px] shrink-0">
            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
              {enrolledCount} <span className="hidden sm:inline">inscritos</span><span className="sm:hidden">insc.</span>
            </span>
            <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
              {presentCount} <span className="hidden sm:inline">confirmados</span><span className="sm:hidden">conf.</span>
            </span>
          </div>
        </div>
      </div>

      {/* Finished banner */}
      {classInfo.isFinished && (
        <div className="px-4 py-2 bg-stone-100 text-stone-500 text-xs text-center border-b border-stone-100">
          Esta clase ya terminó · Modo solo lectura
        </div>
      )}

      {/* Search + QR */}
      <div className="flex gap-2 p-3 border-b border-stone-100">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-300" size={14} />
          <input
            type="text"
            placeholder="Buscar miembro..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#3730B8] focus:border-[#3730B8]"
          />
        </div>
        <button
          disabled
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-stone-200 text-stone-400 opacity-50 cursor-not-allowed"
        >
          <QrCode size={14} />
          Escanear QR
          <span className="text-[9px] bg-stone-100 rounded px-1">próximamente</span>
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 border-b border-stone-100">
        {[
          { value: presentCount, label: "Presentes", highlight: false },
          { value: enrolledCount, label: "Inscritos", highlight: false },
          { value: pendingCount, label: "Pendientes", highlight: pendingCount > 0 },
          { value: waitlist.length, label: "Espera", highlight: false },
        ].map((stat) => (
          <div
            key={stat.label}
            className="py-1.5 sm:py-2 text-center border-r border-stone-100 last:border-r-0"
          >
            <p className={cn("text-sm sm:text-base font-medium", stat.highlight ? "text-amber-600" : "text-stone-900")}>
              {stat.value}
            </p>
            <p className={cn("text-[9px] sm:text-[10px]", stat.highlight ? "text-amber-600" : "text-stone-400")}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {/* Roster list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-stone-300" size={20} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-xs text-stone-400">
            {searchQuery ? "No se encontraron miembros" : "No hay inscritos en esta clase"}
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
              + Añadir walk-in
            </button>
          </div>
        )}
      </div>

      {/* Waiver pending confirmation */}
      {waiverConfirm && (
        <ConfirmDialog
          icon={<FileText className="text-amber-600 shrink-0 mt-0.5" size={18} />}
          title="Waiver no firmado"
          description="Este miembro no ha firmado el acuerdo de responsabilidad. Puedes enviarle el link para que firme desde su celular."
          confirmLabel="Check-in de todas formas"
          confirmClassName="bg-amber-50 text-amber-700 hover:bg-amber-100"
          onConfirm={() => {
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
          title="Pago pendiente"
          description="Este miembro tiene un pago pendiente. ¿Deseas hacer check-in igualmente?"
          confirmLabel="Confirmar check-in"
          confirmClassName="bg-red-50 text-red-600 hover:bg-red-100"
          onConfirm={confirmPaymentCheckIn}
          onCancel={() => setPaymentConfirm(null)}
        />
      )}

      {/* Undo check-in confirmation */}
      {undoConfirm && (
        <ConfirmDialog
          icon={<Undo2 className="text-amber-500 shrink-0 mt-0.5" size={18} />}
          title="Deshacer check-in"
          description={`¿Seguro que deseas deshacer el check-in de ${optimisticRoster.find((m) => m.memberId === undoConfirm)?.memberName ?? "este miembro"}?`}
          confirmLabel="Sí, deshacer"
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
              className="absolute -top-3 -right-3 z-10 bg-white rounded-full p-1 shadow-lg text-stone-500 hover:text-stone-700"
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
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-xl shadow-xl p-4 mx-4 max-w-sm w-full">
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
                Cancelar
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

  const packageLabel = member.hasPaymentPending
    ? "Pago pendiente"
    : member.isUnlimited
      ? `${member.membershipType} · Ilimitado`
      : member.remainingClasses != null
        ? `${member.membershipType} · ${member.remainingClasses} clases`
        : member.membershipType;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 px-3 sm:px-4 py-2.5 border-b border-stone-100 transition-colors",
        isCheckedIn ? "bg-emerald-50/70" : "hover:bg-stone-50",
        hasBirthday && !isCheckedIn && "bg-pink-50/50",
        hasBirthday && isCheckedIn && "bg-gradient-to-r from-emerald-50/70 to-pink-50/50",
      )}
    >
      {/* Avatar with photo */}
      <button
        type="button"
        onClick={hasPhoto ? onPhotoClick : undefined}
        className={cn(
          "w-[34px] h-[34px] rounded-full shrink-0 mt-0.5 overflow-hidden",
          isCheckedIn && "ring-2 ring-emerald-400",
          hasPhoto && "cursor-pointer hover:ring-2 hover:ring-[#3730B8]/40 transition-shadow",
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
        <p className="text-[13px] font-medium text-stone-900 truncate">
          {member.memberName}
        </p>
        <div className="flex items-center gap-1.5">
          <p className={cn(
            "text-[11px] truncate",
            member.hasPaymentPending ? "text-red-500" : "text-stone-400",
          )}>
            {packageLabel}
          </p>
          {member.waiverPending && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
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
                isLate ? "bg-amber-50 text-amber-700" : "bg-emerald-100 text-emerald-600",
              )}
            >
              {isLate ? (
                <><Clock size={12} /> Tarde</>
              ) : (
                <><Check size={12} /> Presente</>
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

  const promoteMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch("/api/check-in/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, memberId, force: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al promover");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["check-in-roster", classId] });
      toast.success("Miembro promovido de la lista de espera");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="bg-stone-50 border-t border-stone-100 px-4 py-3">
      <p className="text-[10px] font-medium text-stone-400 uppercase tracking-wider mb-2">
        Lista de espera
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
              en espera desde {format(new Date(w.since), "HH:mm", { locale: es })}
            </p>
          </div>
          {!isFinished && (
            <button
              onClick={() => promoteMutation.mutate(w.memberId)}
              disabled={promoteMutation.isPending}
              className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
            >
              Promover
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Walk-in Modal ──

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
  const [debouncedQuery, setDebouncedQuery] = useState(query);

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

  const walkInMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const res = await fetch("/api/check-in/walkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, memberId, force: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Error al añadir walk-in");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Walk-in añadido y check-in realizado");
      onAdded();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20">
      <div className="bg-white rounded-xl shadow-xl mx-4 max-w-sm w-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <p className="text-sm font-medium text-stone-900">Añadir walk-in</p>
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
              placeholder="Buscar por nombre o email..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-stone-200 bg-stone-50 focus:outline-none focus:ring-1 focus:ring-[#3730B8]"
            />
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {isLoading && debouncedQuery.length >= 2 ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-stone-300" size={16} />
            </div>
          ) : results.length === 0 && debouncedQuery.length >= 2 ? (
            <p className="text-center py-4 text-xs text-stone-400">Sin resultados</p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                disabled={r.classStatus === "enrolled" || walkInMutation.isPending}
                onClick={() => walkInMutation.mutate(r.id)}
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
                  <span className="text-[10px] text-stone-400">Ya inscrito</span>
                ) : r.classStatus === "waitlist" ? (
                  <span className="text-[10px] text-amber-600">En espera</span>
                ) : (
                  <UserPlus size={14} className="text-stone-400" />
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
