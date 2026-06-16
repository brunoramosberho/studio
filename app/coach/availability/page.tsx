"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  CalendarOff,
  CalendarClock,
  Loader2,
  Sparkles,
} from "lucide-react";
import { format, isBefore, startOfDay } from "date-fns";
import { useLocale } from "next-intl";
import { cn, parseDateOnly } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/date-locale";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { TimeRangePicker, formatMinutes } from "./_components/time-range-picker";
import {
  StudioPreferenceChips,
  type StudioPrefValue,
} from "./_components/studio-preference-chips";
import {
  WeeklyGridEditor,
  type GridRange,
} from "./_components/weekly-grid-editor";
import {
  TimeOffCalendar,
  type CalendarBlock,
} from "./_components/time-off-calendar";

// ── Types matching /api/coaches/availability ──

interface StudioPref {
  studioId: string;
  preference: "preferred" | "ok_if_needed";
}

interface AvailabilityBlock {
  id: string;
  kind: "availability" | "time_off";
  type: "recurring" | "one_time";
  dayOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  endDate: string | null;
  isAllDay: boolean;
  reasonType: "vacation" | "personal" | "training" | "other" | null;
  reasonNote: string | null;
  status: "active" | "pending_approval" | "rejected";
  rejectionNote?: string | null;
  studioPreferences: StudioPref[];
}

interface Studio {
  id: string;
  name: string;
}

interface ApiResponse {
  blocks: AvailabilityBlock[];
  studios: Studio[];
  zoneRedDays: number;
  zoneYellowDays: number;
  studioOpenTime: string;
  studioCloseTime: string;
  operatingDays: number[];
}

const DAY_SHORT = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const DAY_LONG = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// i18n keys for each reasonType, used with t("coach.calendar.<key>")
const REASON_KEYS: Record<string, "reasonVacation" | "reasonPersonal" | "reasonTraining" | "reasonOther"> = {
  vacation: "reasonVacation",
  personal: "reasonPersonal",
  training: "reasonTraining",
  other: "reasonOther",
};

