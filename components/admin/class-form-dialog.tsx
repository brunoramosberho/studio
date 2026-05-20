"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { addMinutes, addWeeks, format, setDay, startOfDay, isBefore, isAfter } from "date-fns";
import { Loader2, Music, CalendarRange, Repeat, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ClassType, CoachProfile, User } from "@prisma/client";
import type { ClassWithDetails } from "@/types";
import { zonedWallTimeToUtc, formatDateInZone, formatTime24InZone } from "@/lib/utils";

interface StudioWithRooms {
  id: string;
  name: string;
  city?: { id: string; name: string; timezone: string } | null;
  rooms: { id: string; name: string; maxCapacity: number; classTypes: { id: string; name: string }[] }[];
}

const FALLBACK_TZ = "Europe/Madrid";

type CoachProfileWithUser = CoachProfile & { user?: Pick<User, "id" | "name" | "email" | "image"> | null };

type PickerStatus =
  | "preferred"
  | "ok_if_needed"
  | "available_unconfigured"
  | "no_availability"
  | "time_off"
  | "conflict";

interface PickerCoach {
  id: string;
  name: string;
  image: string | null;
  color: string;
  status: PickerStatus;
  conflictClass: { name: string; startsAt: string } | null;
  priorClass: { name: string; startsAt: string; endsAt: string; gapMinutes: number } | null;
  followingClass: { name: string; startsAt: string; endsAt: string; gapMinutes: number } | null;
  classesThisDay: number;
  classesThisWeek: number;
}

interface PickerClassType {
  id: string;
  name: string;
  color: string;
  duration: number;
  weeklyAtStudio: number | null;
  dailyAtStudio: number | null;
  parallelAtOtherStudios: { studioId: string; studioName: string }[];
}

type ScheduleMode = "single" | "recurring";
type EditScope = "this" | "thisAndFuture" | "all";

interface ClassFormData {
  classTypeId: string;
  coachProfileId: string;
  roomId: string;
  date: string;
  dateFrom: string;
  dateTo: string;
  days: number[];
  time: string;
  duration: number;
  tag: string;
  songRequestsEnabled: boolean;
  songRequestCriteria: string[];
}

const emptyForm: ClassFormData = {
  classTypeId: "",
  coachProfileId: "",
  roomId: "",
  date: "",
  dateFrom: "",
  dateTo: "",
  days: [],
  time: "",
  duration: 50,
  tag: "",
  songRequestsEnabled: false,
  songRequestCriteria: ["ALL"],
};

interface ClassFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingClass?: ClassWithDetails | null;
  defaultDate?: string;
  defaultTime?: string;
  /** Pre-scope the room picker to a specific studio. Rooms in other
   * studios are hidden entirely. */
  defaultStudioId?: string;
  onSaved?: () => void;
}

