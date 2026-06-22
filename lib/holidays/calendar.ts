// Public-holiday (festivos) calendar used to auto-apply the CoachPayRate
// holiday surcharge. National holidays are computed per country/year so no one
// has to maintain a list; regional/local festivos are stored per tenant as
// TenantHoliday rows and merged on top.
//
// Dates are handled as UTC calendar days and keyed as "YYYY-MM-DD". Class
// start times are compared on the same UTC-day basis, matching how the rest of
// the pay calc already reads dates.

import { prisma } from "@/lib/db";

export type HolidayEntry = { date: string; name: string };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** UTC calendar-day key ("YYYY-MM-DD") for a Date. */
export function holidayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function fixed(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

// Easter Sunday via the Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// nth weekday of a month (weekday: 0=Sun..6=Sat, n: 1-based occurrence).
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7));
}

function spainHolidays(year: number): HolidayEntry[] {
  const goodFriday = addDays(easterSunday(year), -2);
  return [
    { date: fixed(year, 1, 1), name: "Año Nuevo" },
    { date: fixed(year, 1, 6), name: "Epifanía del Señor" },
    { date: holidayKey(goodFriday), name: "Viernes Santo" },
    { date: fixed(year, 5, 1), name: "Fiesta del Trabajo" },
    { date: fixed(year, 8, 15), name: "Asunción de la Virgen" },
    { date: fixed(year, 10, 12), name: "Fiesta Nacional de España" },
    { date: fixed(year, 11, 1), name: "Todos los Santos" },
    { date: fixed(year, 12, 6), name: "Día de la Constitución" },
    { date: fixed(year, 12, 8), name: "Inmaculada Concepción" },
    { date: fixed(year, 12, 25), name: "Navidad" },
  ];
}

function mexicoHolidays(year: number): HolidayEntry[] {
  // Días de descanso obligatorio (Ley Federal del Trabajo).
  return [
    { date: fixed(year, 1, 1), name: "Año Nuevo" },
    { date: holidayKey(nthWeekday(year, 2, 1, 1)), name: "Día de la Constitución" },
    { date: holidayKey(nthWeekday(year, 3, 1, 3)), name: "Natalicio de Benito Juárez" },
    { date: fixed(year, 5, 1), name: "Día del Trabajo" },
    { date: fixed(year, 9, 16), name: "Día de la Independencia" },
    { date: holidayKey(nthWeekday(year, 11, 1, 3)), name: "Día de la Revolución" },
    { date: fixed(year, 12, 25), name: "Navidad" },
  ];
}

/** National public holidays for a country/year. Empty for unsupported codes. */
export function nationalHolidays(
  countryCode: string | null | undefined,
  year: number,
): HolidayEntry[] {
  switch ((countryCode ?? "").toUpperCase()) {
    case "ES":
      return spainHolidays(year);
    case "MX":
      return mexicoHolidays(year);
    default:
      return [];
  }
}

function yearsBetween(from: Date, to: Date): number[] {
  const years: number[] = [];
  for (let y = from.getUTCFullYear(); y <= to.getUTCFullYear(); y++) years.push(y);
  return years;
}

/**
 * Set of holiday day-keys ("YYYY-MM-DD") that apply to a tenant over a date
 * range — national holidays for its country plus any custom TenantHoliday rows.
 * Used by the coach pay calc to decide whether a class earns the holiday bonus.
 */
export async function getTenantHolidaySet(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<Set<string>> {
  const [tenant, custom] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { defaultCountry: { select: { code: true } } },
    }),
    prisma.tenantHoliday.findMany({
      where: { tenantId, date: { gte: from, lte: to } },
      select: { date: true },
    }),
  ]);

  const set = new Set<string>();
  const code = tenant?.defaultCountry?.code ?? null;
  for (const year of yearsBetween(from, to)) {
    for (const h of nationalHolidays(code, year)) set.add(h.date);
  }
  for (const c of custom) set.add(holidayKey(new Date(c.date)));
  return set;
}