function parseHhmm(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// ── API helpers ──

async function fetchAvailability(): Promise<ApiResponse> {
  const res = await fetch("/api/coaches/availability");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function createBlock(data: Record<string, unknown>): Promise<AvailabilityBlock> {
  const res = await fetch("/api/coaches/availability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "No se pudo crear");
  }
  return res.json();
}

async function deleteBlock(id: string): Promise<void> {
  const res = await fetch(`/api/coaches/availability/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "No se pudo eliminar");
  }
}

async function replaceRecurring(payload: {
  ranges: { dayOfWeek: number; startTime: string; endTime: string }[];
  studioPreferences: { studioId: string; preference: "preferred" | "ok_if_needed" }[];
}): Promise<void> {
  const res = await fetch("/api/coaches/availability/recurring", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "No se pudo guardar");
  }
}

// ── Page ──

type TimeOffModalState =
  | { mode: "closed" }
  | {
      mode: "create";
      prefillStart?: string;
      prefillEnd?: string;
      prefillStartMin?: number;
      prefillEndMin?: number;
    }
  | { mode: "view"; block: AvailabilityBlock };

export default function CoachAvailabilityPage() {
  const t = useTranslations("coach.calendar");
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"recurring" | "timeoff">("recurring");
  const [timeOffModal, setTimeOffModal] = useState<TimeOffModalState>({ mode: "closed" });

  const { data, isLoading, error } = useQuery({
    queryKey: ["coach-availability"],
    queryFn: fetchAvailability,
  });

  const blocks = useMemo(() => data?.blocks ?? [], [data]);

  const initialRecurringRanges = useMemo<GridRange[]>(() => {
    const out: GridRange[] = [];
    for (const b of blocks) {
      if (b.kind !== "availability" || b.type !== "recurring") continue;
      if (b.status !== "active") continue;
      const sm = parseHhmm(b.startTime);
      const em = parseHhmm(b.endTime);
      if (sm == null || em == null) continue;
      for (const d of b.dayOfWeek) {
        out.push({ dayOfWeek: d, startMin: sm, endMin: em });
      }
    }
    return out;
  }, [blocks]);

  const initialStudioPrefs = useMemo<Record<string, StudioPrefValue>>(() => {
    // Take the prefs from the first availability block as the seed —
    // since the grid editor maintains a single set of prefs across all
    // ranges, we just need any reasonable starting point.
    const firstAvail = blocks.find(
      (b) => b.kind === "availability" && b.type === "recurring" && b.status === "active",
    );
    const obj: Record<string, StudioPrefValue> = {};
    for (const s of data?.studios ?? []) {
      const pref = firstAvail?.studioPreferences.find((p) => p.studioId === s.id);
      obj[s.id] = pref?.preference ?? "preferred";
    }
    return obj;
  }, [blocks, data]);

  const timeOffBlocks = useMemo(() => {
    return blocks
      .filter((b) => b.kind === "time_off")
      .filter((b) => b.status !== "rejected")
      .filter((b) => {
        if (b.type === "recurring") return true;
        if (!b.endDate) return false;
        return !isBefore(parseDateOnly(b.endDate)!, startOfDay(new Date()));
      })
      .sort((a, b) => {
        const ad = parseDateOnly(a.startDate)?.getTime() ?? Infinity;
        const bd = parseDateOnly(b.startDate)?.getTime() ?? Infinity;
        return ad - bd;
      });
  }, [blocks]);

  const deleteMut = useMutation({
    mutationFn: deleteBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-availability"] });
      toast.success(t("deletedToast"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createMut = useMutation({
    mutationFn: createBlock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-availability"] });
      setTimeOffModal({ mode: "closed" });
      toast.success(t("savedGeneric"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const replaceMut = useMutation({
    mutationFn: replaceRecurring,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coach-availability"] });
      toast.success(t("savedToast"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="text-destructive p-6 text-sm">
        {t("loadError")}
      </div>
    );
  }

  const { studios, studioOpenTime, studioCloseTime, operatingDays } = data;
  const minMin = parseHhmm(studioOpenTime) ?? 7 * 60;
  const maxMin = parseHhmm(studioCloseTime) ?? 21 * 60;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("pageSubtitle")}</p>
      </header>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "recurring" | "timeoff")}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="recurring" className="gap-1.5">
            <CalendarClock className="h-4 w-4" />
            {t("tabRecurring")}
          </TabsTrigger>
          <TabsTrigger value="timeoff" className="gap-1.5">
            <CalendarOff className="h-4 w-4" />
            {t("tabTimeOff")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recurring" className="mt-4 space-y-4">
          <RecurringGridTab
            // Key derived from the server snapshot: remounts the editor
            // (resetting its local draft state) whenever the source data
            // changes — i.e. after a successful save.
            key={`${JSON.stringify(initialRecurringRanges)}|${JSON.stringify(initialStudioPrefs)}`}
            studios={studios}
            operatingDays={operatingDays}
            minMin={minMin}
            maxMin={maxMin}
            studioOpenTime={studioOpenTime}
            studioCloseTime={studioCloseTime}
            initialRanges={initialRecurringRanges}
            initialPrefs={initialStudioPrefs}
            onSave={(payload) => replaceMut.mutate(payload)}
            isSaving={replaceMut.isPending}
          />
        </TabsContent>

        <TabsContent value="timeoff" className="mt-4 space-y-4">
          <TimeOffTab
            blocks={timeOffBlocks}
            studioOpenMin={minMin}
            studioCloseMin={maxMin}
            onAddForDate={(args) => {
              const startIso = format(args.startDate, "yyyy-MM-dd");
              const endIso = args.endDate
                ? format(args.endDate, "yyyy-MM-dd")
                : startIso;
              // If withHours is true we want the modal to default to a
              // time-range UI for that single day; pass sensible default
              // minutes that the modal will pick up.
              const withHoursDefaults = args.withHours
                ? { prefillStartMin: 9 * 60, prefillEndMin: 10 * 60 }
                : {};
              setTimeOffModal({
                mode: "create",
                prefillStart: startIso,
                prefillEnd: endIso,
                prefillStartMin: args.startMin ?? withHoursDefaults.prefillStartMin,
                prefillEndMin: args.endMin ?? withHoursDefaults.prefillEndMin,
              });
            }}
            onView={(block) => setTimeOffModal({ mode: "view", block })}
            onOpenAdd={() => setTimeOffModal({ mode: "create" })}
          />
        </TabsContent>
      </Tabs>

      <TimeOffModal
        state={timeOffModal}
        onClose={() => setTimeOffModal({ mode: "closed" })}
        onSubmit={(payload) => createMut.mutate(payload)}
        onDelete={(id) => {
          deleteMut.mutate(id);
          setTimeOffModal({ mode: "closed" });
        }}
        isPending={createMut.isPending}
        isDeleting={deleteMut.isPending}
      />
    </div>
  );
}

// ── Recurring tab: grid editor + studio prefs + save ──

interface RecurringGridTabProps {
  studios: Studio[];
  operatingDays: number[];
  minMin: number;
  maxMin: number;
  studioOpenTime: string;
  studioCloseTime: string;
  initialRanges: GridRange[];
  initialPrefs: Record<string, StudioPrefValue>;
  onSave: (payload: {
    ranges: { dayOfWeek: number; startTime: string; endTime: string }[];
    studioPreferences: { studioId: string; preference: "preferred" | "ok_if_needed" }[];
  }) => void;
  isSaving: boolean;
}

function RecurringGridTab(props: RecurringGridTabProps) {
  const t = useTranslations("coach.calendar");
  const {
    studios,
    operatingDays,
    minMin,
    maxMin,
    studioOpenTime,
    studioCloseTime,
    initialRanges,
    initialPrefs,
    onSave,
    isSaving,
  } = props;

  // Initial state from props once. To re-seed after a save round-trip
  // the parent remounts us via a snapshot-derived `key` prop, which is
  // the idiomatic React way to express "reset to this new snapshot".
  const initialRangesKey = JSON.stringify(initialRanges);
  const initialPrefsKey = JSON.stringify(initialPrefs);
  const [ranges, setRanges] = useState<GridRange[]>(initialRanges);
  const [prefs, setPrefs] = useState<Record<string, StudioPrefValue>>(initialPrefs);

  const dirty =
    JSON.stringify(ranges) !== initialRangesKey ||
    JSON.stringify(prefs) !== initialPrefsKey;

  const handleSave = useCallback(() => {
    const studioPreferences = studios
      .map((s) => ({ studioId: s.id, preference: prefs[s.id] ?? "preferred" }))
      .filter((p) => p.preference !== "unavailable") as {
        studioId: string;
        preference: "preferred" | "ok_if_needed";
      }[];
    if (ranges.length > 0 && studios.length > 0 && studioPreferences.length === 0) {
      toast.error(t("studiosTitle"));
      return;
    }
    onSave({
      ranges: ranges.map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startTime: formatMinutes(r.startMin),
        endTime: formatMinutes(r.endMin),
      })),
      studioPreferences,
    });
  }, [ranges, prefs, studios, onSave, t]);

  // Summary numbers
  const totalMinutes = ranges.reduce((s, r) => s + (r.endMin - r.startMin), 0);
  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;
  const daysCovered = new Set(ranges.map((r) => r.dayOfWeek)).size;

  return (
    <div className="space-y-4">
      {ranges.length === 0 && initialRanges.length === 0 && (
        <div className="border-primary/30 bg-primary/5 rounded-xl border border-dashed p-5 text-sm">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4" />
            {t("recurringEmptyTitle")}
          </div>
          <p className="text-muted-foreground">
            {t.rich("recurringEmptyDesc", {
              open: studioOpenTime,
              close: studioCloseTime,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("yourWeekTitle")}</h3>
          <span className="text-muted-foreground text-xs tabular-nums">
            {studioOpenTime} – {studioCloseTime}
          </span>
        </div>
        <WeeklyGridEditor
          minMin={minMin}
          maxMin={maxMin}
          operatingDays={operatingDays}
          initialRanges={initialRanges}
          onChange={setRanges}
          disabled={isSaving}
        />
        {ranges.length > 0 && (
          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
            <span>{t("daysCount", { count: daysCovered })}</span>
            <span>·</span>
            <span>{t("hoursPerWeek", { h: totalH, m: totalM })}</span>
          </div>
        )}
      </div>

      {studios.length > 1 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-1 text-sm font-semibold">{t("studiosTitle")}</h3>
          <p className="text-muted-foreground mb-3 text-xs">
            {t("studiosDesc")}
          </p>
          <StudioPreferenceChips
            studios={studios}
            value={prefs}
            onChange={setPrefs}
            disabled={isSaving}
          />
        </div>
      )}

      {ranges.length > 0 && (
        <RecurringSummary ranges={ranges} studios={studios} prefs={prefs} />
      )}

      <div className="bg-background sticky bottom-4 z-10 flex justify-end">
        <Button
          onClick={handleSave}
          disabled={!dirty || isSaving}
          className="shadow-lg"
        >
          {isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          {dirty ? t("saveChanges") : t("noChanges")}
        </Button>
      </div>
    </div>
  );
}

// ── Read-only summary (grouped by day, derived from grid) ──

function RecurringSummary({
  ranges,
  studios,
  prefs,
}: {
  ranges: GridRange[];
  studios: Studio[];
  prefs: Record<string, StudioPrefValue>;
}) {
  const t = useTranslations("coach.calendar");
  const byDay = useMemo(() => {
    const map = new Map<number, GridRange[]>();
    for (const r of ranges) {
      const arr = map.get(r.dayOfWeek) ?? [];
      arr.push(r);
      map.set(r.dayOfWeek, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startMin - b.startMin);
    }
    return map;
  }, [ranges]);

  return (
    <details className="rounded-xl border bg-card p-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium uppercase tracking-wide transition-colors">
        {t("viewByDay")}
      </summary>
      <ul className="mt-3 space-y-2">
        {Array.from(byDay.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([day, dayRanges]) => (
            <li key={day} className="flex items-start gap-3 text-sm">
              <span className="w-20 shrink-0 font-medium">{DAY_LONG[day]}</span>
              <div className="flex-1 space-y-1">
                {dayRanges.map((r, i) => (
                  <div key={i} className="tabular-nums">
                    {formatMinutes(r.startMin)} – {formatMinutes(r.endMin)}
                  </div>
                ))}
                {studios.length > 1 && (
                  <div className="text-muted-foreground flex flex-wrap gap-1.5 text-xs">
                    {studios.map((s) => {
                      const v = prefs[s.id] ?? "preferred";
                      if (v === "unavailable") return null;
                      return (
                        <span
                          key={s.id}
                          className={cn(
                            "rounded-full px-2 py-0.5",
                            v === "preferred"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
                          )}
                        >
                          {s.name}
                          {v === "ok_if_needed" && ` · ${t("prefIfUrgent")}`}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          ))}
      </ul>
    </details>
  );
}

// ── Time-off tab ──

interface TimeOffTabProps {
  blocks: AvailabilityBlock[];
  studioOpenMin: number;
  studioCloseMin: number;
  onAddForDate: (args: {
    startDate: Date;
    endDate?: Date;
    startMin?: number;
    endMin?: number;
    withHours?: boolean;
  }) => void;
  onView: (block: AvailabilityBlock) => void;
  onOpenAdd: () => void;
}

function TimeOffTab({
  blocks,
  studioOpenMin,
  studioCloseMin,
  onAddForDate,
  onView,
  onOpenAdd,
}: TimeOffTabProps) {
  const t = useTranslations("coach.calendar");
  const dfLocale = getDateFnsLocale(useLocale());
  // Calendar only accepts one_time blocks with date ranges.
  const calendarBlocks: CalendarBlock[] = useMemo(
    () =>
      blocks
        .filter((b) => b.type === "one_time" && b.startDate && b.endDate)
        .map((b) => ({
          id: b.id,
          startDate: b.startDate!,
          endDate: b.endDate!,
          isAllDay: b.isAllDay,
          startTime: b.startTime,
          endTime: b.endTime,
          reasonType: b.reasonType,
          reasonNote: b.reasonNote,
          status: b.status as "active" | "pending_approval" | "rejected",
        })),
    [blocks],
  );
  const blockById = useMemo(() => {
    const map = new Map<string, AvailabilityBlock>();
    for (const b of blocks) map.set(b.id, b);
    return map;
  }, [blocks]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="font-semibold">{t("timeOffSectionTitle")}</h3>
            <p className="text-muted-foreground text-xs">{t("timeOffSectionDesc")}</p>
          </div>
          <Button size="sm" onClick={onOpenAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t("addRange")}
          </Button>
        </div>
      </div>

      <TimeOffCalendar
        blocks={calendarBlocks}
        studioOpenMin={studioOpenMin}
        studioCloseMin={studioCloseMin}
        onAddForDate={onAddForDate}
        onEditBlock={(cb) => {
          const full = blockById.get(cb.id);
          if (full) onView(full);
        }}
      />

      {blocks.length > 0 && (
        <details className="rounded-xl border bg-card p-4 [&_summary::-webkit-details-marker]:hidden">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium uppercase tracking-wide transition-colors">
            {t("viewListCount", { count: blocks.length })}
          </summary>
          <ul className="mt-3 space-y-2">
            {blocks.map((b) => (
              <li
                key={b.id}
                className={cn(
                  "flex items-start justify-between gap-3 rounded-lg border p-3",
                  b.status === "pending_approval" &&
                    "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5",
                )}
              >
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() => onView(b)}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">
                      {b.type === "one_time" ? (
                        <>
                          {b.startDate && format(parseDateOnly(b.startDate)!, "EEE d MMM", { locale: dfLocale })}
                          {b.endDate &&
                            b.startDate !== b.endDate &&
                            ` – ${format(parseDateOnly(b.endDate)!, "EEE d MMM", { locale: dfLocale })}`}
                        </>
                      ) : (
                        <>Recurrente: {b.dayOfWeek.map((d) => DAY_SHORT[d]).join(", ")}</>
                      )}
                    </span>
                    {b.status === "pending_approval" && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300"
                      >
                        {t("badgeInReview")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground mt-0.5 space-y-0.5 text-xs">
                    {b.isAllDay ? (
                      <span>{t("modalViewAllDay")}</span>
                    ) : (
                      b.startTime && b.endTime && (
                        <span className="tabular-nums">
                          {b.startTime} – {b.endTime}
                        </span>
                      )
                    )}
                    {b.reasonType && <span> · {t(REASON_KEYS[b.reasonType])}</span>}
                    {b.reasonNote && <p className="mt-1">{b.reasonNote}</p>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ── Time-off modal (create + view) ──

interface TimeOffModalProps {
  state: TimeOffModalState;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isDeleting: boolean;
}

function TimeOffModal({ state, onClose, onSubmit, onDelete, isPending, isDeleting }: TimeOffModalProps) {
  if (state.mode === "view") {
    return <ViewTimeOffModal block={state.block} onClose={onClose} onDelete={onDelete} isDeleting={isDeleting} />;
  }
  if (state.mode !== "create") {
    return null;
  }
  // Key remounts the create modal on every new "open" so prefill values
  // initialize cleanly via useState rather than fighting an effect.
  const k = `${state.prefillStart ?? ""}|${state.prefillEnd ?? ""}|${state.prefillStartMin ?? ""}|${state.prefillEndMin ?? ""}`;
  return (
    <CreateTimeOffModal
      key={k}
      open
      prefillStart={state.prefillStart}
      prefillEnd={state.prefillEnd}
      prefillStartMin={state.prefillStartMin}
      prefillEndMin={state.prefillEndMin}
      onClose={onClose}
      onSubmit={onSubmit}
      isPending={isPending}
    />
  );
}

function CreateTimeOffModal({
  open,
  prefillStart,
  prefillEnd,
  prefillStartMin,
  prefillEndMin,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  prefillStart?: string;
  prefillEnd?: string;
  prefillStartMin?: number;
  prefillEndMin?: number;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const t = useTranslations("coach.calendar");
  const today = format(new Date(), "yyyy-MM-dd");
  const initialStart = prefillStart ?? today;
  const initialEnd = prefillEnd ?? prefillStart ?? today;
  const hasTimePrefill = prefillStartMin != null && prefillEndMin != null;
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);
  const [isAllDay, setIsAllDay] = useState(!hasTimePrefill);
  const [startMin, setStartMin] = useState(prefillStartMin ?? 9 * 60);
  const [endMin, setEndMin] = useState(prefillEndMin ?? 10 * 60);
  const [reasonType, setReasonType] = useState<"vacation" | "personal" | "training" | "other">(
    hasTimePrefill ? "personal" : "vacation",
  );
  const [reasonNote, setReasonNote] = useState("");

  const handleSubmit = useCallback(() => {
    const payload: Record<string, unknown> = {
      kind: "time_off",
      type: "one_time",
      startDate,
      endDate,
      isAllDay,
      reasonType,
      reasonNote: reasonNote.trim() || null,
    };
    if (!isAllDay) {
      payload.startTime = formatMinutes(startMin);
      payload.endTime = formatMinutes(endMin);
    }
    onSubmit(payload);
  }, [startDate, endDate, isAllDay, startMin, endMin, reasonType, reasonNote, onSubmit]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modalCreateTitle")}</DialogTitle>
          <DialogDescription>{t("modalCreateDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="start-date">{t("modalDateFrom")}</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
              />
            </div>
            <div>
              <Label htmlFor="end-date">{t("modalDateTo")}</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="all-day" className="text-sm font-medium">
                {t("modalAllDay")}
              </Label>
              <p className="text-muted-foreground text-xs">
                {t("modalAllDayHint")}
              </p>
            </div>
            <Switch id="all-day" checked={isAllDay} onCheckedChange={setIsAllDay} />
          </div>

          {!isAllDay && (
            <div>
              <Label className="text-xs">{t("modalHours")}</Label>
              <div className="mt-1">
                <TimeRangePicker
                  startMin={startMin}
                  endMin={endMin}
                  minMin={0}
                  maxMin={24 * 60}
                  onChange={({ startMin, endMin }) => {
                    setStartMin(startMin);
                    setEndMin(endMin);
                  }}
                  disabled={isPending}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">{t("modalReason")}</Label>
            <Select
              value={reasonType}
              onValueChange={(v) => setReasonType(v as typeof reasonType)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vacation">{t("reasonVacation")}</SelectItem>
                <SelectItem value="personal">{t("reasonPersonal")}</SelectItem>
                <SelectItem value="other">{t("reasonOther")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="note" className="text-xs">
              {t("modalNote")}
            </Label>
            <Input
              id="note"
              value={reasonNote}
              onChange={(e) => setReasonNote(e.target.value)}
              placeholder={t("modalNotePlaceholder")}
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            {t("modalCancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {t("modalSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewTimeOffModal({
  block,
  onClose,
  onDelete,
  isDeleting,
}: {
  block: AvailabilityBlock;
  onClose: () => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}) {
  const t = useTranslations("coach.calendar");
  const dfLocale = getDateFnsLocale(useLocale());
  const sameDay =
    block.startDate && block.endDate && block.startDate === block.endDate;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modalViewTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">{t("modalViewDates")}</Label>
            <p className="font-medium">
              {block.startDate &&
                format(parseDateOnly(block.startDate)!, "PPPP", { locale: dfLocale })}
              {!sameDay && block.endDate && (
                <> – {format(parseDateOnly(block.endDate)!, "PPPP", { locale: dfLocale })}</>
              )}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">{t("modalViewHours")}</Label>
            <p className="font-medium">
              {block.isAllDay
                ? t("modalViewAllDay")
                : block.startTime && block.endTime
                ? `${block.startTime} – ${block.endTime}`
                : "—"}
            </p>
          </div>
          {block.reasonType && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">{t("modalViewReason")}</Label>
              <p className="font-medium">{t(REASON_KEYS[block.reasonType])}</p>
            </div>
          )}
          {block.reasonNote && (
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">{t("modalViewNote")}</Label>
              <p>{block.reasonNote}</p>
            </div>
          )}
          {block.status === "pending_approval" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              {t("modalViewPending")}
            </div>
          )}
        </div>
        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => onDelete(block.id)}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            {t("modalViewDelete")}
          </Button>
          <Button onClick={onClose}>{t("modalViewClose")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