export function ClassFormDialog({
  open,
  onOpenChange,
  editingClass,
  defaultDate,
  defaultTime,
  defaultStudioId,
  onSaved,
}: ClassFormDialogProps) {
  const t = useTranslations("admin.classForm");
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);
  const [mode, setMode] = useState<ScheduleMode>("single");
  const [editScope, setEditScope] = useState<EditScope | null>(null);
  // When the admin picks a coach with a soft-warning status (didn't mark
  // themselves available, or is on time-off), we stage it here and prompt
  // for explicit confirmation before applying to formData.
  const [pendingCoach, setPendingCoach] = useState<PickerCoach | null>(null);

  const isEditingSeries = !!(editingClass?.recurringId);

  const [originalTime, setOriginalTime] = useState<string>("");
  const [originalDuration, setOriginalDuration] = useState<number>(0);

  const DAY_KEYS = ["dayMon", "dayTue", "dayWed", "dayThu", "dayFri", "daySat", "daySun"] as const;
  const DAY_FULL_KEYS = ["dayMonFull", "dayTueFull", "dayWedFull", "dayThuFull", "dayFriFull", "daySatFull", "daySunFull"] as const;

  const SONG_CRITERIA_OPTIONS = [
    { value: "ALL", labelKey: "songAll" as const },
    { value: "BIRTHDAY_WEEK", labelKey: "songBirthday" as const },
    { value: "ANNIVERSARY", labelKey: "songAnniversary" as const },
    { value: "FIRST_CLASS", labelKey: "songFirstClass" as const },
    { value: "CLASS_MILESTONE", labelKey: "songMilestone" as const },
  ];

  const { data: classTypes } = useQuery<ClassType[]>({
    queryKey: ["class-types"],
    queryFn: async () => {
      const res = await fetch("/api/class-types");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: coaches } = useQuery<CoachProfileWithUser[]>({
    queryKey: ["coaches-list"],
    queryFn: async () => {
      const res = await fetch("/api/coaches");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: studios } = useQuery<StudioWithRooms[]>({
    queryKey: ["studios-list"],
    queryFn: async () => {
      const res = await fetch("/api/studios");
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (!open) return;
    setEditScope(null);
    if (editingClass) {
      setMode("single");
      const start = new Date(editingClass.startsAt);
      const end = new Date(editingClass.endsAt);
      const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
      const tz = editingClass.room?.studio?.city?.timezone ?? FALLBACK_TZ;
      const initialTime = formatTime24InZone(start, tz);
      setOriginalTime(initialTime);
      setOriginalDuration(durationMin);
      setFormData({
        classTypeId: editingClass.classType.id,
        coachProfileId: editingClass.coach.id,
        roomId: editingClass.room?.id ?? "",
        date: formatDateInZone(start, tz),
        dateFrom: "",
        dateTo: "",
        days: [],
        time: initialTime,
        duration: durationMin,
        tag: editingClass.tag ?? "",
        songRequestsEnabled: editingClass.songRequestsEnabled ?? false,
        songRequestCriteria: editingClass.songRequestCriteria?.length
          ? editingClass.songRequestCriteria
          : ["ALL"],
      });
    } else {
      setMode("single");
      setFormData({
        ...emptyForm,
        date: defaultDate ?? "",
        time: defaultTime ?? "",
      });
    }
  }, [open, editingClass, defaultDate, defaultTime]);

  const availableRooms = studios?.flatMap((s) =>
    // Honour the schedule's studio scoping (if any): the picker shouldn't
    // surface rooms from other studios when the admin is clearly working
    // in one specific studio's calendar.
    defaultStudioId && s.id !== defaultStudioId
      ? []
      : s.rooms
          .filter((r) => !formData.classTypeId || r.classTypes.some((ct) => ct.id === formData.classTypeId))
          .map((r) => ({ ...r, studioName: s.name, studioTimezone: s.city?.timezone ?? null })),
  ) ?? [];

  // Auto-pick the room when there's only one valid option for the current
  // class type. Saves the admin a redundant click in single-room tenants
  // and after a class-type change that narrows the room list to one.
  useEffect(() => {
    if (!open) return;
    if (availableRooms.length !== 1) return;
    const only = availableRooms[0];
    if (formData.roomId === only.id) return;
    setFormData((f) => ({ ...f, roomId: only.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, availableRooms.length, availableRooms[0]?.id, formData.classTypeId]);

  /** Resolve the IANA timezone for the currently selected room. Falls back to
   * the editing class's studio tz or Europe/Madrid. Class times must always be
   * anchored to the studio's timezone, never the admin's browser tz. */
  function resolveStudioTimezone(): string {
    if (formData.roomId) {
      const room = availableRooms.find((r) => r.id === formData.roomId);
      if (room?.studioTimezone) return room.studioTimezone;
    }
    return editingClass?.room?.studio?.city?.timezone ?? FALLBACK_TZ;
  }

  // Picker context — declared AFTER availableRooms + resolveStudioTimezone
  // because the useMemo callback runs synchronously during render and would
  // hit a TDZ on `availableRooms` if placed earlier.
  const pickerStartsAt = useMemo(() => {
    if (!formData.date || !formData.time) return null;
    const tz = resolveStudioTimezone();
    const [y, m, d] = formData.date.split("-").map(Number);
    const [hh, mm] = formData.time.split(":").map(Number);
    try {
      return zonedWallTimeToUtc(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, tz).toISOString();
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.date, formData.time, formData.roomId, editingClass?.id]);

  const { data: pickerData } = useQuery<{
    coaches: PickerCoach[];
    studioResolved: boolean;
  }>({
    queryKey: [
      "coach-picker",
      pickerStartsAt,
      formData.duration,
      formData.roomId,
      editingClass?.id ?? null,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startsAt: pickerStartsAt!,
        duration: String(formData.duration),
      });
      if (formData.roomId) params.set("roomId", formData.roomId);
      if (editingClass?.id) params.set("excludeClassId", editingClass.id);
      const res = await fetch(`/api/admin/coaches/picker?${params.toString()}`);
      if (!res.ok) return { coaches: [], studioResolved: false };
      return res.json();
    },
    enabled: Boolean(pickerStartsAt && formData.duration > 0),
  });

  const { data: classTypePickerData } = useQuery<{
    classTypes: PickerClassType[];
    studioResolved: boolean;
  }>({
    queryKey: [
      "class-type-picker",
      pickerStartsAt,
      formData.duration,
      formData.roomId,
      editingClass?.id ?? null,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        startsAt: pickerStartsAt!,
        duration: String(formData.duration),
      });
      if (formData.roomId) params.set("roomId", formData.roomId);
      if (editingClass?.id) params.set("excludeClassId", editingClass.id);
      const res = await fetch(`/api/admin/class-types/picker?${params.toString()}`);
      if (!res.ok) return { classTypes: [], studioResolved: false };
      return res.json();
    },
    enabled: Boolean(pickerStartsAt && formData.duration > 0),
  });

  // Bulk-edit safety check: when editing a series with scope != "this", we
  // need to know whether time/duration can be modified (no live reservations
  // on any affected class). The server re-validates on save.
  const isBulkScope = editScope === "thisAndFuture" || editScope === "all";
  const { data: editCheck, isFetching: isCheckingBulk } = useQuery<{
    affectedClasses: number;
    bookings: number;
    waitlist: number;
    platformBookings: number;
    canEditTime: boolean;
  }>({
    queryKey: [
      "series-edit-check",
      editingClass?.recurringId ?? null,
      editScope,
      editingClass?.id ?? null,
    ],
    queryFn: async () => {
      const recId = editingClass!.recurringId!;
      const scopeParam = editScope === "all"
        ? "scope=all"
        : `scope=from&fromId=${editingClass!.id}`;
      const res = await fetch(`/api/classes/series/${recId}/edit-check?${scopeParam}`);
      if (!res.ok) throw new Error("Failed to check");
      return res.json();
    },
    enabled: Boolean(editingClass?.recurringId && isBulkScope),
  });

  const timeChangedInBulk = isBulkScope && (
    formData.time !== originalTime || formData.duration !== originalDuration
  );

  // When scope flips to bulk (or to "this"), drop any uncommitted time edits
  // that came from a different scope so what the admin sees matches what
  // we'll send. The original time/duration come from the editingClass.
  useEffect(() => {
    if (!editingClass || !isEditingSeries) return;
    setFormData((f) => ({ ...f, time: originalTime, duration: originalDuration }));
  }, [editScope, editingClass, isEditingSeries, originalTime, originalDuration]);

  // Preview class count for recurring mode
  const previewCount = useMemo(() => {
    if (mode !== "recurring" || !formData.dateFrom || !formData.dateTo || formData.days.length === 0) return 0;

    const dateFnsDayMap: Record<number, number> = { 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 0 };
    const startDate = startOfDay(new Date(formData.dateFrom));
    const endDate = startOfDay(new Date(formData.dateTo));

    if (isAfter(startDate, endDate)) return 0;

    let count = 0;
    for (const dayIndex of formData.days) {
      const dateFnsDay = dateFnsDayMap[dayIndex];
      if (dateFnsDay === undefined) continue;
      let current = setDay(startDate, dateFnsDay, { weekStartsOn: 1 });
      if (isBefore(current, startDate)) current = addWeeks(current, 1);
      while (!isAfter(current, endDate)) {
        count++;
        current = addWeeks(current, 1);
      }
    }
    return count;
  }, [mode, formData.dateFrom, formData.dateTo, formData.days]);

  // Check if date range exceeds 8 weeks
  const rangeExceeds8Weeks = useMemo(() => {
    if (!formData.dateFrom || !formData.dateTo) return false;
    const diff = new Date(formData.dateTo).getTime() - new Date(formData.dateFrom).getTime();
    return diff > 56 * 24 * 60 * 60 * 1000;
  }, [formData.dateFrom, formData.dateTo]);

  // --- Mutations ---

  const saveSingleMutation = useMutation({
    mutationFn: async () => {
      const tz = resolveStudioTimezone();
      const [y, m, d] = formData.date.split("-").map(Number);
      const [hh, mm] = formData.time.split(":").map(Number);
      const startsAt = zonedWallTimeToUtc(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, tz);
      const endsAt = addMinutes(startsAt, formData.duration);
      const payload = {
        classTypeId: formData.classTypeId,
        coachId: formData.coachProfileId,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        roomId: formData.roomId,
        tag: formData.tag || null,
        songRequestsEnabled: formData.songRequestsEnabled,
        songRequestCriteria: formData.songRequestsEnabled ? formData.songRequestCriteria : [],
      };
      const url = editingClass ? `/api/classes/${editingClass.id}` : "/api/classes";
      const method = editingClass ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: () => {
      invalidateAndClose();
      toast.success(editingClass ? t("classUpdated") : t("classCreated"));
    },
    onError: (err: Error) => toast.error(err.message || t("saveError")),
  });

  const saveBulkMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        classTypeId: formData.classTypeId,
        coachId: formData.coachProfileId,
        roomId: formData.roomId,
        time: formData.time,
        duration: formData.duration,
        days: formData.days,
        dateFrom: formData.dateFrom,
        dateTo: formData.dateTo,
        tag: formData.tag || null,
        songRequestsEnabled: formData.songRequestsEnabled,
        songRequestCriteria: formData.songRequestsEnabled ? formData.songRequestCriteria : [],
      };
      const res = await fetch("/api/classes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAndClose();
      toast.success(t("nClassesCreated", { count: data.count }));
    },
    onError: (err: Error) => toast.error(err.message || t("seriesError")),
  });

  const saveSeriesMutation = useMutation({
    mutationFn: async (scope: EditScope) => {
      if (!editingClass?.recurringId) throw new Error("No series");
      const payload: Record<string, unknown> = {
        coachId: formData.coachProfileId,
        roomId: formData.roomId,
        classTypeId: formData.classTypeId,
        tag: formData.tag || null,
        songRequestsEnabled: formData.songRequestsEnabled,
        songRequestCriteria: formData.songRequestsEnabled ? formData.songRequestCriteria : [],
      };
      // Only send time/duration when the admin actually changed them — avoids
      // a no-op booking check that would block updates to other fields.
      if (timeChangedInBulk) {
        payload.time = formData.time;
        payload.duration = formData.duration;
      }
      const scopeParam = scope === "all" ? "scope=all" : `scope=from&fromId=${editingClass.id}`;
      const res = await fetch(`/api/classes/series/${editingClass.recurringId}?${scopeParam}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 409 && Array.isArray(err.conflicts)) {
          throw new Error(t("bulkConflictError", { count: err.conflicts.length }));
        }
        if (res.status === 409 && err.error === "Series has live reservations") {
          throw new Error(t("bulkLiveReservationsError"));
        }
        throw new Error(err.error || "Failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      invalidateAndClose();
      toast.success(t("seriesUpdated", { count: data.count }));
    },
    onError: (err: Error) => toast.error(err.message || t("saveError")),
  });

  function invalidateAndClose() {
    queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
    queryClient.invalidateQueries({ queryKey: ["admin-schedule"] });
    queryClient.invalidateQueries({ queryKey: ["classes"] });
    onOpenChange(false);
    onSaved?.();
  }

  const isPending = saveSingleMutation.isPending || saveBulkMutation.isPending || saveSeriesMutation.isPending;

  const isFormValid = useMemo(() => {
    const base = formData.classTypeId && formData.coachProfileId && formData.roomId && formData.time;
    if (mode === "single") return base && formData.date;
    return base && formData.dateFrom && formData.dateTo && formData.days.length > 0 && !rangeExceeds8Weeks;
  }, [formData, mode, rangeExceeds8Weeks]);

  function handleSave() {
    if (editingClass && isEditingSeries && editScope && editScope !== "this") {
      saveSeriesMutation.mutate(editScope);
    } else if (mode === "single") {
      saveSingleMutation.mutate();
    } else {
      saveBulkMutation.mutate();
    }
  }

  function toggleDay(dayIndex: number) {
    setFormData((prev) => ({
      ...prev,
      days: prev.days.includes(dayIndex)
        ? prev.days.filter((d) => d !== dayIndex)
        : [...prev.days, dayIndex].sort(),
    }));
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingClass ? t("editClass") : t("scheduleClasses")}</DialogTitle>
          <DialogDescription>
            {editingClass ? t("editClassDesc") : t("scheduleDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Edit scope selector — only for editing a class in a series */}
          {editingClass && isEditingSeries && (
            <div className="rounded-lg border border-border/50 bg-surface/30 p-3 space-y-2">
              <p className="text-xs font-medium text-muted">{t("editScope")}</p>
              <div className="flex flex-col gap-1.5">
                {(["this", "thisAndFuture", "all"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setEditScope(scope)}
                    className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-all ${
                      editScope === scope
                        ? "bg-admin text-white"
                        : "bg-card text-foreground hover:bg-surface"
                    }`}
                  >
                    {scope === "this" ? t("editOnlyThis") : scope === "thisAndFuture" ? t("editThisAndFuture") : t("editAllSeries")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mode selector - only for create */}
          {!editingClass && (
            <div className="flex gap-1 rounded-xl bg-surface p-1">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all ${
                  mode === "single"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {t("singleClass")}
              </button>
              <button
                type="button"
                onClick={() => setMode("recurring")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all ${
                  mode === "recurring"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                {t("recurringSeries")}
              </button>
            </div>
          )}

          {/* Class type + Coach */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">{t("classType")}</label>
              <Select
                value={formData.classTypeId}
                onValueChange={(v) => setFormData({ ...formData, classTypeId: v, roomId: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("select")} />
                </SelectTrigger>
                <SelectContent>
                  {classTypePickerData?.classTypes?.length
                    ? classTypePickerData.classTypes.map((ct) => (
                        <ClassTypePickerItem key={ct.id} classType={ct} />
                      ))
                    : classTypes?.map((ct) => (
                        <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">{t("coach")}</label>
              <Select
                value={formData.coachProfileId}
                onValueChange={(v) => {
                  const picked = pickerData?.coaches.find((c) => c.id === v);
                  // Soft-warning statuses require explicit confirmation —
                  // they didn't mark themselves available, so we want the
                  // admin to acknowledge they have context to override.
                  if (
                    picked &&
                    (picked.status === "no_availability" || picked.status === "time_off")
                  ) {
                    setPendingCoach(picked);
                  } else {
                    setFormData({ ...formData, coachProfileId: v });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("select")} />
                </SelectTrigger>
                <SelectContent>
                  {pickerData?.coaches?.length
                    ? pickerData.coaches.map((c) => (
                        <CoachPickerItem key={c.id} coach={c} />
                      ))
                    : coaches?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Room */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">{t("room")}</label>
            <Select
              value={formData.roomId}
              onValueChange={(v) => setFormData({ ...formData, roomId: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectRoom")} />
              </SelectTrigger>
              <SelectContent>
                {availableRooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.studioName} — {r.name} ({r.maxCapacity} {t("spots")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bulk edit (thisAndFuture/all): only time + duration are editable,
              and only when no live reservations exist on affected classes. */}
          {editingClass && isEditingSeries && isBulkScope && (
            isCheckingBulk || !editCheck ? (
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface/30 px-3 py-2 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("bulkChecking")}
              </div>
            ) : editCheck.canEditTime ? (
              <>
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                  {t("bulkSafe", { count: editCheck.affectedClasses })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">{t("time")}</label>
                    <Input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      className="text-sm pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">{t("durationMin")}</label>
                    <Input
                      type="number"
                      min={15}
                      max={120}
                      step={5}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 50 })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                  {t("bulkBlockedTitle")}
                </p>
                <p className="text-xs text-amber-700/90 dark:text-amber-300/90">
                  {t("bulkBlockedBody", { affected: editCheck.affectedClasses })}
                </p>
                <p className="text-[11px] text-amber-700/70 dark:text-amber-300/70">
                  {[
                    editCheck.bookings > 0 && t("bulkBlockedBookings", { count: editCheck.bookings }),
                    editCheck.waitlist > 0 && t("bulkBlockedWaitlist", { count: editCheck.waitlist }),
                    editCheck.platformBookings > 0 && t("bulkBlockedPlatform", { count: editCheck.platformBookings }),
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>
            )
          )}

          {/* Single-class schedule section (create, or scope=this on series) */}
          {(!editingClass || !isEditingSeries || editScope === "this") && (
            mode === "single" ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">{t("date")}</label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="text-sm pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">{t("time")}</label>
                  <Input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    className="text-sm pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">{t("durationMin")}</label>
                  <Input
                    type="number"
                    min={15}
                    max={120}
                    step={5}
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 50 })}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Day-of-week selector */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">{t("weekDays")}</label>
                  <div className="flex gap-1.5">
                    {DAY_KEYS.map((key, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleDay(i)}
                        title={t(DAY_FULL_KEYS[i])}
                        className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                          formData.days.includes(i)
                            ? "bg-admin text-white shadow-sm"
                            : "bg-surface text-muted hover:bg-surface/80 hover:text-foreground"
                        }`}
                      >
                        {t(key)}
                      </button>
                    ))}
                  </div>
                  {formData.days.length > 0 && (
                    <p className="mt-1 text-[11px] text-muted">
                      {formData.days.map((d) => t(DAY_FULL_KEYS[d])).join(", ")}
                    </p>
                  )}
                </div>

                {/* Date range */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">{t("from")}</label>
                    <Input
                      type="date"
                      value={formData.dateFrom}
                      onChange={(e) => setFormData({ ...formData, dateFrom: e.target.value })}
                      className="text-sm pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">{t("to")}</label>
                    <Input
                      type="date"
                      value={formData.dateTo}
                      onChange={(e) => setFormData({ ...formData, dateTo: e.target.value })}
                      className="text-sm pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                    />
                  </div>
                </div>

                {/* 8-week warning */}
                {rangeExceeds8Weeks && (
                  <p className="text-xs font-medium text-destructive">{t("maxWeeksWarning")}</p>
                )}

                {/* Time + Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">{t("time")}</label>
                    <Input
                      type="time"
                      value={formData.time}
                      onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                      className="text-sm pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">{t("durationMin")}</label>
                    <Input
                      type="number"
                      min={15}
                      max={120}
                      step={5}
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: parseInt(e.target.value) || 50 })}
                    />
                  </div>
                </div>

                {/* Preview */}
                {previewCount > 0 && !rangeExceeds8Weeks && (
                  <div className="flex items-center gap-2 rounded-lg bg-admin/5 px-3 py-2">
                    <CalendarRange className="h-4 w-4 text-admin" />
                    <span className="text-sm font-medium text-admin">
                      {t("willCreate", { count: previewCount })}
                    </span>
                  </div>
                )}
              </div>
            )
          )}

          {/* Tag */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              {t("specialTag")} <span className="font-normal">({t("optional")})</span>
            </label>
            <Input
              placeholder={t("tagPlaceholder")}
              value={formData.tag}
              onChange={(e) => setFormData({ ...formData, tag: e.target.value })}
            />
          </div>

          {/* Song requests */}
          <div className="space-y-3 rounded-md border border-border/50 bg-surface/20 p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="songRequestsEnabled"
                checked={formData.songRequestsEnabled}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, songRequestsEnabled: checked === true })
                }
              />
              <Music className="h-3.5 w-3.5 text-muted" />
              <Label htmlFor="songRequestsEnabled" className="text-sm font-normal">
                {t("songRequests")}
              </Label>
            </div>
            {formData.songRequestsEnabled && (
              <div className="space-y-2 pl-6">
                <p className="text-xs text-muted">{t("whoCanSuggest")}</p>
                {SONG_CRITERIA_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`songCriteria-${opt.value}`}
                      checked={formData.songRequestCriteria.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        const current = new Set(formData.songRequestCriteria);
                        if (opt.value === "ALL") {
                          setFormData({ ...formData, songRequestCriteria: checked === true ? ["ALL"] : [] });
                        } else {
                          current.delete("ALL");
                          if (checked === true) current.add(opt.value);
                          else current.delete(opt.value);
                          setFormData({ ...formData, songRequestCriteria: Array.from(current) });
                        }
                      }}
                    />
                    <Label htmlFor={`songCriteria-${opt.value}`} className="text-[13px] font-normal text-foreground">
                      {t(opt.labelKey)}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(saveSingleMutation.isError || saveBulkMutation.isError || saveSeriesMutation.isError) && (
            <p className="text-sm text-destructive">
              {saveSingleMutation.error?.message || saveBulkMutation.error?.message || saveSeriesMutation.error?.message || t("saveError")}
            </p>
          )}

          <Separator />

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending || !isFormValid || !!(editingClass && isEditingSeries && !editScope)}
              className="gap-2 bg-admin hover:bg-admin/90"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingClass
                ? t("saveChanges")
                : mode === "single"
                  ? t("createClass")
                  : t("createNClasses", { count: previewCount || "" })}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

    {/* Confirmation dialog for soft-warning coach selection */}
    <Dialog
      open={!!pendingCoach}
      onOpenChange={(o) => !o && setPendingCoach(null)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar asignación</DialogTitle>
          <DialogDescription>
            {pendingCoach && pendingCoach.status === "time_off" && (
              <>
                <strong>{pendingCoach.name}</strong> marcó este día como ausente. ¿Confirmar que la asignas de todas formas?
              </>
            )}
            {pendingCoach && pendingCoach.status === "no_availability" && (
              <>
                <strong>{pendingCoach.name}</strong> no marcó este horario como disponible. ¿Confirmar que la asignas de todas formas?
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setPendingCoach(null)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (pendingCoach) {
                setFormData({ ...formData, coachProfileId: pendingCoach.id });
              }
              setPendingCoach(null);
            }}
          >
            Sí, asignar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ── Coach picker item ─────────────────────────────────────────────────
// Renders one row in the instructor dropdown, enriched with availability
// status (pill on the right) and workload/adjacency context (subline).
// Unavailable statuses (time_off, conflict, no availability set) come
// back from the API sorted to the bottom and disable selection here.

function CoachPickerItem({ coach: c }: { coach: PickerCoach }) {
  // Only hard conflicts (already teaching another class at the same time)
  // are physically impossible. Everything else is a soft warning — the
  // admin may have context outside the system to override (e.g. the
  // coach already agreed to cover).
  const disabled = c.status === "conflict";

  const pill = (() => {
    switch (c.status) {
      case "preferred":
        return null;
      case "ok_if_needed":
        return { label: "De respaldo", tone: "amber" as const };
      case "available_unconfigured":
        return { label: "Sin configurar", tone: "neutral" as const };
      case "no_availability":
        return { label: "No marcó disponible", tone: "muted" as const };
      case "time_off":
        return { label: "Ausente", tone: "rose" as const };
      case "conflict":
        return { label: "Tiene clase", tone: "rose" as const };
      default:
        return null;
    }
  })();

  const toneClass: Record<"amber" | "rose" | "neutral" | "muted", string> = {
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    neutral: "bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-300",
    muted: "bg-stone-100 text-stone-500 dark:bg-stone-500/15 dark:text-stone-400",
  };

  const subParts: string[] = [];
  if (c.status === "conflict" && c.conflictClass) {
    subParts.push(
      `Conflicto: ${c.conflictClass.name} ${new Date(c.conflictClass.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    );
  }
  if (c.priorClass) {
    subParts.push(
      `← ${c.priorClass.name} hace ${c.priorClass.gapMinutes} min`,
    );
  }
  if (c.followingClass) {
    subParts.push(
      `${c.followingClass.name} en ${c.followingClass.gapMinutes} min →`,
    );
  }
  if (c.classesThisDay > 0) {
    subParts.push(`${c.classesThisDay} hoy`);
  }
  if (c.classesThisWeek > 0) {
    subParts.push(`${c.classesThisWeek} esta semana`);
  }

  return (
    <SelectItem value={c.id} disabled={disabled}>
      <div className="flex w-full items-center justify-between gap-2 pr-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{c.name}</span>
          {subParts.length > 0 && (
            <span className="text-muted-foreground truncate text-[11px]">
              {subParts.join(" · ")}
            </span>
          )}
        </div>
        {pill && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${toneClass[pill.tone]}`}
          >
            {pill.label}
          </span>
        )}
      </div>
    </SelectItem>
  );
}

// ── Class type picker item ────────────────────────────────────────────
// Renders one row in the class type dropdown. Shows slot-aware context:
// how many of this type are already scheduled at the studio today and
// this week, and a warning pill when the same type is taught at another
// studio in parallel.

function ClassTypePickerItem({ classType: ct }: { classType: PickerClassType }) {
  const subParts: string[] = [];
  if (ct.dailyAtStudio != null && ct.dailyAtStudio > 0) {
    subParts.push(`${ct.dailyAtStudio} hoy`);
  }
  if (ct.weeklyAtStudio != null && ct.weeklyAtStudio > 0) {
    subParts.push(`${ct.weeklyAtStudio} esta semana`);
  }

  const parallelPill = ct.parallelAtOtherStudios.length
    ? `También en ${ct.parallelAtOtherStudios.map((p) => p.studioName).join(", ")}`
    : null;

  return (
    <SelectItem value={ct.id}>
      <div className="flex w-full items-center justify-between gap-2 pr-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{ct.name}</span>
          {subParts.length > 0 && (
            <span className="text-muted-foreground truncate text-[11px]">
              {subParts.join(" · ")}
            </span>
          )}
        </div>
        {parallelPill && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {parallelPill}
          </span>
        )}
      </div>
    </SelectItem>
  );
}
