import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { enUS } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Resolve date-fns locale object from locale string */
export function getDateLocale(locale?: string) {
  return locale === "en" ? enUS : es;
}

/** Resolve Intl locale string for number/currency formatting */
function getIntlLocale(locale?: string, currency?: string): string {
  if (locale === "en") return currency === "MXN" ? "en-MX" : "en-US";
  return currency === "MXN" ? "es-MX" : "es-ES";
}

export function formatCurrency(amount: number, currency: string = "EUR", locale?: string): string {
  return new Intl.NumberFormat(getIntlLocale(locale, currency), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string, locale?: string): string {
  const d = new Date(date);
  const loc = getDateLocale(locale);
  if (locale === "en") return format(d, "MMMM d, yyyy", { locale: loc });
  return format(d, "d 'de' MMMM, yyyy", { locale: loc });
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
