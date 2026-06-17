import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { enUS } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Title-case a person's name as they type: capitalises the first letter of
 * every word while preserving the spacing the user is typing (including a
 * trailing space). Lowercases the rest of each word so "jUAN" -> "Juan".
 * Hyphen/apostrophe-separated parts are each capitalised ("ana-maria" ->
 * "Ana-Maria", "o'brien" -> "O'Brien").
 */
export function capitalizeName(value: string): string {
  // Each run of letters (split by space, hyphen or apostrophe) gets its first
  // letter upper-cased and the rest lower-cased. Spacing is preserved as typed.
  return value.replace(
    /\p{L}+/gu,
    (part) => part.charAt(0).toLocaleUpperCase() + part.slice(1).toLocaleLowerCase(),
  );
}

/** Compose the canonical display name kept in `User.name`. */
export function composeName(
  firstName?: string | null,
  lastName?: string | null,
): string | null {
  const composed = [firstName, lastName]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" ");
  return composed || null;
}

/** Best-effort split of a single display name into first / last parts. */
export function splitName(name?: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  const trimmed = name?.trim();
  if (!trimmed) return { firstName: null, lastName: null };
  const [first, ...rest] = trimmed.split(/\s+/);
  return { firstName: first || null, lastName: rest.join(" ") || null };
}

/** Resolve date-fns locale object from locale string */
export function getDateLocale(locale?: string) {
  return locale === "en" ? enUS : es;
}

/**
 * Legacy currency formatter. New code should prefer `formatMoney(amount,
 * tenantCurrency)` from `lib/currency.ts` so the tenant's country drives the
 * currency code, symbol and Intl locale. This wrapper is kept for callers
 * that still pass explicit currency/locale strings.
 */
