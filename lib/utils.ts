import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isToday, isTomorrow, isPast } from "date-fns";
import { es } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: string = "MXN"): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return format(d, "d 'de' MMMM, yyyy", { locale: es });
}

export function formatTime(date: Date | string): string {
  const d = new Date(date);
  return format(d, "h:mm a");
}

export function formatTimeRange(start: Date | string, end: Date | string): string {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

export function formatRelativeDay(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return "Hoy";
  if (isTomorrow(d)) return "Mañana";
  return format(d, "EEEE d 'de' MMMM", { locale: es });
}

export function formatShortDate(date: Date | string): string {
  const d = new Date(date);
  return format(d, "EEE d MMM", { locale: es });
}

export function timeAgo(date: Date | string): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: es });
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

export function getLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    BEGINNER: "Principiante",
    INTERMEDIATE: "Intermedio",
    ADVANCED: "Avanzado",
    ALL: "Todos los niveles",
  };
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
