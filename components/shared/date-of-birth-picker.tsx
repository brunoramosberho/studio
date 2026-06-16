"use client";

import { useEffect, useMemo, useState } from "react";
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
 *
 * The three sub-selections live in local state so a partial pick (e.g. only the
 * day) persists while the user completes the rest — `onChange` only fires a full
 * ISO date once all three are chosen, or `null` otherwise. Local state stays in
 * sync with `value` when it changes externally (e.g. an async profile pre-fill).
 */
interface Parts {
  day: number | null;
  month: number | null;
  year: number | null;
}

function parseValue(value: string | null): Parts {
  if (!value) return { day: null, month: null, year: null };
  const [y, m, d] = value.split("-").map((n) => parseInt(n, 10));
  return {
    year: Number.isFinite(y) ? y : null,
    month: Number.isFinite(m) ? m : null,
    day: Number.isFinite(d) ? d : null,
  };
}

function compose(parts: Parts): string | null {
  const { day, month, year } = parts;
  if (!day || !month || !year) return null;
  // Clamp the day if the chosen month/year has fewer days (Feb 30 → Feb 28/29).
  const max = new Date(year, month, 0).getDate();
  const d = Math.min(day, max);
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

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

  const [parts, setParts] = useState<Parts>(() => parseValue(value));

  // Adopt the controlled value when it changes externally (pre-fill / reset),
  // but don't clobber an in-progress partial selection — while the user is
  // mid-pick `value` stays null and `compose(parts)` is also null, so they
  // match and we leave local state alone.
  useEffect(() => {
    if (value !== compose(parts)) {
      setParts(parseValue(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only on `value`
  }, [value]);

  const { day, month, year } = parts;

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

  function update(patch: Partial<Parts>) {
    const next: Parts = { ...parts, ...patch };
    // Clamp the day if the new month/year can't hold it.
    if (next.day && next.month) {
      const max = new Date(next.year ?? 2000, next.month, 0).getDate();
      if (next.day > max) next.day = max;
    }
    setParts(next);
    onChange(compose(next));
  }

  return (
    <div className={cn("grid grid-cols-[1fr_1.4fr_1fr] gap-2", className)}>
      {/* Day */}
      <Select
        value={day ? String(day) : undefined}
        onValueChange={(v) => update({ day: parseInt(v, 10) })}
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
        onValueChange={(v) => update({ month: parseInt(v, 10) })}
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
        onValueChange={(v) => update({ year: parseInt(v, 10) })}
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
