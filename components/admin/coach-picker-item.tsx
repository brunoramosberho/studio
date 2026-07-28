"use client";

import { useTranslations } from "next-intl";
import { SelectItem } from "@/components/ui/select";

// Shared instructor-picker row: the class form (Schedule) and the admin
// substitutions assign dialog both render coaches enriched with the same
// availability + workload context from /api/admin/coaches/picker.

export type PickerStatus =
  | "preferred"
  | "ok_if_needed"
  | "available_unconfigured"
  | "no_availability"
  | "time_off"
  | "conflict";

export interface PickerCoach {
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

// Renders one row in an instructor dropdown, enriched with availability
// status (pill on the right) and workload/adjacency context (subline).
// Only hard conflicts (already teaching another class at the same time)
// are physically impossible and disable selection. Everything else is a
// soft warning — the admin may have context outside the system to
// override (e.g. the coach already agreed to cover).
export function CoachPickerItem({ coach: c }: { coach: PickerCoach }) {
  const t = useTranslations("admin.classForm");
  const disabled = c.status === "conflict";

  const pill = (() => {
    switch (c.status) {
      case "preferred":
        return null;
      case "ok_if_needed":
        return { label: t("coachBackup"), tone: "amber" as const };
      case "available_unconfigured":
        return { label: t("coachUnconfigured"), tone: "neutral" as const };
      case "no_availability":
        return { label: t("coachOutsideHours"), tone: "muted" as const };
      case "time_off":
        return { label: t("coachAway"), tone: "rose" as const };
      case "conflict":
        return { label: t("coachHasClass"), tone: "rose" as const };
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
      t("coachSubConflict", {
        name: c.conflictClass.name,
        time: new Date(c.conflictClass.startsAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      }),
    );
  }
  if (c.priorClass) {
    subParts.push(
      t("coachSubPrior", {
        name: c.priorClass.name,
        min: c.priorClass.gapMinutes,
      }),
    );
  }
  if (c.followingClass) {
    subParts.push(
      t("coachSubFollowing", {
        name: c.followingClass.name,
        min: c.followingClass.gapMinutes,
      }),
    );
  }
  if (c.classesThisDay > 0) {
    subParts.push(t("coachSubToday", { count: c.classesThisDay }));
  }
  if (c.classesThisWeek > 0) {
    subParts.push(t("coachSubWeek", { count: c.classesThisWeek }));
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
