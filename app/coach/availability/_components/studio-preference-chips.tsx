"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Check, MinusCircle, AlertCircle } from "lucide-react";

export type StudioPrefValue = "preferred" | "ok_if_needed" | "unavailable";

interface StudioPreferenceChipsProps {
  studios: { id: string; name: string }[];
  value: Record<string, StudioPrefValue>; // studioId → pref
  onChange: (next: Record<string, StudioPrefValue>) => void;
  disabled?: boolean;
}

/**
 * Per-studio preference selector — three states per studio:
 *   preferred (green)  · ok_if_needed (amber)  · unavailable (red)
 *
 * Click a state to toggle. When the tenant only has one studio, render
 * is suppressed and the parent should default the value to `preferred`.
 */
export function StudioPreferenceChips({
  studios,
  value,
  onChange,
  disabled,
}: StudioPreferenceChipsProps) {
  const t = useTranslations("coach.calendar");
  if (studios.length === 0) return null;
  if (studios.length === 1) {
    // Single-studio tenants: no point in asking — show a quiet hint instead.
    return (
      <p className="text-muted-foreground text-xs">
        {t("studioSingleHint", { name: studios[0].name })}
      </p>
    );
  }

  const options: { key: StudioPrefValue; label: string; icon: typeof Check; classes: string }[] = [
    {
      key: "preferred",
      label: t("prefYes"),
      icon: Check,
      classes:
        "bg-emerald-100 text-emerald-800 ring-emerald-500/60 dark:bg-emerald-500/15 dark:text-emerald-300",
    },
    {
      key: "ok_if_needed",
      label: t("prefIfUrgent"),
      icon: AlertCircle,
      classes:
        "bg-amber-100 text-amber-800 ring-amber-500/60 dark:bg-amber-500/15 dark:text-amber-300",
    },
    {
      key: "unavailable",
      label: t("prefNo"),
      icon: MinusCircle,
      classes:
        "bg-rose-100 text-rose-800 ring-rose-500/60 dark:bg-rose-500/15 dark:text-rose-300",
    },
  ];

  return (
    <div className="space-y-2">
      {studios.map((s) => {
        const v = value[s.id] ?? "unavailable";
        return (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{s.name}</span>
            <div className="inline-flex overflow-hidden rounded-full border">
              {options.map((opt) => {
                const Icon = opt.icon;
                const active = v === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...value, [s.id]: opt.key })}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs transition",
                      active
                        ? cn(opt.classes, "ring-2 ring-inset")
                        : "bg-transparent text-muted-foreground hover:bg-muted",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