export function formatCurrency(amount: number, currency: string = "EUR", locale?: string): string {
  const code = currency.toUpperCase();
  const intlLocale = resolveLegacyIntlLocale(code, locale);
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${code} ${Math.round(amount).toLocaleString()}`;
  }
}

function resolveLegacyIntlLocale(currency: string, locale?: string): string {
  switch (currency) {
    case "MXN": return locale === "en" ? "en-MX" : "es-MX";
    case "USD": return locale === "es" ? "es-US" : "en-US";
    case "GBP": return "en-GB";
    case "ARS": return "es-AR";
    case "COP": return "es-CO";
    case "CLP": return "es-CL";
    case "PEN": return "es-PE";
    case "BRL": return "pt-BR";
    case "EUR":
    default:    return locale === "en" ? "en-IE" : "es-ES";
  }
}

export function formatDate(date: Date | string, locale?: string): string {
  const d = new Date(date);
  const loc = getDateLocale(locale);
  if (locale === "en") return format(d, "MMMM d, yyyy", { locale: loc });
  return format(d, "d 'de' MMMM, yyyy", { locale: loc });
}

/**
 * Convert a wall-clock time in a given IANA timezone to the equivalent UTC Date.
 * Example: zonedWallTimeToUtc(2026, 3, 23, 7, 0, "America/Mexico_City")
 *   → Date representing 07:00 in CDMX (i.e. 13:00 UTC during CST, 12:00 UTC during CDT).
 *
 * Uses Intl.DateTimeFormat to compute the offset; no external deps.
 */
export function zonedWallTimeToUtc(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuessMs = Date.UTC(year, monthIndex, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcGuessMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const zonedWallMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = zonedWallMs - utcGuessMs;
  return new Date(utcGuessMs - offsetMs);
}

/**
 * Extract the wall-clock components (year/month/day/hour/minute/weekday) of a
 * UTC instant as observed in the given IANA timezone. Useful for form prefill,
 * date-bucketing and hour-bucketing in UI that must respect the studio's TZ
 * regardless of the viewer's browser timezone.
 */
export function getWallClockInZone(
  date: Date | string,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const d = new Date(date);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = dtf.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

/** Returns "yyyy-MM-dd" for a UTC instant observed in the given timezone. */
export function formatDateInZone(date: Date | string, timeZone: string): string {
  const { year, month, day } = getWallClockInZone(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns "HH:mm" (24h) for a UTC instant observed in the given timezone. */
export function formatTime24InZone(date: Date | string, timeZone: string): string {
  const { hour, minute } = getWallClockInZone(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatTime(date: Date | string, timeZone?: string): string {
  const d = new Date(date);
  if (timeZone) {
    return d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    });
  }
  return format(d, "h:mm a");
}

export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatRelativeDay(date: Date | string, locale?: string): string {
  const d = new Date(date);
  const loc = getDateLocale(locale);
  if (isToday(d)) return locale === "en" ? "Today" : "Hoy";
  if (isTomorrow(d)) return locale === "en" ? "Tomorrow" : "Manana";
  if (locale === "en") return format(d, "EEEE, MMMM d", { locale: loc });
  return format(d, "EEEE d 'de' MMMM", { locale: loc });
}

export function formatShortDate(date: Date | string, locale?: string): string {
  const d = new Date(date);
  const loc = getDateLocale(locale);
  return format(d, "EEE d MMM", { locale: loc });
}

export function timeAgo(date: Date | string, locale?: string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: getDateLocale(locale) });
}

export function isClassPast(endsAt: Date | string): boolean {
  return isPast(new Date(endsAt));
}

export function getSpotStatus(spotsLeft: number, maxCapacity: number): "available" | "limited" | "almost-full" | "full" {
  if (spotsLeft <= 0) return "full";
  const ratio = spotsLeft / maxCapacity;
  if (ratio <= 0.15) return "almost-full";
  if (ratio <= 0.4) return "limited";
  return "available";
}

export function getSpotColor(status: ReturnType<typeof getSpotStatus>): string {
  switch (status) {
    case "available": return "text-green-600";
    case "limited": return "text-orange-500";
    case "almost-full": return "text-red-500";
    case "full": return "text-muted";
  }
}

/** Show "Sofía L." instead of "Sofía López" for privacy. */
export function maskLastName(name: string | null | undefined, locale?: string): string {
  if (!name) return locale === "en" ? "Someone" : "Alguien";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0];
  return `${parts[0]} ${parts[1][0]}.`;
}

const LEVEL_LABELS: Record<string, Record<string, string>> = {
  es: { BEGINNER: "Principiante", INTERMEDIATE: "Intermedio", ADVANCED: "Avanzado", ALL: "Todos los niveles" },
  en: { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced", ALL: "All Levels" },
};

export function getLevelLabel(level: string, locale?: string): string {
  const labels = LEVEL_LABELS[locale ?? "es"] ?? LEVEL_LABELS.es;
  return labels[level] || level;
}

export function generateCalendarUrl(
  title: string,
  startDate: Date,
  endDate: Date,
  location?: string,
  description?: string,
): string {
  const formatGoogleDate = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
    ...(location && { location }),
    ...(description && { details: description }),
  });

  return `https://www.google.com/calendar/render?${params.toString()}`;
}

/**
 * Parse a date-only value (a `@db.Date` column, serialised as `"2026-06-16"` or
 * `"2026-06-16T00:00:00.000Z"`) into a Date at LOCAL midnight.
 *
 * `new Date("2026-06-16")` parses as UTC midnight, so formatting it in a
 * negative-offset timezone (e.g. Mexico, UTC-6) renders the previous day. This
 * rebuilds the calendar date in local time so day-only values display correctly
 * everywhere. Returns null for empty input.
 */
export function parseDateOnly(
  value: string | Date | null | undefined,
): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return new Date(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    );
  }
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Return a higher-resolution variant of a profile image URL for enlarged views
 * (e.g. tapping an avatar to view it full-size). Google avatar URLs encode the
 * requested pixel size in their suffix and default to a tiny thumbnail
 * (~96px) — bump it so the enlarged view stays crisp. Non-Google URLs are
 * returned unchanged.
 */
export function highResImageUrl(
  url: string | null | undefined,
  size = 512,
): string | null | undefined {
  if (!url) return url;
  if (/googleusercontent\.com/.test(url)) {
    if (/=s\d+(-c)?/.test(url)) {
      return url.replace(/=s\d+(-c)?/, (_m, c) => `=s${size}${c ?? ""}`);
    }
    if (/=w\d+-h\d+(-c)?/.test(url)) {
      return url.replace(/=w\d+-h\d+(-c)?/, (_m, c) => `=s${size}${c ?? ""}`);
    }
    return url.includes("=") ? url : `${url}=s${size}`;
  }
  return url;
}
