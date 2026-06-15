"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Birth-date picker built from three native-feeling dropdowns (day / month /
 * year). Month names are localised; the day list clamps to the number of days
 * in the selected month/year so impossible dates (Feb 30) can't be produced.
 *
 * `value` and `onChange` use an ISO `YYYY-MM-DD` string (no time component) so
 * it round-trips cleanly with `User.birthday` (a date-only column).
 */
export function DateOfBirthPicker({
  value,
  onChange,
  disabled,
  minAge = 12,
  maxAge = 100,
  className,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  minAge?: number;
  maxAge?: number;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("common");

  const [year, month, day] = useMemo(() => {
    if (!value) return [null, null, null] as const;
    const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
    return [
      Number.isFinite(y) ? y : null,
      Number.isFinite(m) ? m : null,
      Number.isFinite(d) ? d : null,
    ] as const;
  }, [value]);

  const now = new Date();
  const maxYear = now.getFullYear() - minAge;
  const minYear = now.getFullYear() - maxAge;

  const months = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: "long" });
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      // Capitalise so locales that lowercase month names read cleanly here.
      label: (() => {
        const name = fmt.format(new Date(2000, i, 1));
        return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
      })(),
    }));
  }, [locale]);

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i),
    [maxYear, minYear],
  );

  const daysInMonth =
    month && year
      ? new Date(year, month, 0).getDate()
      : month
        ? new Date(2000, month, 0).getDate() // leap-safe default for Feb before a year is picked
        : 31;
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth],
  );

  function emit(nextDay: number | null, nextMonth: number | null, nextYear: number | null) {
    if (nextDay && nextMonth && nextYear) {
      // Clamp day if the new month/year has fewer days than the selected day.
      const max = new Date(nextYear, nextMonth, 0).getDate();
      const d = Math.min(nextDay, max);
      onChange(
        `${nextYear}-${String(nextMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      );
    } else {
      onChange(null);
    }
  }

  return (
    <div className={cn("grid grid-cols-[1fr_1.4fr_1fr] gap-2", className)}>
      {/* Day */}
      <Select
        value={day ? String(day) : undefined}
        onValueChange={(v) => emit(parseInt(v, 10), month, year)}
        disabled={disabled}
      >
        <SelectTrigger aria-label={t("dob.day")}>
          <SelectValue placeholder={t("dob.day")} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {days.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Month */}
      <Select
        value={month ? String(month) : undefined}
        onValueChange={(v) => emit(day, parseInt(v, 10), year)}
        disabled={disabled}
      >
        <SelectTrigger aria-label={t("dob.month")}>
          <SelectValue placeholder={t("dob.month")} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {months.map((m) => (
            <SelectItem key={m.value} value={String(m.value)}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Year */}
      <Select
        value={year ? String(year) : undefined}
        onValueChange={(v) => emit(day, month, parseInt(v, 10))}
        disabled={disabled}
      >
        <SelectTrigger aria-label={t("dob.year")}>
          <SelectValue placeholder={t("dob.year")} />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
