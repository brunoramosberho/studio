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
  onSaved?: () => void;
}

export function ClassFormDialog({
  open,
  onOpenChange,
  editingClass,
  defaultDate,
  defaultTime,
  onSaved,
}: ClassFormDialogProps) {
  const t = useTranslations("admin.classForm");
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<ClassFormData>(emptyForm);
  const [mode, setMode] = useState<ScheduleMode>("single");
  const [editScope, setEditScope] = useState<EditScope | null>(null);

  const isEditingSeries = !!(editingClass?.recurringId);

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
      setFormData({
        classTypeId: editingClass.classType.id,
        coachProfileId: editingClass.coach.id,
        roomId: editingClass.room?.id ?? "",
        date: formatDateInZone(start, tz),
        dateFrom: "",
        dateTo: "",
        days: [],
        time: formatTime24InZone(start, tz),
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
    s.rooms
      .filter((r) => !formData.classTypeId || r.classTypes.some((ct) => ct.id === formData.classTypeId))
      .map((r) => ({ ...r, studioName: s.name, studioTimezone: s.city?.timezone ?? null })),
  ) ?? [];

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
      const payload = {
        coachId: formData.coachProfileId,
        roomId: formData.roomId,
        classTypeId: formData.classTypeId,
        tag: formData.tag || null,
        songRequestsEnabled: formData.songRequestsEnabled,
        songRequestCriteria: formData.songRequestsEnabled ? formData.songRequestCriteria : [],
      };
      const scopeParam = scope === "all" ? "scope=all" : `scope=from&fromId=${editingClass.id}`;
      const res = await fetch(`/api/classes/series/${editingClass.recurringId}?${scopeParam}`, {
        method: "PUT",
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
                  {classTypes?.map((ct) => (
                    <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">{t("coach")}</label>
              <Select
                value={formData.coachProfileId}
                onValueChange={(v) => setFormData({ ...formData, coachProfileId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("select")} />
                </SelectTrigger>
                <SelectContent>
                  {coaches?.map((c) => (
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

          {/* Schedule section — hidden for series edits (scope != this) since time changes need individual edits */}
          {(!editingClass || !isEditingSeries || editScope === "this") && (
            mode === "single" ? (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">{t("date")}</label>
                  <Input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">{t("time")}</label>
                  <Input
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
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
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted">{t("to")}</label>
                    <Input
                      type="date"
                      value={formData.dateTo}
                      onChange={(e) => setFormData({ ...formData, dateTo: e.target.value })}
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
  );
}
